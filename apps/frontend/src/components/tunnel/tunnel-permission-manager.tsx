'use client';

/**
 * TunnelPermissionManager — vertical stack of capability sections
 * with GitHub-style scope-based permission management.
 */

import React from 'react';
import {
  useTunnelPermissions,
  useGrantTunnelPermission,
  useRevokeTunnelPermission,
} from '@/hooks/tunnel/use-tunnel';
import { CAPABILITY_REGISTRY } from './types';
import type { PermissionScope } from './types';
import { TunnelCapabilitySection } from './tunnel-capability-section';

interface TunnelPermissionManagerProps {
  tunnelId: string;
}

export function TunnelPermissionManager({ tunnelId }: TunnelPermissionManagerProps) {
  const { data: permissions, isLoading } = useTunnelPermissions(tunnelId);
  const grantMutation = useGrantTunnelPermission();
  const revokeMutation = useRevokeTunnelPermission();

  const activePermissions = permissions?.filter((p) => p.status === 'active') || [];

  const handleGrant = async (capability: string, scope: PermissionScope, expiresAt?: string) => {
    await grantMutation.mutateAsync({
      tunnelId,
      capability,
      scope: scope as Record<string, unknown>,
      expiresAt,
    });
  };

  const handleRevoke = async (permissionId: string) => {
    await revokeMutation.mutateAsync({ tunnelId, permissionId });
  };

  const handleRevokeAll = async (capability: string) => {
    const capPerms = activePermissions.filter((p) => p.capability === capability);
    for (const perm of capPerms) {
      await revokeMutation.mutateAsync({ tunnelId, permissionId: perm.permissionId });
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading permissions...</div>;
  }

  return (
    <div className="space-y-2">
      {CAPABILITY_REGISTRY.map((cap) => (
        <TunnelCapabilitySection
          key={cap.key}
          capability={cap}
          permissions={activePermissions.filter((p) => p.capability === cap.key)}
          onGrant={(scope, expiresAt) => handleGrant(cap.key, scope, expiresAt)}
          onRevoke={handleRevoke}
          onRevokeAll={() => handleRevokeAll(cap.key)}
          isGranting={grantMutation.isPending}
          isRevoking={revokeMutation.isPending}
        />
      ))}
    </div>
  );
}
