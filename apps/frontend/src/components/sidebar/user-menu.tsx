'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronsUpDown,
  Heart,
  ChevronRight,
  Moon,
} from 'lucide-react';
import { useAccountState } from '@/hooks/billing';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { createClient } from '@/lib/supabase/client';
import { openTabAndNavigate } from '@/stores/tab-store';
import { useTheme } from 'next-themes';
import { isBillingEnabled } from '@/lib/config';

import { clearUserLocalStorage } from '@/lib/utils/clear-local-storage';
import { UserSettingsModal } from '@/components/settings/user-settings-modal';
import { PlanSelectionModal } from '@/components/billing/pricing';
import { TierBadge } from '@/components/billing/tier-badge';
import { useTranslations } from 'next-intl';
import { useReferralDialog } from '@/stores/referral-dialog';
import { ReferralDialog } from '@/components/referrals/referral-dialog';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { trackCtaUpgrade } from '@/lib/analytics/gtm';
import { ServerSelector } from '@/components/sidebar/server-selector';
import { useSleep } from '@/components/dashboard/sleep-overlay';
import {
  getItemsByGroup,
  themeOptions,
  type MenuItemDef,
  type SettingsTabId,
} from '@/lib/menu-registry';

// ============================================================================
// Types
// ============================================================================

interface UserMenuProps {
  user: {
    name: string;
    email: string;
    avatar: string;
    isAdmin?: boolean;
    planName?: string;
    planIcon?: string;
  };
}

type SettingsTab = SettingsTabId;

// ============================================================================
// Component
// ============================================================================

export function UserMenu({ user }: UserMenuProps) {
  const t = useTranslations('sidebar');
  const router = useRouter();
  const { isMobile } = useSidebar();
  const billingActive = isBillingEnabled();
  const { data: accountState } = useAccountState({ enabled: billingActive });
  const [showSettingsModal, setShowSettingsModal] = React.useState(false);
  const [showPlanModal, setShowPlanModal] = React.useState(false);
  const [settingsTab, setSettingsTab] = React.useState<SettingsTab>('general');
  const { isOpen: isReferralDialogOpen, openDialog: openReferralDialog, closeDialog: closeReferralDialog } = useReferralDialog();
  const { theme, setTheme } = useTheme();
  const { sleep } = useSleep();


  const isFreeTier = billingActive && (
    accountState?.subscription?.tier_key === 'free' ||
    accountState?.tier?.name === 'free' ||
    !accountState?.subscription?.tier_key
  );

  const openSettings = (tab: SettingsTab) => {
    setSettingsTab(tab);
    setShowSettingsModal(true);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearUserLocalStorage();
    router.push('/auth');
  };

  const getInitials = (name: string) =>
    name.split(' ').map((p) => p.charAt(0)).join('').toUpperCase().substring(0, 2);

  // ── Registry-driven menu items ──
  const generalItems = getItemsByGroup('userMenu', 'preferences').filter((item) => {
    if (item.requiresBilling && !billingActive) return false;
    return true;
  });

  const accountItems = getItemsByGroup('userMenu', 'account').filter((item) => {
    if (item.requiresBilling && !billingActive) return false;
    return true;
  });

  const adminItems = getItemsByGroup('userMenu', 'admin').filter((item) => {
    if (item.requiresAdmin && !user.isAdmin) return false;
    return true;
  });

  const viewItems = getItemsByGroup('userMenu', 'view').filter(
    (item) => item.id !== 'toggle-sidebar',
  );

  const handleMenuNav = (href: string, label: string) => {
    const type = href.startsWith('/settings') ? 'settings' as const : 'page' as const;
    openTabAndNavigate({
      id: `page:${href}`,
      title: label,
      type,
      href,
    }, router);
  };

  const handleRegistryItem = (item: MenuItemDef) => {
    switch (item.kind) {
      case 'navigate':
        handleMenuNav(item.href!, item.label);
        break;
      case 'settings':
        openSettings(item.settingsTab!);
        break;
      case 'action':
        if (item.actionId === 'logout') handleLogout();
        if (item.actionId === 'openPlan') { trackCtaUpgrade(); setShowPlanModal(true); }
        break;
    }
  };

  const renderRegistryItem = (item: MenuItemDef) => {
    const Icon = item.icon;
    return (
      <DropdownMenuItem key={item.id} onClick={() => handleRegistryItem(item)} className="gap-2 p-2 cursor-pointer">
        <Icon className="h-4 w-4" />
        <span>{item.label}</span>
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem className="relative">
          {billingActive && (
            <div className="absolute bottom-full left-0 right-0 mb-2 px-0 group-data-[collapsible=icon]:hidden z-50 flex flex-col gap-2">
              {/* <SpotlightCard className="bg-zinc-200/60 dark:bg-zinc-800/60 backdrop-blur-md cursor-pointer">
                <div onClick={openReferralDialog} className="flex items-center gap-3 px-3 py-2.5">
                  <Heart className="h-4 w-4 text-zinc-700 dark:text-zinc-300 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('referralShareTitle')}</div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">{t('referralShareSubtitle')}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                </div>
              </SpotlightCard> */}
              {isFreeTier && (
                <Button
                  onClick={() => { trackCtaUpgrade(); setShowPlanModal(true); }}
                  variant="default"
                  size="lg"
                  className="w-full"
                >
                  {t('upgrade')}
                </Button>
              )}
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className='bg-muted/40 hover:bg-muted/20 rounded-2xl border'
              >
                <Avatar className="h-8 w-8 rounded-full flex-shrink-0">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-full text-xs">{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col justify-center flex-1 min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium text-[13px] leading-tight">{user.name}</span>
                  {user.planName ? (
                    <TierBadge planName={user.planName} size="xs" variant="default" />
                  ) : (
                    <span className="truncate text-[11px] text-muted-foreground leading-tight">{user.email}</span>
                  )}
                </div>
                <ChevronsUpDown className="ml-auto size-3.5 flex-shrink-0 group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 p-2"
              side={isMobile ? 'bottom' : 'top'}
              align="start"
              sideOffset={4}
            >
              <ServerSelector />
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuLabel className="text-muted-foreground text-xs px-2 py-1.5">General</DropdownMenuLabel>
              <DropdownMenuGroup>
                {accountItems.map(renderRegistryItem)}
                {generalItems.map(renderRegistryItem)}
              </DropdownMenuGroup>
              {adminItems.length > 0 && (
                <>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuLabel className="text-muted-foreground text-xs px-2 py-1.5">Advanced</DropdownMenuLabel>
                  <DropdownMenuGroup>
                    {adminItems.map(renderRegistryItem)}
                  </DropdownMenuGroup>
                </>
              )}
              <div className="px-2 py-1.5">
                <div className="flex gap-0.5 p-0.5 bg-muted/50 rounded-md w-fit">
                  {themeOptions.map((mode) => {
                    const Icon = mode.icon;
                    const isActive = theme === mode.value;
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTheme(mode.value);
                        }}
                        className={`p-1.5 rounded-sm transition-all duration-150 ${
                          isActive
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Icon className="size-3.5" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem onClick={sleep} className="gap-2 p-2 cursor-pointer">
                <Moon className="h-4 w-4" />
                <span>Sleep</span>
              </DropdownMenuItem>
              {viewItems.map(renderRegistryItem)}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <UserSettingsModal
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
        defaultTab={settingsTab}
        returnUrl={typeof window !== 'undefined' ? window?.location?.href || '/' : '/'}
      />
      <PlanSelectionModal
        open={showPlanModal}
        onOpenChange={setShowPlanModal}
        returnUrl={typeof window !== 'undefined' ? window?.location?.href || '/' : '/'}
      />
      <ReferralDialog
        open={isReferralDialogOpen}
        onOpenChange={closeReferralDialog}
      />
    </>
  );
}
