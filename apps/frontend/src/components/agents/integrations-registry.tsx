import React from 'react';

interface IntegrationsRegistryProps {
  showAgentSelector?: boolean;
  selectedAgentId?: string;
  onAgentChange?: (agentId: string | undefined) => void;
  onToolsSelected?: (profileId: string, selectedTools: string[], appName: string, appSlug: string) => void;
  onClose?: () => void;
  initialSelectedApp?: string | null;
  isBlocked?: boolean;
  onBlockedClick?: () => void;
}

export const IntegrationsRegistry: React.FC<IntegrationsRegistryProps> = () => {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      No integrations available in local mode.
    </div>
  );
};
