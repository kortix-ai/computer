/**
 * Session Pruning — Configuration & Types
 *
 * Adapted from OpenClaw's context-pruning extension for Anthropic prompt-cache
 * optimization. Settings are sourced from the central config.ts (which reads env vars).
 */

import { config } from '../../../config';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * OpenAI-compatible message. Loose type — we only inspect `role` and `content`,
 * and preserve all other fields (tools, response_format extensions, etc.).
 */
export interface OpenAIMessage {
  role: string;
  content?:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>
    | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  [key: string]: unknown;
}

export interface PruningSettings {
  /** TTL in milliseconds. Sessions idle longer than this get pruned. */
  ttlMs: number;
  /** Number of trailing assistant messages whose tool results are protected. */
  keepLastAssistants: number;
  /** Context-window fill ratio that triggers soft-trim. */
  softTrimRatio: number;
  /** Context-window fill ratio that triggers hard-clear. */
  hardClearRatio: number;
  /** Minimum total chars in prunable tool results before hard-clear kicks in. */
  minPrunableToolChars: number;
  softTrim: {
    /** Tool results larger than this (chars) are candidates for soft-trim. */
    maxChars: number;
    /** Chars to keep from the beginning. */
    headChars: number;
    /** Chars to keep from the end. */
    tailChars: number;
  };
  hardClear: {
    enabled: boolean;
    /** Replacement text for hard-cleared tool results. */
    placeholder: string;
  };
}

export interface PruningResult {
  messages: OpenAIMessage[];
  pruned: boolean;
  stats: {
    softTrimmed: number;
    hardCleared: number;
    charsSaved: number;
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Approximate chars per token for context budget estimation. */
export const CHARS_PER_TOKEN = 4;

/** Approximate char budget for an image content block. */
export const IMAGE_CHAR_ESTIMATE = 8_000;

// ─── Settings (from central config.ts) ──────────────────────────────────────

export const DEFAULT_SETTINGS: PruningSettings = {
  ttlMs: config.SESSION_PRUNING_TTL_MS,
  keepLastAssistants: config.SESSION_PRUNING_KEEP_LAST,
  softTrimRatio: config.SESSION_PRUNING_SOFT_RATIO,
  hardClearRatio: config.SESSION_PRUNING_HARD_RATIO,
  minPrunableToolChars: config.SESSION_PRUNING_MIN_CHARS,
  softTrim: {
    maxChars: config.SESSION_PRUNING_SOFT_MAX,
    headChars: config.SESSION_PRUNING_SOFT_HEAD,
    tailChars: config.SESSION_PRUNING_SOFT_TAIL,
  },
  hardClear: {
    enabled: config.SESSION_PRUNING_HARD_ENABLED,
    placeholder: config.SESSION_PRUNING_HARD_PLACEHOLDER,
  },
};

/** Master kill-switch: set SESSION_PRUNING_ENABLED=false to disable. */
export const PRUNING_ENABLED = config.SESSION_PRUNING_ENABLED;
