/**
 * Auto-topup service.
 *
 * When a Pro user's credit balance drops below their configured threshold,
 * we charge their Stripe default payment method off-session and grant credits.
 *
 * Constraints:
 *   threshold  >= $5
 *   amount     >= $15
 *   amount     >= 2 * threshold
 */

import { getStripe } from '../../shared/stripe';
import { getCreditAccount, updateCreditAccount } from '../repositories/credit-accounts';
import { getCustomerByAccountId } from '../repositories/customers';
import { grantCredits } from './credits';
import { isPaidTier } from './tiers';
import { BillingError } from '../../errors';

// ─── Validation Constants ────────────────────────────────────────────────────

export const AUTO_TOPUP_MIN_THRESHOLD = 5;    // $5
export const AUTO_TOPUP_MIN_AMOUNT = 15;      // $15

/** Minimum 10 seconds between auto-topup charges to prevent rapid-fire. */
const CHARGE_COOLDOWN_MS = 10_000;

// ─── Configure ──────────────────────────────────────────────────────────────

export interface AutoTopupConfig {
  enabled: boolean;
  threshold: number;  // dollars
  amount: number;     // dollars
}

export function validateAutoTopupConfig(cfg: AutoTopupConfig): string | null {
  if (!cfg.enabled) return null; // disabling always valid

  if (cfg.threshold < AUTO_TOPUP_MIN_THRESHOLD) {
    return `Threshold must be at least $${AUTO_TOPUP_MIN_THRESHOLD}`;
  }
  if (cfg.amount < AUTO_TOPUP_MIN_AMOUNT) {
    return `Reload amount must be at least $${AUTO_TOPUP_MIN_AMOUNT}`;
  }
  if (cfg.amount < cfg.threshold * 2) {
    return `Reload amount must be at least 2x the threshold ($${cfg.threshold * 2})`;
  }
  return null;
}

export async function configureAutoTopup(accountId: string, cfg: AutoTopupConfig) {
  const account = await getCreditAccount(accountId);
  if (!account) throw new BillingError('Account not found');

  const tierName = account.tier ?? 'free';
  if (!isPaidTier(tierName)) {
    throw new BillingError('Auto-topup is only available for paid plans');
  }

  const error = validateAutoTopupConfig(cfg);
  if (error) throw new BillingError(error);

  await updateCreditAccount(accountId, {
    autoTopupEnabled: cfg.enabled,
    autoTopupThreshold: String(cfg.threshold),
    autoTopupAmount: String(cfg.amount),
  } as any);

  // If enabling and balance is already at or below threshold, charge immediately.
  if (cfg.enabled) {
    const balance = Number(account.balance) || 0;
    if (balance <= cfg.threshold) {
      void tryAutoTopup(accountId).catch((err) => {
        console.error(`[AutoTopup] Immediate charge failed for ${accountId}:`, err);
      });
    }
  }

  return { success: true };
}

export async function getAutoTopupSettings(accountId: string) {
  const account = await getCreditAccount(accountId);
  if (!account) return { enabled: false, threshold: AUTO_TOPUP_MIN_THRESHOLD, amount: AUTO_TOPUP_MIN_AMOUNT };

  return {
    enabled: Boolean(account.autoTopupEnabled),
    threshold: Number(account.autoTopupThreshold) || AUTO_TOPUP_MIN_THRESHOLD,
    amount: Number(account.autoTopupAmount) || AUTO_TOPUP_MIN_AMOUNT,
  };
}

// ─── Trigger (called after credit deduction) ─────────────────────────────────

/**
 * Check if auto-topup should fire after a credit deduction.
 * Safe to call fire-and-forget — never throws, logs errors.
 */
export async function checkAndTriggerAutoTopup(accountId: string): Promise<void> {
  try {
    await tryAutoTopup(accountId);
  } catch (err) {
    console.error(`[AutoTopup] Error for ${accountId}:`, err);
  }
}

async function tryAutoTopup(accountId: string): Promise<void> {
  const account = await getCreditAccount(accountId);
  if (!account) return;
  if (!account.autoTopupEnabled) return;

  const tierName = account.tier ?? 'free';
  if (!isPaidTier(tierName)) return;

  const balance = Number(account.balance) || 0;
  const threshold = Number(account.autoTopupThreshold) || AUTO_TOPUP_MIN_THRESHOLD;
  const amount = Number(account.autoTopupAmount) || AUTO_TOPUP_MIN_AMOUNT;

  if (balance > threshold) return;

  // Cooldown: don't charge more than once per CHARGE_COOLDOWN_MS
  if (account.autoTopupLastCharged) {
    const lastCharged = new Date(account.autoTopupLastCharged).getTime();
    if (Date.now() - lastCharged < CHARGE_COOLDOWN_MS) {
      console.log(`[AutoTopup] Cooldown active for ${accountId}, skipping`);
      return;
    }
  }

  // Find the Stripe customer
  const customer = await getCustomerByAccountId(accountId);
  if (!customer) {
    console.warn(`[AutoTopup] No Stripe customer for ${accountId}`);
    return;
  }

  const stripe = getStripe();

  // Create an off-session payment intent using customer's default payment method
  try {
    const chargeWindow = Math.floor(Date.now() / CHARGE_COOLDOWN_MS);
    const idempotencyKey = `auto-topup:${accountId}:${amount.toFixed(2)}:${chargeWindow}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // cents
      currency: 'usd',
      customer: customer.id,
      off_session: true,
      confirm: true,
      description: `Auto-topup: $${amount} credits`,
      metadata: {
        account_id: accountId,
        type: 'auto_topup',
        threshold: String(threshold),
        amount: String(amount),
      },
    }, {
      idempotencyKey,
    });

    if (paymentIntent.status === 'succeeded') {
      // Grant non-expiring credits
      await grantCredits(
        accountId,
        amount,
        'purchase',
        `Auto-topup: $${amount.toFixed(2)} (balance was $${balance.toFixed(2)}, threshold $${threshold.toFixed(2)})`,
        false, // non-expiring
        paymentIntent.id,
      );

      await updateCreditAccount(accountId, {
        autoTopupLastCharged: new Date().toISOString(),
      } as any);

      console.log(`[AutoTopup] Charged $${amount} for ${accountId} (balance was $${balance.toFixed(2)})`);
    } else {
      console.warn(`[AutoTopup] Payment intent status: ${paymentIntent.status} for ${accountId}`);
    }
  } catch (err: any) {
    // Card declined or authentication required — log but don't crash
    console.error(`[AutoTopup] Payment failed for ${accountId}:`, err.message ?? err);

    // Mark last attempt to prevent rapid retries
    await updateCreditAccount(accountId, {
      autoTopupLastCharged: new Date().toISOString(),
    } as any);
  }
}
