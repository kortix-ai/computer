export interface MCPConfiguration {
  name: string;
  qualifiedName: string;
  mcp_qualified_name?: string; 
  config: Record<string, any>;
  enabledTools: string[];
  selectedProfileId?: string;
  isCustom?: boolean;
  customType?: 'http' | 'sse';
}
  
export interface MCPConfigurationProps {
  configuredMCPs: MCPConfiguration[];
  onConfigurationChange: (mcps: MCPConfiguration[]) => void;
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
