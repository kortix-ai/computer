'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bell,
  BookOpen,
  ChevronsUpDown,
  CreditCard,
  Key,
  LogOut,
  Monitor,
  Settings,
  Sparkles,
  Sun,
  Moon,
  Plug,
  Zap,
  BarChart3,

  MessageSquare,
  Calendar,
  Heart,
  ChevronRight,
  LifeBuoy,
  AlertTriangle,
  Server,
  TestTube,
  Database,
  KeyRound,
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
import { Palette } from 'lucide-react';
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

type SettingsTab = 'general' | 'appearance' | 'billing';

interface MenuItemConfig {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  onClick?: () => void;
}

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

  // Data-driven menu items — billing items only shown when billing is enabled
  const generalItems: MenuItemConfig[] = [
    ...(billingActive ? [
      { icon: Zap, label: 'Plan', onClick: () => { trackCtaUpgrade(); setShowPlanModal(true); } },
      { icon: CreditCard, label: 'Billing', onClick: () => openSettings('billing') },
    ] : []),
    { icon: Settings, label: 'Settings', onClick: () => openSettings('general') },
  ];

  const adminItems: MenuItemConfig[] = [
    { icon: MessageSquare, label: 'User Feedback', href: '/admin/feedback' },
    { icon: BarChart3, label: 'Analytics', href: '/admin/analytics' },
    { icon: Bell, label: 'Notifications', href: '/admin/notifications' },
    { icon: AlertTriangle, label: 'Admin Utils', href: '/admin/utils' },
    { icon: Database, label: 'Sandbox Pool', href: '/admin/sandbox-pool' },
    { icon: Server, label: 'Stateless', href: '/admin/stateless' },
    { icon: TestTube, label: 'Stress Test', href: '/admin/stress-test' },
  ];

  const handleMenuNav = (href: string, label: string) => {
    const type = href.startsWith('/settings') ? 'settings' as const : 'page' as const;
    openTabAndNavigate({
      id: `page:${href}`,
      title: label,
      type,
      href,
    }, router);
  };

  const renderMenuItem = (item: MenuItemConfig) => {
    const Icon = item.icon;
    if (item.href) {
      return (
        <DropdownMenuItem key={item.label} onClick={() => handleMenuNav(item.href!, item.label)} className="gap-2 p-2 cursor-pointer">
          <Icon className="h-4 w-4" />
          <span>{item.label}</span>
        </DropdownMenuItem>
      );
    }
    return (
      <DropdownMenuItem key={item.label} onClick={item.onClick} className="gap-2 p-2">
        <Icon className="h-4 w-4" />
        <span>{item.label}</span>
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem className="relative">
          {/* Referral + Upgrade above user card (billing only) */}
          {billingActive && (
            <div className="absolute bottom-full left-0 right-0 mb-2 px-0 group-data-[collapsible=icon]:hidden z-50 flex flex-col gap-2">
              <SpotlightCard className="bg-zinc-200/60 dark:bg-zinc-800/60 backdrop-blur-md cursor-pointer">
                <div onClick={openReferralDialog} className="flex items-center gap-3 px-3 py-2.5">
                  <Heart className="h-4 w-4 text-zinc-700 dark:text-zinc-300 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('referralShareTitle')}</div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">{t('referralShareSubtitle')}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                </div>
              </SpotlightCard>
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
                className="bg-transparent hover:bg-transparent data-[state=open]:bg-transparent border-[1.5px] border-border h-[48px] p-2 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!w-8 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:!mx-auto"
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
              {/* Server instances */}
              <ServerSelector />
              <DropdownMenuSeparator className="my-1" />

              {/* General */}
              <DropdownMenuLabel className="text-muted-foreground text-xs px-2 py-1.5">General</DropdownMenuLabel>
              <DropdownMenuGroup>
                {generalItems.map(renderMenuItem)}
              </DropdownMenuGroup>

              {/* Admin */}
              {user.isAdmin && (
                <>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuLabel className="text-muted-foreground text-xs px-2 py-1.5">Advanced</DropdownMenuLabel>
                  <DropdownMenuGroup>
                    {adminItems.map(renderMenuItem)}
                  </DropdownMenuGroup>
                </>
              )}

              {/* Appearance + theme toggle */}
              <DropdownMenuItem
                onClick={() => openSettings('appearance')}
                className="gap-2 p-2"
              >
                <Palette className="h-4 w-4" />
                <span className="flex-1">Appearance</span>
              </DropdownMenuItem>
              <div className="px-2 py-1.5">
                <div className="flex gap-0.5 p-0.5 bg-muted/50 rounded-md w-fit">
                  {([
                    { value: 'light', icon: Sun },
                    { value: 'dark', icon: Moon },
                    { value: 'system', icon: Monitor },
                  ] as const).map((mode) => {
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
              <DropdownMenuItem onClick={handleLogout} className="gap-2 p-2">
                <LogOut className="h-4 w-4" />
                <span>{t('logout')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      {/* Modals */}
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
