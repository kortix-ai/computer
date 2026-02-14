import React from 'react';
import { MCPConfigurationNew } from './mcp/mcp-configuration-new';

interface AgentMCPConfigurationProps {
  configuredMCPs: any[];
  customMCPs: any[];
  onMCPChange: (updates: { configured_mcps: any[]; custom_mcps: any[] }) => void;
  agentId?: string;
  versionData?: {
    configured_mcps?: any[];
    custom_mcps?: any[];
    system_prompt?: string;
    agentpress_tools?: any;
  };
  saveMode?: 'direct' | 'callback';
  versionId?: string;
  isLoading?: boolean;
}

export const AgentMCPConfiguration: React.FC<AgentMCPConfigurationProps> = ({
  configuredMCPs,
  customMCPs,
  onMCPChange,
  agentId,
  versionData,
  saveMode = 'direct',
  versionId,
  isLoading = false
}) => {
  const allMCPs = [
    ...(configuredMCPs || []),
    ...(customMCPs || []).filter(customMcp => {
      // Filter out composio MCPs
      return customMcp.type !== 'composio' && customMcp.customType !== 'composio';
    }).map(customMcp => {
      // Map 'sse' backend type to 'http' for frontend display
      const displayType = customMcp.type === 'sse' ? 'http' : (customMcp.type || customMcp.customType);
      
      return {
        name: customMcp.name,
        qualifiedName: customMcp.qualifiedName || `custom_${displayType}_${customMcp.name.replace(' ', '_').toLowerCase()}`,
        config: customMcp.config,
        enabledTools: customMcp.enabledTools,
        isCustom: true,
        customType: displayType
      };
    })
  ];

  const handleConfigurationChange = (mcps: any[]) => {
    console.log('[AgentMCPConfiguration] Configuration changed:', mcps);
    
    const configured = mcps.filter(mcp => !mcp.isCustom);
    const custom = mcps
      .filter(mcp => mcp.isCustom)
      .map(mcp => {
        // Map 'http' to 'sse' for backend compatibility
        const backendType = mcp.customType === 'http' ? 'sse' : mcp.customType;
        
        return {
          name: mcp.name,
          type: backendType,
          customType: mcp.customType,
          config: mcp.config,
          enabledTools: mcp.enabledTools
        };
      });

    console.log('[AgentMCPConfiguration] Sending to parent - configured:', configured, 'custom:', custom);
    
    onMCPChange({
      configured_mcps: configured,
      custom_mcps: custom
    });
  };

  return (
    <MCPConfigurationNew
      configuredMCPs={allMCPs}
      onConfigurationChange={handleConfigurationChange}
      agentId={agentId}
      versionData={versionData}
      saveMode={saveMode}
      versionId={versionId}
      isLoading={isLoading}
    />
  );
}; 