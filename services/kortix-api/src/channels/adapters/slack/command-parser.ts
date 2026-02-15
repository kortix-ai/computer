export type CommandType = 'reset' | 'set_model' | 'set_agent' | 'none';

export interface ParsedCommand {
  type: CommandType;
  remainingText: string;
  model?: { providerID: string; modelID: string };
  agentName?: string;
}

const MODEL_TIERS: Record<string, { providerID: string; modelID: string }> = {
  power: { providerID: 'kortix', modelID: 'kortix/power' },
  basic: { providerID: 'kortix', modelID: 'claude-3-5-haiku' },
};

export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'new session' || lower === 'reset') {
    return { type: 'reset', remainingText: '' };
  }

  const modelMatch = lower.match(/^use\s+(power|basic)\s*$/);
  if (modelMatch) {
    const tier = modelMatch[1] as keyof typeof MODEL_TIERS;
    return {
      type: 'set_model',
      remainingText: '',
      model: MODEL_TIERS[tier],
    };
  }

  const agentMatch = trimmed.match(/^use\s+agent\s+(\S+)\s*$/i);
  if (agentMatch) {
    return {
      type: 'set_agent',
      remainingText: '',
      agentName: agentMatch[1],
    };
  }

  return { type: 'none', remainingText: trimmed };
}
