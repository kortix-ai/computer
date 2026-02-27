/**
 * ============================================================================
 * CENTRAL MENU REGISTRY — Single source of truth for all navigation items
 * ============================================================================
 *
 * Every menu item in the app lives here. The Command Palette (Cmd+K),
 * Right Sidebar, Left Sidebar, User Settings Menu, and Settings Modal
 * all consume these definitions — update once, synced everywhere.
 *
 * To add a new page / action:
 *   1. Add a lucide icon import below
 *   2. Add an entry to the appropriate section
 *   3. Done — it will appear in every surface that renders that section
 *
 * Each item declares which surfaces it should appear in via `showIn`.
 * Surfaces: 'commandPalette' | 'rightSidebar' | 'leftSidebar' | 'userMenu'
 * ============================================================================
 */

import type { LucideIcon } from 'lucide-react';
import {
  // Navigation
  LayoutDashboard,
  Blocks,
  FolderOpen,
  Plug,
  MessageSquare,
  Calendar,
  ScrollText,
  Brain,
  Cable,
  Globe,
  Compass,
  Activity,
  Rocket,

  // Actions
  Plus,
  TerminalSquare,
  Layers,
  GitCompareArrows,
  Search,

  // Settings pages
  KeyRound,
  Settings as SettingsIcon,
  Key,

  // Preferences
  Volume2,
  Bell,
  Keyboard,

  // Account
  Zap,
  CreditCard,
  Receipt,
  Users,

  // Theme
  Sun,
  Moon,
  Monitor,

  // View / Misc
  PanelLeftClose,
  PanelLeftIcon,
  LogOut,

  // Admin
  BarChart3,
  AlertTriangle,
  Database,
  Server,
  TestTube,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

/** Where a menu item should be rendered. */
export type MenuSurface =
  | 'commandPalette'
  | 'rightSidebar'
  | 'leftSidebar'
  | 'userMenu';

/**
 * How the item behaves when activated.
 *
 * - 'navigate': Opens a route in a tab (uses openTabAndNavigate)
 * - 'action':   Runs an imperative callback (e.g. "new session", "logout")
 * - 'settings': Opens the UserSettingsModal to a specific tab
 * - 'theme':    Switches the app theme
 * - 'sandboxService': Opens a sandbox service preview tab (needs special handler)
 */
export type MenuItemKind =
  | 'navigate'
  | 'action'
  | 'settings'
  | 'theme'
  | 'sandboxService';

export type SettingsTabId =
  | 'general'
  | 'sounds'
  | 'notifications'
  | 'plan'
  | 'billing'
  | 'transactions'
  | 'referrals'
  | 'shortcuts';

/** The group / section a menu item belongs to. */
export type MenuGroup =
  | 'actions'
  | 'navigation'
  | 'quickActions'
  | 'settingsPages'
  | 'preferences'
  | 'account'
  | 'theme'
  | 'view'
  | 'admin';

export interface MenuItemDef {
  /** Unique identifier for this item (used as React key, cmdk value, etc.) */
  id: string;
  /** Display label */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Which group/section this belongs to */
  group: MenuGroup;
  /** Which UI surfaces should render this item */
  showIn: MenuSurface[];

  // --- Behaviour ---
  kind: MenuItemKind;

  /** For kind='navigate': the route to navigate to */
  href?: string;
  /** For kind='navigate': tab type override (defaults to 'page') */
  tabType?: string;
  /** For kind='navigate': tab id override (defaults to `page:${href}`) */
  tabId?: string;
  /** For kind='navigate': additional pathname prefixes that make this item "active" */
  activePathPrefixes?: string[];

  /** For kind='settings': which settings tab to open */
  settingsTab?: SettingsTabId;
  /** For kind='theme': which theme to set */
  themeValue?: string;
  /** For kind='sandboxService': the container port */
  sandboxPort?: string;

  /** For kind='action': a string key identifying the action (resolved at runtime) */
  actionId?: string;

  // --- Display hints ---
  /** Keyboard shortcut string to show (e.g. "⌘J") */
  shortcut?: string;
  /** Extra search keywords for the command palette (cmdk `value`) */
  keywords?: string;
  /** If true, item is only shown when billing is enabled */
  requiresBilling?: boolean;
  /** If true, item is only shown for admin users */
  requiresAdmin?: boolean;
  /** If true, item is only shown when there's an active session */
  requiresSession?: boolean;
}

// ============================================================================
// Registry definitions
// ============================================================================

export const menuRegistry: MenuItemDef[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'new-session',
    label: 'New Session',
    icon: Plus,
    group: 'actions',
    showIn: ['commandPalette', 'leftSidebar'],
    kind: 'action',
    actionId: 'newSession',
    shortcut: '⌘J',
  },
  {
    id: 'search',
    label: 'Search',
    icon: Search,
    group: 'actions',
    showIn: ['leftSidebar'],
    kind: 'action',
    actionId: 'openSearch',
    shortcut: '⌘K',
  },
  {
    id: 'open-terminal',
    label: 'Open Terminal',
    icon: TerminalSquare,
    group: 'actions',
    showIn: ['commandPalette'],
    kind: 'action',
    actionId: 'openTerminal',
  },
  {
    id: 'compact-session',
    label: 'Compact Session',
    icon: Layers,
    group: 'actions',
    showIn: ['commandPalette'],
    kind: 'action',
    actionId: 'compactSession',
    requiresSession: true,
  },
  {
    id: 'view-changes',
    label: 'View Changes',
    icon: GitCompareArrows,
    group: 'actions',
    showIn: ['commandPalette'],
    kind: 'action',
    actionId: 'viewChanges',
    requiresSession: true,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // QUICK ACTIONS (right sidebar top section)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'files-quick',
    label: 'Files',
    icon: FolderOpen,
    group: 'quickActions',
    showIn: ['rightSidebar'],
    kind: 'navigate',
    href: '/files',
    tabId: 'page:/files',
  },
  {
    id: 'new-terminal',
    label: 'New Terminal',
    icon: TerminalSquare,
    group: 'quickActions',
    showIn: ['rightSidebar'],
    kind: 'action',
    actionId: 'newTerminal',
  },
  {
    id: 'secrets-quick',
    label: 'Secrets Manager',
    icon: KeyRound,
    group: 'quickActions',
    showIn: ['rightSidebar'],
    kind: 'navigate',
    href: '/settings/credentials',
    tabId: 'settings:secrets',
    tabType: 'settings',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // NAVIGATION — Main pages
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    group: 'navigation',
    showIn: ['commandPalette'],
    kind: 'navigate',
    href: '/dashboard',
    tabType: 'dashboard',
  },
  {
    id: 'workspace',
    label: 'Workspace',
    icon: Blocks,
    group: 'navigation',
    showIn: ['commandPalette', 'rightSidebar'],
    kind: 'navigate',
    href: '/workspace',
    activePathPrefixes: ['/workspace', '/projects', '/agents', '/skills', '/commands', '/tools'],
  },
  {
    id: 'files',
    label: 'Files',
    icon: FolderOpen,
    group: 'navigation',
    showIn: ['commandPalette'],
    kind: 'navigate',
    href: '/files',
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: Brain,
    group: 'navigation',
    showIn: ['rightSidebar'],
    kind: 'navigate',
    href: '/memory',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Plug,
    group: 'navigation',
    showIn: ['commandPalette', 'rightSidebar'],
    kind: 'navigate',
    href: '/integrations',
  },
  {
    id: 'channels',
    label: 'Channels',
    icon: MessageSquare,
    group: 'navigation',
    showIn: ['commandPalette', 'rightSidebar'],
    kind: 'navigate',
    href: '/channels',
  },
  {
    id: 'scheduled-tasks',
    label: 'Scheduled Tasks',
    icon: Calendar,
    group: 'navigation',
    showIn: ['commandPalette', 'rightSidebar'],
    kind: 'navigate',
    href: '/scheduled-tasks',
  },
  {
    id: 'tunnel',
    label: 'Tunnel',
    icon: Cable,
    group: 'navigation',
    showIn: ['rightSidebar'],
    kind: 'navigate',
    href: '/tunnel',
  },
  {
    id: 'deployments',
    label: 'Deployments',
    icon: Rocket,
    group: 'navigation',
    showIn: ['commandPalette', 'rightSidebar'],
    kind: 'navigate',
    href: '/deployments',
  },
  {
    id: 'changelog',
    label: 'Changelog',
    icon: ScrollText,
    group: 'navigation',
    showIn: ['commandPalette'],
    kind: 'navigate',
    href: '/changelog',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // SANDBOX SERVICES (right sidebar only — open preview tabs)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'agent-browser',
    label: 'Agent Browser',
    icon: Globe,
    group: 'navigation',
    showIn: ['rightSidebar'],
    kind: 'sandboxService',
    actionId: 'openAgentBrowser',
  },
  {
    id: 'browser',
    label: 'Browser',
    icon: Compass,
    group: 'navigation',
    showIn: ['rightSidebar'],
    kind: 'navigate',
    href: '/p/browser',
    tabId: 'preview:browser',
    tabType: 'preview',
  },
  {
    id: 'running-services',
    label: 'Running Services',
    icon: Activity,
    group: 'navigation',
    showIn: ['rightSidebar'],
    kind: 'navigate',
    href: '/services/running',
    tabId: 'services:running',
    tabType: 'services',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // SETTINGS PAGES (navigate to route)
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'secrets-manager',
    label: 'Secrets Manager',
    icon: KeyRound,
    group: 'settingsPages',
    showIn: ['commandPalette'],
    kind: 'navigate',
    href: '/settings/credentials',
    tabType: 'settings',
    keywords: 'secrets manager credentials env environment variables integrations keys',
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    icon: SettingsIcon,
    group: 'settingsPages',
    showIn: ['commandPalette'],
    kind: 'navigate',
    href: '/settings/api-keys',
    tabType: 'settings',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PREFERENCES — open settings modal to a tab
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'pref-general',
    label: 'General',
    icon: SettingsIcon,
    group: 'preferences',
    showIn: ['commandPalette', 'userMenu'],
    kind: 'settings',
    settingsTab: 'general',
    keywords: 'settings preferences general profile name email language',
  },

  {
    id: 'pref-sounds',
    label: 'Sounds',
    icon: Volume2,
    group: 'preferences',
    showIn: ['commandPalette'],
    kind: 'settings',
    settingsTab: 'sounds',
    keywords: 'sounds audio volume notification sound effects mute',
  },
  {
    id: 'pref-notifications',
    label: 'Notifications',
    icon: Bell,
    group: 'preferences',
    showIn: ['commandPalette'],
    kind: 'settings',
    settingsTab: 'notifications',
    keywords: 'notifications alerts push web browser desktop',
  },
  {
    id: 'pref-shortcuts',
    label: 'Shortcuts',
    icon: Keyboard,
    group: 'preferences',
    showIn: ['commandPalette'],
    kind: 'settings',
    settingsTab: 'shortcuts',
    keywords: 'shortcuts keyboard hotkeys keybindings keys',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ACCOUNT — open settings modal to billing-related tabs
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'account-plan',
    label: 'Plan',
    icon: Zap,
    group: 'account',
    showIn: ['commandPalette', 'userMenu'],
    kind: 'action',
    actionId: 'openPlan',
    keywords: 'plan subscription upgrade pricing tier free pro',
    requiresBilling: true,
  },
  {
    id: 'account-billing',
    label: 'Billing',
    icon: CreditCard,
    group: 'account',
    showIn: ['commandPalette', 'userMenu'],
    kind: 'settings',
    settingsTab: 'billing',
    keywords: 'billing payment credit card subscription manage',
    requiresBilling: true,
  },
  {
    id: 'account-transactions',
    label: 'Transactions',
    icon: Receipt,
    group: 'account',
    showIn: ['commandPalette'],
    kind: 'settings',
    settingsTab: 'transactions',
    keywords: 'transactions credits history purchases receipts',
  },
  {
    id: 'account-referrals',
    label: 'Referrals',
    icon: Users,
    group: 'account',
    showIn: ['commandPalette'],
    kind: 'settings',
    settingsTab: 'referrals',
    keywords: 'referrals invite share friends earn',
    requiresBilling: true,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // THEME
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'theme-light',
    label: 'Light Theme',
    icon: Sun,
    group: 'theme',
    showIn: ['commandPalette'],
    kind: 'theme',
    themeValue: 'light',
    keywords: 'theme light mode bright day',
  },
  {
    id: 'theme-dark',
    label: 'Dark Theme',
    icon: Moon,
    group: 'theme',
    showIn: ['commandPalette'],
    kind: 'theme',
    themeValue: 'dark',
    keywords: 'theme dark mode night',
  },
  {
    id: 'theme-system',
    label: 'System Theme',
    icon: Monitor,
    group: 'theme',
    showIn: ['commandPalette'],
    kind: 'theme',
    themeValue: 'system',
    keywords: 'theme system auto default os',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'toggle-sidebar',
    label: 'Toggle Sidebar',
    icon: PanelLeftClose, // swapped dynamically at render time
    group: 'view',
    showIn: ['commandPalette'],
    kind: 'action',
    actionId: 'toggleSidebar',
    shortcut: '⌘B',
  },
  {
    id: 'logout',
    label: 'Log Out',
    icon: LogOut,
    group: 'view',
    showIn: ['commandPalette', 'userMenu'],
    kind: 'action',
    actionId: 'logout',
    keywords: 'log out sign out logout signout disconnect',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // RIGHT SIDEBAR FOOTER
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'ssh-key',
    label: 'Generate SSH Key',
    icon: Key,
    group: 'view',
    showIn: ['rightSidebar'],
    kind: 'action',
    actionId: 'generateSSHKey',
  },

  // ──────────────────────────────────────────────────────────────────────────
  // ADMIN
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'admin-feedback',
    label: 'User Feedback',
    icon: MessageSquare,
    group: 'admin',
    showIn: ['userMenu'],
    kind: 'navigate',
    href: '/admin/feedback',
    requiresAdmin: true,
  },
  {
    id: 'admin-analytics',
    label: 'Analytics',
    icon: BarChart3,
    group: 'admin',
    showIn: ['userMenu'],
    kind: 'navigate',
    href: '/admin/analytics',
    requiresAdmin: true,
  },
  {
    id: 'admin-notifications',
    label: 'Notifications',
    icon: Bell,
    group: 'admin',
    showIn: ['userMenu'],
    kind: 'navigate',
    href: '/admin/notifications',
    requiresAdmin: true,
  },
  {
    id: 'admin-utils',
    label: 'Admin Utils',
    icon: AlertTriangle,
    group: 'admin',
    showIn: ['userMenu'],
    kind: 'navigate',
    href: '/admin/utils',
    requiresAdmin: true,
  },
  {
    id: 'admin-sandbox-pool',
    label: 'Sandbox Pool',
    icon: Database,
    group: 'admin',
    showIn: ['userMenu'],
    kind: 'navigate',
    href: '/admin/sandbox-pool',
    requiresAdmin: true,
  },
  {
    id: 'admin-stateless',
    label: 'Stateless',
    icon: Server,
    group: 'admin',
    showIn: ['userMenu'],
    kind: 'navigate',
    href: '/admin/stateless',
    requiresAdmin: true,
  },
  {
    id: 'admin-stress-test',
    label: 'Stress Test',
    icon: TestTube,
    group: 'admin',
    showIn: ['userMenu'],
    kind: 'navigate',
    href: '/admin/stress-test',
    requiresAdmin: true,
  },
];

// ============================================================================
// Selectors — filter the registry for each surface
// ============================================================================

export function getItemsForSurface(surface: MenuSurface): MenuItemDef[] {
  return menuRegistry.filter((item) => item.showIn.includes(surface));
}

export function getItemsByGroup(
  surface: MenuSurface,
  group: MenuGroup,
): MenuItemDef[] {
  return menuRegistry.filter(
    (item) => item.showIn.includes(surface) && item.group === group,
  );
}

export function getItemById(id: string): MenuItemDef | undefined {
  return menuRegistry.find((item) => item.id === id);
}

/**
 * Returns whether a navigation item is currently "active" based on the pathname.
 */
export function isItemActive(item: MenuItemDef, pathname: string | null): boolean {
  if (!pathname || !item.href) return false;
  if (pathname === item.href) return true;
  if (item.activePathPrefixes) {
    return item.activePathPrefixes.some((prefix) => pathname.startsWith(prefix));
  }
  return false;
}

// ============================================================================
// Settings modal tabs — derived from the same registry
// ============================================================================

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
}

/** Preference tabs for the settings modal */
export function getPreferenceTabs(): SettingsTab[] {
  const preferenceIds: SettingsTabId[] = ['general', 'sounds', 'notifications', 'shortcuts'];
  return preferenceIds.map((tabId) => {
    const item = menuRegistry.find(
      (i) => i.kind === 'settings' && i.settingsTab === tabId,
    );
    if (!item) {
      // Fallback — should not happen if registry is complete
      return { id: tabId, label: tabId, icon: SettingsIcon };
    }
    return { id: tabId, label: item.label, icon: item.icon };
  });
}

/** Account tabs for the settings modal */
export function getAccountTabs(billingEnabled: boolean): SettingsTab[] {
  const items: SettingsTab[] = [
    { id: 'plan', label: 'Plan', icon: Zap },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'transactions', label: 'Transactions', icon: Receipt },
  ];
  if (billingEnabled) {
    items.push({ id: 'referrals', label: 'Referrals', icon: Users });
  }
  // Enrich labels/icons from registry where possible
  return items.map((tab) => {
    const item = menuRegistry.find(
      (i) => i.settingsTab === tab.id,
    );
    if (item) {
      return { ...tab, label: item.label, icon: item.icon };
    }
    return tab;
  });
}

/** Theme options (used in user menu & command palette) */
export const themeOptions = menuRegistry
  .filter((item) => item.group === 'theme')
  .map((item) => ({
    value: item.themeValue!,
    icon: item.icon,
    label: item.label,
  }));
