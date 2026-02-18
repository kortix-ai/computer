'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAccountState } from '@/hooks/billing';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function UsageLimitsCard() {
  const t = useTranslations('dashboard');
  const { data: accountState, isLoading } = useAccountState();
  const limits = accountState?.limits;

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">{t('usageLimits')}</CardTitle>
          <CardDescription className="mt-1 sm:mt-2 text-xs sm:text-sm">
            Resource limits for your current plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-4 w-16 bg-muted rounded" />
                </div>
                <div className="h-2 w-full bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">{t('usageLimits')}</CardTitle>
        <CardDescription className="mt-1 sm:mt-2 text-xs sm:text-sm">
          Resource limits for your current plan
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="space-y-4">
            <div className="space-y-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm cursor-help">
                    <span className="text-muted-foreground">Concurrent Runs</span>
                    <span className="font-medium">{limits?.concurrent_runs?.running_count || 0} / {limits?.concurrent_runs?.limit || 0}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">AI Workers running at the same time</p>
                </TooltipContent>
              </Tooltip>
              <Progress 
                className="h-2"
                value={((limits?.concurrent_runs?.running_count || 0) / (limits?.concurrent_runs?.limit || 1)) * 100} 
              />
            </div>
            <div className="space-y-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm cursor-help">
                    <span className="text-muted-foreground">Custom AI Workers</span>
                    <span className="font-medium">{limits?.ai_worker_count?.current_count || 0} / {limits?.ai_worker_count?.limit || 0}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Create personalized AI Workers with custom instructions</p>
                </TooltipContent>
              </Tooltip>
              <Progress 
                className="h-2"
                value={((limits?.ai_worker_count?.current_count || 0) / (limits?.ai_worker_count?.limit || 1)) * 100} 
              />
            </div>
            <div className="space-y-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm cursor-help">
                    <span className="text-muted-foreground">Integrations</span>
                    <span className="font-medium">{limits?.custom_mcp_count?.current_count || 0} / {limits?.custom_mcp_count?.limit || 0}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Add external tool integrations and APIs</p>
                </TooltipContent>
              </Tooltip>
              <Progress 
                className="h-2"
                value={((limits?.custom_mcp_count?.current_count || 0) / (limits?.custom_mcp_count?.limit || 1)) * 100} 
              />
            </div>

          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}





