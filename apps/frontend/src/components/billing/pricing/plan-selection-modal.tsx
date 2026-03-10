'use client';

import * as React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { PricingSection } from './pricing-section';
import { usePricingModalStore } from '@/stores/pricing-modal-store';
import { trackRouteChangeForModal } from '@/lib/analytics/gtm';

interface PlanSelectionModalProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    returnUrl?: string;
    creditsExhausted?: boolean;
    upgradeReason?: string;
}

export function PlanSelectionModal({
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
    returnUrl: controlledReturnUrl,
    creditsExhausted = false,
    upgradeReason: controlledUpgradeReason,
}: PlanSelectionModalProps) {
    const defaultReturnUrl = typeof window !== 'undefined' ? `${window.location.origin}/dashboard?subscription=success` : '/';

    const { isOpen: storeIsOpen, customTitle: storeCustomTitle, returnUrl: storeReturnUrl, closePricingModal, isAlert: storeIsAlert, alertTitle: storeAlertTitle, alertSubtitle: storeAlertSubtitle } = usePricingModalStore();

    const isOpen = controlledOpen !== undefined ? controlledOpen : storeIsOpen;
    const onOpenChange = controlledOnOpenChange || ((open: boolean) => !open && closePricingModal());
    const returnUrl = controlledReturnUrl || storeReturnUrl || defaultReturnUrl;
    const displayReason = controlledUpgradeReason || storeCustomTitle;

    React.useEffect(() => {
        if (isOpen) {
            trackRouteChangeForModal('plans');
        }
    }, [isOpen]);

    const handleSubscriptionUpdate = () => {
        setTimeout(() => { onOpenChange(false); }, 500);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="p-0 gap-0 overflow-hidden w-[min(95vw,740px)] max-h-[90vh] overflow-y-auto rounded-2xl border border-foreground/[0.08]"
                hideCloseButton={true}
            >
                <DialogTitle className="sr-only">
                    {displayReason || (creditsExhausted ? "You're out of credits" : 'Select a Plan')}
                </DialogTitle>
                <DialogDescription className="sr-only">
                    {displayReason || (creditsExhausted ? 'Choose a plan to continue using Kortix' : 'Choose the plan that best fits your needs')}
                </DialogDescription>

                {/* Close */}
                <button
                    onClick={() => onOpenChange(false)}
                    className="absolute top-4 right-4 z-50 p-2 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
                >
                    <X className="size-4" />
                </button>

                <PricingSection
                    returnUrl={returnUrl || defaultReturnUrl}
                    showTitleAndTabs={false}
                    insideDialog={true}
                    noPadding={true}
                    customTitle={displayReason || (creditsExhausted ? 'You ran out of credits. Upgrade now.' : undefined)}
                    isAlert={storeIsAlert}
                    alertTitle={storeAlertTitle}
                    alertSubtitle={storeAlertSubtitle}
                    onSubscriptionUpdate={handleSubscriptionUpdate}
                    showBuyCredits={true}
                />
            </DialogContent>
        </Dialog>
    );
}
