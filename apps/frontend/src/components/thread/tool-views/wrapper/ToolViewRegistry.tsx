import React, { useMemo } from 'react';
import { ToolViewProps } from '../types';
import { GenericToolView } from '../GenericToolView';
import { ocToolViewRegistrations } from '../opencode';

export type ToolViewComponent = React.ComponentType<ToolViewProps>;

type ToolViewRegistryType = Record<string, ToolViewComponent>;

/**
 * Tool view registry — OpenCode views only.
 * All oc-* tools are registered via ocToolViewRegistrations.
 * Unknown tools fall through to GenericToolView.
 */
const defaultRegistry: ToolViewRegistryType = {
  ...ocToolViewRegistrations,
  'default': GenericToolView,
};

class ToolViewRegistry {
  private registry: ToolViewRegistryType;
  constructor(initialRegistry: Partial<ToolViewRegistryType> = {}) {
    this.registry = { ...defaultRegistry };
    Object.entries(initialRegistry).forEach(([key, value]) => {
      if (value !== undefined) {
        this.registry[key] = value;
      }
    });
  }

  register(toolName: string, component: ToolViewComponent): void {
    this.registry[toolName] = component;
  }

  registerMany(components: Partial<ToolViewRegistryType>): void {
    Object.assign(this.registry, components);
  }

  get(toolName: string): ToolViewComponent {
    return this.registry[toolName] || this.registry['default'];
  }

  has(toolName: string): boolean {
    return toolName in this.registry;
  }

  getToolNames(): string[] {
    return Object.keys(this.registry).filter(key => key !== 'default');
  }

  clear(): void {
    this.registry = { default: this.registry['default'] };
  }
}

export const toolViewRegistry = new ToolViewRegistry();

export function useToolView(toolName: string): ToolViewComponent {
  return useMemo(() => toolViewRegistry.get(toolName), [toolName]);
}

export function ToolView({ toolCall, toolResult, ...props }: ToolViewProps) {
  const name = toolCall?.function_name?.replace(/_/g, '-').toLowerCase() || 'default';
  const ToolViewComponent = useToolView(name);

  if (!toolCall || !toolCall.function_name) {
    return (
      <div className="h-full w-full max-h-full max-w-full overflow-hidden min-w-0 min-h-0" style={{ contain: 'layout style' }}>
        <GenericToolView toolCall={toolCall} toolResult={toolResult} {...props} />
      </div>
    );
  }

  return (
    <div className="h-full w-full max-h-full max-w-full overflow-hidden min-w-0 min-h-0" style={{ contain: 'layout style' }}>
      <ToolViewComponent toolCall={toolCall} toolResult={toolResult} {...props} />
    </div>
  );
}
