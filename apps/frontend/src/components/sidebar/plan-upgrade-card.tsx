import { trackCtaUpgrade } from '@/lib/analytics/gtm';
import { useState } from 'react';
import { PlanSelectionModal } from '../billing/pricing/plan-selection-modal';
import { Button } from '../ui/button';
import Image from 'next/image';
import { CreditCard, Sparkles } from 'lucide-react';

export const PlanUpgradeCard = () => {
  const [showPlanModal, setShowPlanModal] = useState(false);

  return (
    <>
      <div
        className="relative rounded-xl overflow-hidden border border-purple-300/30 dark:border-purple-500/20 bg-gradient-to-r from-purple-100/80 via-purple-50/40 to-white dark:from-purple-950/40 dark:via-purple-900/20 dark:to-[#111111] cursor-pointer group hover:border-purple-400/40 dark:hover:border-purple-500/30 transition-colors"
        onClick={() => {
          trackCtaUpgrade();
          setShowPlanModal(true);
        }}
      >
        <div className="flex items-center gap-3 py-1 px-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-800 dark:text-white/90 truncate">Upgrade to Pro</p>
            <p className="text-[10px] text-gray-500 dark:text-white/40 truncate mb-1.5">Get your own computer</p>
            <Button
              size="sm"
              className="h-7 text-xs px-2.5 bg-purple-600 hover:bg-purple-700 dark:bg-purple-600/30 dark:hover:bg-purple-600/40 text-white dark:text-purple-200 border-0 dark:border dark:border-purple-500/20 dark:hover:border-purple-500/30"
              onClick={(e) => {
                e.stopPropagation();
                trackCtaUpgrade();
                setShowPlanModal(true);
              }}
            >
              <CreditCard className="h-1.5 w-1.5" />
              Upgrade
            </Button>
          </div>
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
            <Image
              src="/kortix-computer.png"
              alt="Kortix Pro"
              fill
              className="object-contain opacity-80 group-hover:opacity-100 transition-opacity"
            />
          </div>
        </div>
      </div>
      <PlanSelectionModal
        open={showPlanModal}
        onOpenChange={setShowPlanModal}
        returnUrl={typeof window !== 'undefined' ? window?.location?.href || '/' : '/'}
      />
    </>
  );
};
