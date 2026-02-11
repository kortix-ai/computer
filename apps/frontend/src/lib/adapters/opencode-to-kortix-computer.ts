/**
 * Adapter: OpenCode SDK ToolPart → KortixComputer ToolCallInput
 *
 * Converts OpenCode session messages into the ToolCallInput[] format
 * that KortixComputer expects, enabling the computer panel to display
 * OpenCode tool calls.
 */

import type { MessageWithParts, ToolPart, ToolState } from '@/ui';
import type { ToolCallInput } from '@/components/thread/kortix-computer/KortixComputer';
import type { ToolCallData, ToolResultData } from '@/components/thread/tool-views/types';

/**
 * OpenCode tool names are prefixed with "oc-" to avoid collisions with
 * AgentPress tool names in the ToolViewRegistry.
 */
function toRegistryName(tool: string): string {
  return `oc-${tool}`;
}

function adaptToolState(state: ToolState): ToolResultData | undefined {
  switch (state.status) {
    case 'completed':
      return {
        success: true,
        output: state.output,
        timestamp: state.time?.end ? new Date(state.time.end).toISOString() : undefined,
      };
    case 'error':
      return {
        success: false,
        output: state.error,
        error: state.error,
        timestamp: state.time?.end ? new Date(state.time.end).toISOString() : undefined,
      };
    case 'pending':
    case 'running':
      // No result yet — tool is still in progress
      return undefined;
    default:
      return undefined;
  }
}

function adaptToolPart(part: ToolPart): ToolCallInput {
  const toolCallData: ToolCallData = {
    tool_call_id: part.callID,
    function_name: toRegistryName(part.tool),
    arguments: {
      ...part.state.input,
      // Stash original tool name and full state for custom ToolViews
      _oc_tool: part.tool,
      _oc_state: part.state,
    },
    source: 'native',
  };

  const toolResult = adaptToolState(part.state);

  const assistantTimestamp = ('time' in part.state && part.state.time)
    ? new Date((part.state.time as any).start).toISOString()
    : undefined;

  const toolTimestamp = toolResult?.timestamp;

  return {
    toolCall: toolCallData,
    toolResult,
    assistantTimestamp,
    toolTimestamp,
    isSuccess: toolResult ? toolResult.success : undefined,
  };
}

/**
 * Extract all ToolParts from OpenCode messages and convert them to
 * the ToolCallInput[] format used by KortixComputer.
 */
export function adaptMessagesToToolCalls(messages: MessageWithParts[]): ToolCallInput[] {
  const toolCalls: ToolCallInput[] = [];

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === 'tool') {
        toolCalls.push(adaptToolPart(part as ToolPart));
      }
    }
  }

  return toolCalls;
}

/**
 * Map OpenCode session busy state to the agentStatus string
 * that KortixComputer expects.
 */
export function adaptAgentStatus(isBusy: boolean): 'idle' | 'running' {
  return isBusy ? 'running' : 'idle';
}
