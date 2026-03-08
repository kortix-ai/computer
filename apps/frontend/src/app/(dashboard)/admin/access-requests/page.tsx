'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccessRequests, useApproveRequest, useRejectRequest } from '@/hooks/admin/use-access-requests';
import type { AccessRequest } from '@/hooks/admin/use-access-requests';
import { useAdminRole } from '@/hooks/admin/use-admin-role';
import { toast } from '@/lib/toast';
import { CheckCircle, XCircle, Clock, ShieldCheck, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

function StatusBadge({ status }: { status: AccessRequest['status'] }) {
  switch (status) {
    case 'pending':
      return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
    case 'approved':
      return <Badge variant="highlight" className="gap-1"><CheckCircle className="h-3 w-3" /> Approved</Badge>;
    case 'rejected':
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AccessRequestsPage() {
  const { data: adminRole, isLoading: roleLoading } = useAdminRole();
  const [activeTab, setActiveTab] = useState<string>('pending');
  const [confirmDialog, setConfirmDialog] = useState<{ request: AccessRequest; action: 'approve' | 'reject' } | null>(null);

  const { data, isLoading } = useAccessRequests({
    status: activeTab === 'all' ? undefined : activeTab,
  });

  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto p-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72 mb-8" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!adminRole?.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <ShieldCheck className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <h2 className="text-lg font-medium text-foreground/80">Admin access required</h2>
          <p className="text-sm text-muted-foreground">You don&apos;t have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const summary = data?.summary || { pending: 0, approved: 0, rejected: 0 };
  const requests = data?.requests || [];

  async function handleAction() {
    if (!confirmDialog) return;
    const { request, action } = confirmDialog;

    try {
      if (action === 'approve') {
        await approveMutation.mutateAsync(request.id);
        toast.success(`Approved ${request.email}`, {
          description: 'Email added to allowlist. They can now sign up.',
        });
      } else {
        await rejectMutation.mutateAsync(request.id);
        toast.success(`Rejected ${request.email}`);
      }
    } catch (err: any) {
      toast.error(`Failed to ${action} request`, {
        description: err.message,
      });
    }
    setConfirmDialog(null);
  }

  const isActioning = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <UserPlus className="h-6 w-6" />
              Access Requests
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review and manage early access requests
            </p>
          </div>

          {/* Summary cards */}
          <div className="flex gap-3">
            <div className="bg-foreground/[0.04] border border-foreground/[0.08] rounded-lg px-4 py-2 text-center min-w-[80px]">
              <p className="text-lg font-semibold text-amber-500">{summary.pending}</p>
              <p className="text-[11px] text-muted-foreground">Pending</p>
            </div>
            <div className="bg-foreground/[0.04] border border-foreground/[0.08] rounded-lg px-4 py-2 text-center min-w-[80px]">
              <p className="text-lg font-semibold text-green-500">{summary.approved}</p>
              <p className="text-[11px] text-muted-foreground">Approved</p>
            </div>
            <div className="bg-foreground/[0.04] border border-foreground/[0.08] rounded-lg px-4 py-2 text-center min-w-[80px]">
              <p className="text-lg font-semibold text-red-500">{summary.rejected}</p>
              <p className="text-[11px] text-muted-foreground">Rejected</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="pending" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Pending
              {summary.pending > 0 && (
                <span className="ml-1 text-[10px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded-full font-medium">
                  {summary.pending}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved" className="gap-1.5">
              <CheckCircle className="h-3.5 w-3.5" />
              Approved
            </TabsTrigger>
            <TabsTrigger value="rejected" className="gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              Rejected
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5">
              All
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No {activeTab === 'all' ? '' : activeTab} requests</p>
          </div>
        ) : (
          <div className="border border-foreground/[0.08] rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[250px]">Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="w-[300px]">Use Case</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  {activeTab === 'pending' && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id} className="group">
                    <TableCell className="font-medium">{req.email}</TableCell>
                    <TableCell className="text-muted-foreground">{req.company || '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[300px] truncate" title={req.useCase || undefined}>
                      {req.useCase || '—'}
                    </TableCell>
                    <TableCell><StatusBadge status={req.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(req.createdAt)}</TableCell>
                    {activeTab === 'pending' && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-green-500 border-green-500/30 hover:bg-green-500/10"
                            onClick={() => setConfirmDialog({ request: req, action: 'approve' })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                            onClick={() => setConfirmDialog({ request: req, action: 'reject' })}
                          >
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.action === 'approve' ? 'Approve Access' : 'Reject Request'}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.action === 'approve'
                ? `This will add ${confirmDialog?.request.email} to the allowlist so they can sign up immediately.`
                : `This will reject the request from ${confirmDialog?.request.email}.`}
            </DialogDescription>
          </DialogHeader>

          {confirmDialog?.request.useCase && (
            <div className="bg-foreground/[0.04] border border-foreground/[0.08] rounded-lg px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-1">Use case</p>
              <p className="text-sm">{confirmDialog.request.useCase}</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)} disabled={isActioning}>
              Cancel
            </Button>
            <Button
              variant={confirmDialog?.action === 'reject' ? 'destructive' : 'default'}
              onClick={handleAction}
              disabled={isActioning}
            >
              {isActioning
                ? 'Processing...'
                : confirmDialog?.action === 'approve'
                  ? 'Approve'
                  : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
