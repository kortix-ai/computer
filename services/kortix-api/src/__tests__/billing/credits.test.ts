import { describe, test, expect, beforeEach } from 'bun:test';
import {
  createMockCreditAccount,
  createMockSupabaseRpc,
  createMockStripeClient,
  mockRegistry,
  registerGlobalMocks,
  resetMockRegistry,
} from './mocks';

// Register global mocks once
registerGlobalMocks();

// ─── Track calls ──────────────────────────────────────────────────────────────

let rpcCalls: { name: string; params: any }[] = [];
let updateCalls: { accountId: string; data: any }[] = [];
let insertLedgerCalls: any[] = [];

beforeEach(() => {
  rpcCalls = [];
  updateCalls = [];
  insertLedgerCalls = [];
  resetMockRegistry();

  const defaultAccount = createMockCreditAccount();

  // Configure supabase RPC tracking
  mockRegistry.supabaseRpc = {
    rpc: (name: string, params?: any) => {
      rpcCalls.push({ name, params });
      return Promise.resolve({ data: null, error: null });
    },
  };

  // Configure credit account repo defaults
  mockRegistry.getCreditAccount = async () => defaultAccount;
  mockRegistry.getCreditBalance = async () => ({
    balance: defaultAccount.balance,
    expiringCredits: defaultAccount.expiringCredits,
    nonExpiringCredits: defaultAccount.nonExpiringCredits,
    dailyCreditsBalance: defaultAccount.dailyCreditsBalance,
    tier: defaultAccount.tier,
  });
  mockRegistry.updateCreditAccount = async (id: string, data: any) => {
    updateCalls.push({ accountId: id, data });
  };
  mockRegistry.insertLedgerEntry = async (data: any) => {
    insertLedgerCalls.push(data);
    return { id: 'ledger_test_123', ...data };
  };
});

// Import AFTER mocking
const { calculateTokenCost, getBalance, getCreditSummary, deductCredits, grantCredits, resetExpiringCredits, refreshDailyCredits } =
  await import('../../billing/services/credits');

const { TOKEN_PRICE_MULTIPLIER } = await import('../../billing/services/tiers');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('calculateTokenCost', () => {
  test('known model (claude-sonnet-4-5): correct cost with 1.2x multiplier', () => {
    const cost = calculateTokenCost(1_000_000, 1_000_000, 'claude-sonnet-4-5');
    const expected = (3 + 15) * TOKEN_PRICE_MULTIPLIER;
    expect(cost).toBeCloseTo(expected, 6);
  });

  test('partial model match (claude-sonnet-4-5-20250101)', () => {
    const cost = calculateTokenCost(1_000_000, 1_000_000, 'claude-sonnet-4-5-20250101');
    const expected = (3 + 15) * TOKEN_PRICE_MULTIPLIER;
    expect(cost).toBeCloseTo(expected, 6);
  });

  test('unknown model falls back to default pricing', () => {
    const cost = calculateTokenCost(1_000_000, 1_000_000, 'some-unknown-model');
    const expected = (2 + 10) * TOKEN_PRICE_MULTIPLIER;
    expect(cost).toBeCloseTo(expected, 6);
  });

  test('0 tokens returns 0 cost', () => {
    const cost = calculateTokenCost(0, 0, 'claude-sonnet-4-5');
    expect(cost).toBe(0);
  });
});

describe('getBalance', () => {
  test('returns breakdown from credit account', async () => {
    const result = await getBalance('acc_test_123');
    expect(result.balance).toBe(100);
    expect(result.expiring).toBe(80);
    expect(result.nonExpiring).toBe(20);
    expect(result.daily).toBe(3);
  });

  test('returns zeros when account not found', async () => {
    mockRegistry.getCreditBalance = async () => null;
    const result = await getBalance('nonexistent');
    expect(result).toEqual({ balance: 0, expiring: 0, nonExpiring: 0, daily: 0 });
  });
});

describe('getCreditSummary', () => {
  test('canRun=true when balance >= 0.01', async () => {
    const result = await getCreditSummary('acc_test_123');
    expect(result.canRun).toBe(true);
    expect(result.total).toBe(100);
    expect(result.daily).toBe(3);
    expect(result.monthly).toBe(80);
    expect(result.extra).toBe(20);
  });

  test('canRun=false when balance < 0.01', async () => {
    mockRegistry.getCreditAccount = async () =>
      createMockCreditAccount({ balance: '0.005', expiringCredits: '0', nonExpiringCredits: '0', dailyCreditsBalance: '0' });
    const result = await getCreditSummary('acc_test_123');
    expect(result.canRun).toBe(false);
  });
});

describe('deductCredits', () => {
  test('calls atomic_use_credits RPC with correct params', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_use_credits: {
        data: { success: true, amount_deducted: 5, new_total: 95, transaction_id: 'tx_123' },
      },
    });

    await deductCredits('acc_test_123', 5, 'Test deduction', 'thread_1', 'msg_1');

    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].name).toBe('atomic_use_credits');
    expect(rpcCalls[0].params).toEqual({
      p_account_id: 'acc_test_123',
      p_amount: 5,
      p_description: 'Test deduction',
      p_thread_id: 'thread_1',
      p_message_id: 'msg_1',
    });
  });

  test('returns { success, cost, newBalance, transactionId }', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_use_credits: {
        data: { success: true, amount_deducted: 5, new_total: 95, transaction_id: 'tx_123' },
      },
    });

    const result = await deductCredits('acc_test_123', 5, 'Test deduction');
    expect(result.success).toBe(true);
    expect(result.cost).toBe(5);
    expect(result.newBalance).toBe(95);
    expect(result.transactionId).toBe('tx_123');
  });

  test('throws InsufficientCreditsError on RPC error with actual balance', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_use_credits: { error: { message: 'Insufficient credits' } },
    });

    try {
      await deductCredits('acc_test_123', 200, 'Too much');
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.name).toBe('InsufficientCreditsError');
      expect(err.balance).toBe(100);
      expect(err.required).toBe(200);
    }
  });

  test('throws InsufficientCreditsError when success=false', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_use_credits: {
        data: { success: false, error: 'Not enough credits' },
      },
    });

    try {
      await deductCredits('acc_test_123', 200, 'Too much');
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.name).toBe('InsufficientCreditsError');
    }
  });

  test('passes null when threadId/messageId omitted', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_use_credits: {
        data: { success: true, amount_deducted: 1, new_total: 99, transaction_id: 'tx_456' },
      },
    });

    await deductCredits('acc_test_123', 1, 'Test');
    expect(rpcCalls[0].params.p_thread_id).toBeNull();
    expect(rpcCalls[0].params.p_message_id).toBeNull();
  });
});

describe('grantCredits', () => {
  test('calls atomic_add_credits with correct params', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_add_credits: { data: { success: true } },
    });

    await grantCredits('acc_test_123', 100, 'tier_grant', 'Monthly grant', true, 'evt_123');

    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].name).toBe('atomic_add_credits');
    expect(rpcCalls[0].params).toEqual({
      p_account_id: 'acc_test_123',
      p_amount: 100,
      p_type: 'tier_grant',
      p_description: 'Monthly grant',
      p_is_expiring: true,
      p_stripe_event_id: 'evt_123',
    });
  });

  test('expiring=true grants expiring credits', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_add_credits: { data: { success: true } },
    });

    await grantCredits('acc_test_123', 50, 'tier_grant', 'Grant', true);
    expect(rpcCalls[0].params.p_is_expiring).toBe(true);
  });

  test('expiring=false grants non-expiring credits', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_add_credits: { data: { success: true } },
    });

    await grantCredits('acc_test_123', 50, 'purchase', 'Purchase', false);
    expect(rpcCalls[0].params.p_is_expiring).toBe(false);
  });

  test('includes stripeEventId for idempotency', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_add_credits: { data: { success: true } },
    });

    await grantCredits('acc_test_123', 50, 'tier_grant', 'Grant', true, 'evt_idempotent_123');
    expect(rpcCalls[0].params.p_stripe_event_id).toBe('evt_idempotent_123');
  });

  test('fallback on RPC error: inserts ledger + updates balance additively (not overwrite)', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_add_credits: { error: { message: 'RPC failed' } },
    });

    const account = createMockCreditAccount({ balance: '100.0000', expiringCredits: '80.0000' });
    mockRegistry.getCreditAccount = async () => account;

    await grantCredits('acc_test_123', 50, 'tier_grant', 'Fallback grant', true, 'evt_fallback');

    expect(insertLedgerCalls.length).toBe(1);
    expect(insertLedgerCalls[0].amount).toBe(String(50));
    expect(insertLedgerCalls[0].stripeEventId).toBe('evt_fallback');

    expect(updateCalls.length).toBe(1);
    expect(Number(updateCalls[0].data.balance)).toBe(150);
    expect(Number(updateCalls[0].data.expiringCredits)).toBe(130);
  });

  test('fallback on RPC error for non-expiring: updates nonExpiringCredits additively', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_add_credits: { error: { message: 'RPC failed' } },
    });

    const account = createMockCreditAccount({
      balance: '100.0000',
      nonExpiringCredits: '20.0000',
    });
    mockRegistry.getCreditAccount = async () => account;

    await grantCredits('acc_test_123', 30, 'purchase', 'Credit purchase', false);

    expect(updateCalls.length).toBe(1);
    expect(Number(updateCalls[0].data.nonExpiringCredits)).toBe(50);
    expect(Number(updateCalls[0].data.balance)).toBe(130);
  });
});

describe('resetExpiringCredits', () => {
  test('calls atomic_reset_expiring_credits RPC', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_reset_expiring_credits: { data: null },
    });

    await resetExpiringCredits('acc_test_123', 100, 'Monthly reset', 'evt_reset');

    expect(rpcCalls.length).toBe(1);
    expect(rpcCalls[0].name).toBe('atomic_reset_expiring_credits');
    expect(rpcCalls[0].params).toEqual({
      p_account_id: 'acc_test_123',
      p_description: 'Monthly reset',
      p_new_credits: 100,
      p_stripe_event_id: 'evt_reset',
    });
  });

  test('logs error but does not throw on failure', async () => {
    mockRegistry.supabaseRpc = createMockSupabaseRpc({
      atomic_reset_expiring_credits: { error: { message: 'RPC failed' } },
    });

    await resetExpiringCredits('acc_test_123', 100, 'Reset', 'evt_fail');
    expect(true).toBe(true);
  });
});

describe('refreshDailyCredits', () => {
  test('returns null for non-free tier', async () => {
    const result = await refreshDailyCredits('acc_test_123', 'tier_6_50');
    expect(result).toBeNull();
  });

  test('returns null when account not found', async () => {
    mockRegistry.getCreditAccount = async () => null;
    const result = await refreshDailyCredits('acc_test_123', 'free');
    expect(result).toBeNull();
  });

  test('returns null when < 24h since last refresh', async () => {
    mockRegistry.getCreditAccount = async () =>
      createMockCreditAccount({
        tier: 'free',
        lastDailyRefresh: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        dailyCreditsBalance: '3.00',
        balance: '3.0000',
      });

    const result = await refreshDailyCredits('acc_test_123', 'free');
    expect(result).toBeNull();
  });

  test('grants daily credits when >= 24h elapsed', async () => {
    mockRegistry.getCreditAccount = async () =>
      createMockCreditAccount({
        tier: 'free',
        lastDailyRefresh: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        dailyCreditsBalance: '3.00',
        balance: '3.0000',
      });

    const result = await refreshDailyCredits('acc_test_123', 'free');
    expect(result).not.toBeNull();
    expect(result!.granted).toBe(3);
    expect(result!.newDaily).toBe(6);
    expect(result!.newBalance).toBe(6);
  });

  test('caps at maxAccumulation (21)', async () => {
    mockRegistry.getCreditAccount = async () =>
      createMockCreditAccount({
        tier: 'free',
        lastDailyRefresh: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        dailyCreditsBalance: '20.00',
        balance: '20.0000',
      });

    const result = await refreshDailyCredits('acc_test_123', 'free');
    expect(result).not.toBeNull();
    expect(result!.granted).toBe(1);
    expect(result!.newDaily).toBe(21);
  });

  test('handles first refresh (null lastDailyRefresh)', async () => {
    mockRegistry.getCreditAccount = async () =>
      createMockCreditAccount({
        tier: 'free',
        lastDailyRefresh: null,
        dailyCreditsBalance: '0.00',
        balance: '0.0000',
      });

    const result = await refreshDailyCredits('acc_test_123', 'free');
    expect(result).not.toBeNull();
    expect(result!.granted).toBe(3);
    expect(result!.newDaily).toBe(3);
  });
});
