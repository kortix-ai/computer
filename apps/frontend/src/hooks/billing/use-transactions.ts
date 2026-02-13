import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import { accountStateKeys } from './use-account-state';
import { dollarsToCredits } from '@agentpress/shared';

export interface CreditTransaction {
  id: string;
  created_at: string;
  amount: number;
  balance_after: number;
  type: 'tier_grant' | 'purchase' | 'admin_grant' | 'promotional' | 'usage' | 'refund' | 'adjustment' | 'expired';
  description: string;
  is_expiring?: boolean;
  expires_at?: string;
  metadata?: Record<string, any>;
}

export interface TransactionsResponse {
  transactions: CreditTransaction[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
  current_balance: {
    total: number;
    expiring: number;
    non_expiring: number;
    tier: string;
  };
}

export interface TransactionsSummary {
  period_days: number;
  since_date: string;
  current_balance: {
    total: number;
    expiring: number;
    non_expiring: number;
    tier: string;
  };
  summary: {
    total_added: number;
    total_used: number;
    total_refunded: number;
    total_expired: number;
    net_change: number;
  };
  transaction_counts: Record<string, number>;
  total_transactions: number;
}

export function useTransactions(
  limit: number = 50,
  offset: number = 0,
  typeFilter?: string
) {
  return useQuery<TransactionsResponse>({
    queryKey: accountStateKeys.transactions(limit, offset),
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      
      if (typeFilter) {
        params.append('type_filter', typeFilter);
      }
      
      const response = await backendApi.get(`/billing/transactions?${params.toString()}`);
      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data as TransactionsResponse;
      return {
        ...data,
        transactions: data.transactions.map(tx => ({
          ...tx,
          amount: dollarsToCredits(tx.amount),
          balance_after: dollarsToCredits(tx.balance_after),
        })),
        current_balance: {
          ...data.current_balance,
          total: dollarsToCredits(data.current_balance.total),
          expiring: dollarsToCredits(data.current_balance.expiring),
          non_expiring: dollarsToCredits(data.current_balance.non_expiring),
        },
      };
    },
    staleTime: 30000,
  });
}

export function useTransactionsSummary(days: number = 30) {
  return useQuery<TransactionsSummary>({
    queryKey: [...accountStateKeys.transactions(), 'summary', days],
    queryFn: async () => {
      const response = await backendApi.get(`/billing/transactions/summary?days=${days}`);
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const data = response.data as TransactionsSummary;
      return {
        ...data,
        current_balance: {
          ...data.current_balance,
          total: dollarsToCredits(data.current_balance.total),
          expiring: dollarsToCredits(data.current_balance.expiring),
          non_expiring: dollarsToCredits(data.current_balance.non_expiring),
        },
        summary: {
          ...data.summary,
          total_added: dollarsToCredits(data.summary.total_added),
          total_used: dollarsToCredits(data.summary.total_used),
          total_refunded: dollarsToCredits(data.summary.total_refunded),
          total_expired: dollarsToCredits(data.summary.total_expired),
          net_change: dollarsToCredits(data.summary.net_change),
        },
      };
    },
    staleTime: 60000,
  });
} 