'use client';

/**
 * TunnelCapabilitySection — GitHub-style expandable card per capability.
 *
 * Collapsed: Switch toggle + icon + label + badge ("N active rules") + chevron
 * Expanded:  Active rules with summaries + expiry + revoke, then "Add Rule" form
 */

import React, { useState } from 'react';
import { ChevronDown, Plus, Clock, ShieldOff, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { TunnelPermission } from '@/hooks/tunnel/use-tunnel';
import type { CapabilityInfo, PermissionScope } from './types';
import { EXPIRY_OPTIONS, getExpiresAt, getDefaultScope } from './types';
import { FilesystemScopeEditor } from './scope-editors/filesystem-scope-editor';
import { ShellScopeEditor } from './scope-editors/shell-scope-editor';
import { NetworkScopeEditor } from './scope-editors/network-scope-editor';
import { getScopeEditorCapability, summarizeScope } from './scope-editors';
import type { FilesystemScope, ShellScope, NetworkScope } from './types';

interface TunnelCapabilitySectionProps {
  capability: CapabilityInfo;
  permissions: TunnelPermission[];
  onGrant: (scope: PermissionScope, expiresAt?: string) => Promise<void>;
  onRevoke: (permissionId: string) => Promise<void>;
  onRevokeAll: () => Promise<void>;
  isGranting: boolean;
  isRevoking: boolean;
}

export function TunnelCapabilitySection({
  capability,
  permissions,
  onGrant,
  onRevoke,
  onRevokeAll,
  isGranting,
  isRevoking,
}: TunnelCapabilitySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newScope, setNewScope] = useState<PermissionScope>(getDefaultScope(capability.key));
  const [expiryValue, setExpiryValue] = useState('7d');

  const activeCount = permissions.length;
  const isEnabled = activeCount > 0;
  const Icon = capability.icon;
  const scopeEditorType = getScopeEditorCapability(capability.key);

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      // Turning ON: expand so user can configure
      setExpanded(true);
      if (scopeEditorType) {
        setShowAddForm(true);
      } else {
        // No scope editor — grant immediately with empty scope
        await onGrant({});
      }
    } else {
      // Turning OFF: revoke all
      await onRevokeAll();
      setExpanded(false);
      setShowAddForm(false);
    }
  };

  const handleGrant = async () => {
    const expiry = EXPIRY_OPTIONS.find((o) => o.value === expiryValue);
    const expiresAt = expiry ? getExpiresAt(expiry) : undefined;
    await onGrant(newScope, expiresAt);
    setShowAddForm(false);
    setNewScope(getDefaultScope(capability.key));
  };

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="rounded-xl border bg-card">
        {/* Header row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={isGranting || isRevoking}
          />
          <div className={cn(
            'flex items-center justify-center w-8 h-8 rounded-lg border shrink-0',
            isEnabled ? 'bg-primary/10 border-primary/20' : 'bg-muted border-border/50',
          )}>
            <Icon className={cn('h-4 w-4', isEnabled ? 'text-primary' : 'text-muted-foreground')} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{capability.label}</span>
              {activeCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {activeCount} active rule{activeCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{capability.description}</p>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
              <ChevronDown className={cn(
                'h-4 w-4 transition-transform duration-200',
                expanded ? 'rotate-180' : '',
              )} />
            </Button>
          </CollapsibleTrigger>
        </div>

        {/* Expanded content */}
        <CollapsibleContent>
          <div className="border-t px-4 py-3 space-y-3">
            {/* Active rules */}
            {permissions.length > 0 && (
              <div className="space-y-1.5">
                {permissions.map((perm) => (
                  <ActiveRuleRow
                    key={perm.permissionId}
                    permission={perm}
                    capability={capability.key}
                    onRevoke={() => onRevoke(perm.permissionId)}
                    isRevoking={isRevoking}
                  />
                ))}
              </div>
            )}

            {/* Add Rule form */}
            {showAddForm && scopeEditorType ? (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">New permission rule</p>
                {scopeEditorType === 'filesystem' && (
                  <FilesystemScopeEditor
                    scope={newScope as FilesystemScope}
                    onChange={(s) => setNewScope(s)}
                  />
                )}
                {scopeEditorType === 'shell' && (
                  <ShellScopeEditor
                    scope={newScope as ShellScope}
                    onChange={(s) => setNewScope(s)}
                  />
                )}
                {scopeEditorType === 'network' && (
                  <NetworkScopeEditor
                    scope={newScope as NetworkScope}
                    onChange={(s) => setNewScope(s)}
                  />
                )}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Expires:</span>
                    <Select value={expiryValue} onValueChange={setExpiryValue}>
                      <SelectTrigger size="sm" className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPIRY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddForm(false);
                        setNewScope(getDefaultScope(capability.key));
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleGrant} disabled={isGranting}>
                      Grant
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              scopeEditorType && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setNewScope(getDefaultScope(capability.key));
                    setShowAddForm(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Rule
                </Button>
              )
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ─── Sub-component ──────────────────────────────────────────────────────────

function ActiveRuleRow({
  permission,
  capability,
  onRevoke,
  isRevoking,
}: {
  permission: TunnelPermission;
  capability: string;
  onRevoke: () => void;
  isRevoking: boolean;
}) {
  const scope = permission.scope as PermissionScope;
  const summary = summarizeScope(capability, scope);
  const isExpiringSoon = permission.expiresAt && new Date(permission.expiresAt).getTime() - Date.now() < 3_600_000;

  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <div className="flex-1 min-w-0">
        <span className="text-xs">{summary}</span>
        {permission.expiresAt && (
          <span className={cn(
            'ml-2 text-xs inline-flex items-center gap-0.5',
            isExpiringSoon ? 'text-amber-500' : 'text-muted-foreground',
          )}>
            <Clock className="h-3 w-3" />
            {isExpiringSoon ? 'Expiring soon' : `Expires ${new Date(permission.expiresAt).toLocaleDateString()}`}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
        onClick={onRevoke}
        disabled={isRevoking}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
