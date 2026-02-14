import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Server } from 'lucide-react';
import { MCPConfigurationProps, MCPConfiguration as MCPConfigurationType } from './types';
import { ConfiguredMcpList } from './configured-mcp-list';
import { CustomMCPDialog } from './custom-mcp-dialog';
import { ToolsManager } from './tools-manager';

export const MCPConfigurationNew: React.FC<MCPConfigurationProps> = ({
  configuredMCPs,
  onConfigurationChange,
  agentId,
  versionData,
  saveMode = 'direct',
  versionId,
  isLoading = false
}) => {
  const [showCustomDialog, setShowCustomDialog] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showCustomToolsManager, setShowCustomToolsManager] = useState(false);
  const [selectedMCPForTools, setSelectedMCPForTools] = useState<MCPConfigurationType | null>(null);
  const [selectedAgentId] = useState<string | undefined>(agentId);

  const handleEditMCP = (index: number) => {
    setEditingIndex(index);
    setShowCustomDialog(true);
  };

  const handleConfigureTools = (index: number) => {
    const mcp = configuredMCPs[index];
    setSelectedMCPForTools(mcp);
    setShowCustomToolsManager(true);
  };

  const handleRemoveMCP = (index: number) => {
    const newMCPs = configuredMCPs.filter((_, i) => i !== index);
    onConfigurationChange(newMCPs);
  };

  const handleSaveCustomMCP = (customConfig: any) => {
    const mcpConfig: MCPConfigurationType = {
      name: customConfig.name,
      qualifiedName: `custom_${customConfig.type}_${Date.now()}`,
      config: customConfig.config,
      enabledTools: customConfig.enabledTools,
      selectedProfileId: customConfig.selectedProfileId,
      isCustom: true,
      customType: customConfig.type as 'http' | 'sse'
    };
    onConfigurationChange([...configuredMCPs, mcpConfig]);
  };

  const handleCustomToolsUpdate = (enabledTools: string[]) => {
    if (!selectedMCPForTools) return;

    const updatedMCPs = configuredMCPs.map(mcp =>
      mcp === selectedMCPForTools
        ? { ...mcp, enabledTools }
        : mcp
    );
    onConfigurationChange(updatedMCPs);
    setShowCustomToolsManager(false);
    setSelectedMCPForTools(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button onClick={() => setShowCustomDialog(true)} size="sm" variant="outline" className="gap-2" type="button">
            <Server className="h-4 w-4" />
            Custom MCP
          </Button>
        </div>
      </div>

      {configuredMCPs.length === 0 && (
        <div className="text-center py-12 px-6 ">
          <div className="mx-auto w-12 h-12">
            <Server className="h-6 w-6 text-muted-foreground" />
          </div>
          <h4 className="text-sm font-semibold text-foreground mb-2">
            No integrations configured
          </h4>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Browse the app registry to connect your apps or add custom MCP servers
          </p>
        </div>
      )}

      {configuredMCPs.length > 0 && (
        <div className="space-y-4">
          <ConfiguredMcpList
            configuredMCPs={configuredMCPs}
            onEdit={handleEditMCP}
            onRemove={handleRemoveMCP}
            onConfigureTools={handleConfigureTools}
          />
        </div>
      )}

      <CustomMCPDialog
        open={showCustomDialog}
        onOpenChange={setShowCustomDialog}
        onSave={handleSaveCustomMCP}
      />
      {selectedMCPForTools && (
        <ToolsManager
          mode="custom"
          agentId={selectedAgentId ?? ''}
          mcpConfig={{
            ...selectedMCPForTools.config,
            type: selectedMCPForTools.customType
          }}
          mcpName={selectedMCPForTools.name}
          open={showCustomToolsManager}
          onOpenChange={setShowCustomToolsManager}
          onToolsUpdate={handleCustomToolsUpdate}
          versionData={versionData}
          saveMode={saveMode}
          versionId={versionId}
          initialEnabledTools={(() => {
            return selectedMCPForTools.enabledTools;
          })()}
        />
      )}
    </div>
  );
};