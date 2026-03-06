'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { CheckIcon, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/lib/site-config';
import { createCheckoutSession, type AccountState } from '@/lib/api/billing';
import { toast } from '@/lib/toast';
import { isBillingEnabled } from '@/lib/config';
import { useAccountState } from '@/hooks/billing';
import { useAuth } from '@/components/AuthProvider';
import { ScheduledDowngradeCard } from '@/components/billing/scheduled-downgrade-card';
import { CreditPurchaseModal } from '@/components/billing/credit-purchase';

interface PricingSectionProps {
  returnUrl?: string;
  showTitleAndTabs?: boolean;
  hideFree?: boolean;
  insideDialog?: boolean;
  noPadding?: boolean;
  onSubscriptionUpdate?: () => void;
  customTitle?: string;
  isAlert?: boolean;
  alertTitle?: string;
  alertSubtitle?: string;
  showBuyCredits?: boolean;
  onboardingFlow?: boolean;
}

function PricingCard({
  tier,
  currentSubscription,
  isAuthenticated,
  isLoading,
  onSelect,
}: {
  tier: {
    name: string;
    description: string;
    price: string;
    features: string[];
    disabledFeatures?: string[];
    tierKey: string;
    isPopular?: boolean;
  };
  currentSubscription: AccountState | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  onSelect: (tierKey: string) => Promise<void>;
}) {
  const currentTierKey = currentSubscription?.subscription?.tier_key || 'none';
  const isCurrent = currentTierKey === tier.tierKey;
  const isProTier = tier.tierKey === 'pro';

  return (
    <div
      className={cn(
        'h-full rounded-2xl border p-6 bg-card flex flex-col',
        tier.isPopular ? 'border-primary/40 shadow-sm' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-medium text-foreground">{tier.name}</h3>
        {tier.isPopular && (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary">
            Most Popular
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>

      {isProTier && (
        <div className="relative mt-2 h-52 w-[calc(100%+3rem)] -mx-6 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary/20 via-primary/5 to-transparent" />
          <Image
            src="/kortix-computer.png"
            alt="Kortix Pro cloud computer"
            fill
            className="object-contain object-top scale-[1.65] -translate-y-8"
            priority
          />
        </div>
      )}

      <div className="mt-6 flex items-end gap-1">
        <span className="text-4xl font-medium leading-none">{tier.price}</span>
        <span className="text-sm text-muted-foreground mb-1">/month</span>
      </div>

      <Button
        className="mt-6"
        variant={tier.isPopular ? 'default' : 'outline'}
        disabled={isCurrent || isLoading}
        onClick={() => onSelect(tier.tierKey)}
      >
        {!isAuthenticated
          ? tier.tierKey === 'free'
            ? 'Get Started'
            : 'Upgrade to Pro'
          : isCurrent
            ? 'Current Plan'
            : tier.tierKey === 'free'
              ? 'Downgrade to Free'
              : 'Upgrade to Pro'}
      </Button>

      <ul className="mt-6 space-y-2">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-foreground/90">
            <CheckIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
        {(tier.disabledFeatures || []).map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground/70">
            <span className="h-4 w-4 mt-0.5 shrink-0 text-center">-</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PricingSection({
  returnUrl = typeof window !== 'undefined' ? window.location.href : '/',
  showTitleAndTabs = true,
  hideFree = false,
  noPadding = false,
  onSubscriptionUpdate,
  customTitle,
  isAlert = false,
  alertTitle,
  alertSubtitle,
  showBuyCredits = false,
  onboardingFlow = false,
}: PricingSectionProps) {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const { data: accountState, refetch } = useAccountState({ enabled: isAuthenticated });
  const [loadingByTier, setLoadingByTier] = useState<Record<string, boolean>>({});
  const [showCreditPurchaseModal, setShowCreditPurchaseModal] = useState(false);

  const visibleTiers = useMemo(
    () => siteConfig.cloudPricingItems.filter((tier) => !tier.hidden && (!hideFree || tier.tierKey !== 'free')),
    [hideFree],
  );

  const handleSelectTier = async (tierKey: string) => {
    if (!isAuthenticated) {
      window.location.href = '/auth?mode=signup';
      return;
    }

    const currentTierKey = accountState?.subscription?.tier_key || 'none';
    const isInitialFreeSelection = onboardingFlow && tierKey === 'free' && (currentTierKey === 'none' || currentTierKey === 'free');
    if (isInitialFreeSelection) {
      window.location.href = '/setting-up?plan=free';
      return;
    }

    try {
      setLoadingByTier((prev) => ({ ...prev, [tierKey]: true }));
      const response = await createCheckoutSession({
        tier_key: tierKey,
        success_url: returnUrl,
        cancel_url: typeof window !== 'undefined' ? window.location.href : returnUrl,
        commitment_type: 'monthly',
      });

      if (response.url || response.checkout_url) {
        window.location.href = response.url || response.checkout_url!;
        return;
      }

      if (response.message) {
        toast.success(response.message);
      }

      await refetch();
      onSubscriptionUpdate?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update plan');
    } finally {
      setLoadingByTier((prev) => ({ ...prev, [tierKey]: false }));
    }
  };

  if (!isBillingEnabled()) {
    return (
      <div className="p-4 bg-muted/30 border border-border rounded-lg text-center">
        <p className="text-sm text-muted-foreground">
          Billing is disabled in this environment.
        </p>
      </div>
    );
  }

  const hasScheduledChange = accountState?.subscription.has_scheduled_change && accountState?.subscription.scheduled_change;

  return (
    <section
      id="pricing"
      className={cn('w-full flex flex-col items-center relative', noPadding ? 'pb-0' : 'pb-12')}
    >
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 flex flex-col gap-4">
        {(showTitleAndTabs || isAlert) && (
          <div className="w-full">
            {isAlert ? (
              <div className="flex flex-col gap-1">
                <h2 className="text-lg sm:text-2xl lg:text-3xl font-medium tracking-tight text-foreground">
                  {alertTitle || 'Upgrade your plan'}
                </h2>
                {alertSubtitle && <p className="text-sm sm:text-base text-muted-foreground">{alertSubtitle}</p>}
              </div>
            ) : (
              <h2 className="text-lg sm:text-2xl lg:text-3xl font-medium tracking-tight">
                {customTitle || 'Choose your plan'}
              </h2>
            )}
          </div>
        )}

        {isAuthenticated && hasScheduledChange && accountState?.subscription.scheduled_change && (
          <ScheduledDowngradeCard
            scheduledChange={accountState.subscription.scheduled_change}
            variant="compact"
            onCancel={() => {
              void refetch();
              onSubscriptionUpdate?.();
            }}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {visibleTiers.map((tier) => (
            <PricingCard
              key={tier.tierKey}
              tier={tier}
              currentSubscription={accountState || null}
              isAuthenticated={isAuthenticated}
              isLoading={!!loadingByTier[tier.tierKey]}
              onSelect={handleSelectTier}
            />
          ))}
        </div>

        {showBuyCredits &&
          isAuthenticated &&
          accountState?.subscription.can_purchase_credits && (
            <div className="w-full mt-4 flex justify-center">
              <Button
                onClick={() => setShowCreditPurchaseModal(true)}
                variant="outline"
                size="lg"
                className="gap-2"
              >
                <ShoppingCart className="h-5 w-5" />
                Get Additional Credits
              </Button>
            </div>
          )}
      </div>

      <CreditPurchaseModal
        open={showCreditPurchaseModal}
        onOpenChange={setShowCreditPurchaseModal}
        currentBalance={accountState?.credits.total || 0}
        canPurchase={accountState?.subscription.can_purchase_credits || false}
        onPurchaseComplete={() => {
          void refetch();
          onSubscriptionUpdate?.();
        }}
      />
    </section>
  );
}
