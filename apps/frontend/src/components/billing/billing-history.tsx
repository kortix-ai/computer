'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  RefreshCw,
  CreditCard,
  Zap,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  Clock,
  Gift,
  Infinity,
  Bot,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from 'lucide-react';
import { useTransactions } from '@/hooks/billing/use-transactions';
import { cn } from '@/lib/utils';
import { formatCredits } from '@kortix/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

type TxType =
  | 'tier_grant'
  | 'purchase'
  | 'admin_grant'
  | 'promotional'
  | 'usage'
  | 'refund'
  | 'adjustment'
  | 'expired'
  | 'daily_refresh'
  | 'auto_topup'
  | string;

type FilterTab = 'all' | 'topups' | 'plan' | 'usage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDollars(creditsAsDisplayed: number): string {
  // credits are already multiplied by CREDITS_PER_DOLLAR (1000) in the hook
  // So to get dollars: credits / 1000
  const dollars = Math.abs(creditsAsDisplayed) / 1000;
  if (dollars === 0) return '$0.00';
  if (dollars < 0.01) return `< $0.01`;
  return `$${dollars.toFixed(2)}`;
}

// ─── Transaction type config ─────────────────────────────────────────────────

interface TypeConfig {
  label: string;
  icon: React.ElementType;
  iconClass: string;
  badgeClass: string;
  category: FilterTab;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  tier_grant: {
    label: 'Plan Credits',
    icon: Zap,
    iconClass: 'text-primary',
    badgeClass: 'bg-primary/10 text-primary border-primary/20',
    category: 'plan',
  },
  daily_refresh: {
    label: 'Daily Refresh',
    icon: RotateCcw,
    iconClass: 'text-blue-500',
    badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    category: 'plan',
  },
  purchase: {
    label: 'Credit Top-up',
    icon: CreditCard,
    iconClass: 'text-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    category: 'topups',
  },
  auto_topup: {
    label: 'Auto Top-up',
    icon: RotateCcw,
    iconClass: 'text-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    category: 'topups',
  },
  usage: {
    label: 'Usage',
    icon: Bot,
    iconClass: 'text-orange-500',
    badgeClass: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    category: 'usage',
  },
  refund: {
    label: 'Refund',
    icon: ArrowDownCircle,
    iconClass: 'text-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    category: 'topups',
  },
  promotional: {
    label: 'Promo Credits',
    icon: Gift,
    iconClass: 'text-violet-500',
    badgeClass: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
    category: 'plan',
  },
  admin_grant: {
    label: 'Admin Grant',
    icon: Gift,
    iconClass: 'text-violet-500',
    badgeClass: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
    category: 'plan',
  },
  adjustment: {
    label: 'Adjustment',
    icon: ArrowUpCircle,
    iconClass: 'text-muted-foreground',
    badgeClass: 'bg-muted text-muted-foreground border-border',
    category: 'all',
  },
  expired: {
    label: 'Expired',
    icon: Clock,
    iconClass: 'text-red-500',
    badgeClass: 'bg-red-500/10 text-red-600 border-red-500/20',
    category: 'usage',
  },
};

function getTypeConfig(type: string): TypeConfig {
  // Handle auto_topup embedded in description
  if (type === 'purchase') return TYPE_CONFIG.purchase;
  return (
    TYPE_CONFIG[type] ?? {
      label: type,
      icon: Receipt,
      iconClass: 'text-muted-foreground',
      badgeClass: 'bg-muted text-muted-foreground border-border',
      category: 'all' as FilterTab,
    }
  );
}

// Map filter tab → type filter for API
const TAB_TYPE_FILTERS: Record<FilterTab, string | undefined> = {
  all: undefined,
  topups: undefined, // client-side filtered
  plan: undefined,   // client-side filtered
  usage: 'usage',
};

// ─── Summary stats strip ─────────────────────────────────────────────────────

interface SummaryStatsProps {
  transactions: ReturnType<typeof useTransactions>['data'];
}

function SummaryStats({ transactions }: SummaryStatsProps) {
  const txList = transactions?.transactions ?? [];

  const totalAdded = txList
    .filter((t) => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);

  const totalUsed = txList
    .filter((t) => t.amount < 0 && t.type === 'usage')
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const totalPurchased = txList
    .filter((t) => t.type === 'purchase' || t.type === 'auto_topup')
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      {[
        {
          label: 'Credits Added',
          value: formatCredits(totalAdded),
          icon: ArrowUpCircle,
          cls: 'text-emerald-500',
        },
        {
          label: 'Credits Used',
          value: formatCredits(totalUsed),
          icon: TrendingDown,
          cls: 'text-orange-500',
        },
        {
          label: 'Purchased',
          value: formatDollars(totalPurchased),
          icon: CreditCard,
          cls: 'text-primary',
        },
      ].map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3"
          >
            <div className={cn('rounded-lg bg-muted p-1.5', stat.cls)}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-sm font-semibold tabular-nums">{stat.value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const LIMIT = 50;

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'topups', label: 'Top-ups' },
  { id: 'plan', label: 'Plan & Grants' },
  { id: 'usage', label: 'Usage' },
];

export default function BillingHistory() {
  const [tab, setTab] = useState<FilterTab>('all');
  const [offset, setOffset] = useState(0);

  // For the 'usage' tab we can use the server-side type_filter
  const serverTypeFilter = tab === 'usage' ? 'usage' : undefined;

  const { data, isLoading, error, refetch } = useTransactions(
    LIMIT,
    offset,
    serverTypeFilter,
  );

  const allTx = data?.transactions ?? [];

  // Client-side filter for plan / topups tabs (since they are multi-type)
  const transactions = allTx.filter((tx) => {
    if (tab === 'all' || tab === 'usage') return true;
    const config = getTypeConfig(tx.type);
    if (tab === 'topups') return config.category === 'topups';
    if (tab === 'plan') return config.category === 'plan';
    return true;
  });

  const handleTabChange = (newTab: FilterTab) => {
    setTab(newTab);
    setOffset(0);
  };

  // ── Loading skeleton ──
  if (isLoading && offset === 0) {
    return (
      <div className="space-y-4">
        {/* Stats skeleton */}
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
        {/* Table skeleton */}
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {(error as Error).message || 'Failed to load billing history'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary stats for the visible data (full 50-item page) */}
      <SummaryStats transactions={data} />

      {/* Filter tabs + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1">
          {FILTER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                tab === t.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Table */}
      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Receipt className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No transactions found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {tab !== 'all'
              ? 'Try switching to "All" to see your full history'
              : 'Your billing history will appear here once you have activity'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border">
                  <TableHead className="text-xs font-medium text-muted-foreground w-[160px]">
                    Date
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground w-[130px]">
                    Type
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">
                    Description
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-center w-[90px]">
                    Credit Type
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right w-[110px]">
                    Credits
                  </TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground text-right w-[110px]">
                    Balance
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx, idx) => {
                  const config = getTypeConfig(tx.type);
                  const Icon = config.icon;
                  const isCredit = tx.amount > 0;
                  const isExpired = tx.type === 'expired';

                  return (
                    <TableRow
                      key={tx.id}
                      className={cn(
                        'group transition-colors',
                        idx % 2 === 1 ? 'bg-muted/20' : 'bg-transparent',
                      )}
                    >
                      {/* Date */}
                      <TableCell className="font-mono text-[11px] text-muted-foreground py-3">
                        {formatDate(tx.created_at)}
                      </TableCell>

                      {/* Type badge */}
                      <TableCell className="py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md border',
                            config.badgeClass,
                          )}
                        >
                          <Icon className="h-3 w-3 flex-shrink-0" />
                          {config.label}
                        </span>
                      </TableCell>

                      {/* Description */}
                      <TableCell className="py-3">
                        <span className="text-xs text-foreground/80 line-clamp-1">
                          {tx.description || '—'}
                        </span>
                      </TableCell>

                      {/* Credit type (expiring / permanent) */}
                      <TableCell className="py-3 text-center">
                        {tx.is_expiring !== undefined && (
                          tx.is_expiring ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-orange-500/80">
                              <Clock className="h-2.5 w-2.5" />
                              Expiring
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-blue-500/80">
                              <Infinity className="h-2.5 w-2.5" />
                              Permanent
                            </span>
                          )
                        )}
                      </TableCell>

                      {/* Credits +/- */}
                      <TableCell className="py-3 text-right">
                        <span
                          className={cn(
                            'font-mono text-xs font-semibold tabular-nums',
                            isExpired
                              ? 'text-red-500'
                              : isCredit
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-500 dark:text-red-400',
                          )}
                        >
                          {isCredit ? '+' : ''}
                          {formatCredits(tx.amount, { showDecimals: true })}
                        </span>
                      </TableCell>

                      {/* Balance after */}
                      <TableCell className="py-3 text-right">
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {formatCredits(tx.balance_after, { showDecimals: true })}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data?.pagination && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Showing {offset + 1}–
                {Math.min(offset + LIMIT, data.pagination.total)} of{' '}
                {data.pagination.total} transactions
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                  disabled={offset === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setOffset(offset + LIMIT)}
                  disabled={!data.pagination.has_more}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
