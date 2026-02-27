import { describe, it, expect } from 'bun:test';
import { parseCommand } from '../channels/adapters/slack/command-parser';

describe('Slack Command Parser', () => {
  describe('reset commands', () => {
    it('parses "reset"', () => {
      const result = parseCommand('reset');
      expect(result.type).toBe('reset');
      expect(result.remainingText).toBe('');
    });

    it('parses "new session"', () => {
      const result = parseCommand('new session');
      expect(result.type).toBe('reset');
    });

    it('parses "Reset" (case insensitive)', () => {
      const result = parseCommand('Reset');
      expect(result.type).toBe('reset');
    });

    it('does NOT match "reset something"', () => {
      const result = parseCommand('reset something');
      expect(result.type).toBe('none');
      expect(result.remainingText).toBe('reset something');
    });
  });

  describe('model commands', () => {
    it('parses "use power"', () => {
      const result = parseCommand('use power');
      expect(result.type).toBe('set_model');
      expect(result.model?.modelID).toBe('anthropic/claude-opus-4.6');
      expect(result.model?.providerID).toBe('kortix');
    });

    it('parses "use basic"', () => {
      const result = parseCommand('use basic');
      expect(result.type).toBe('set_model');
      expect(result.model?.modelID).toBe('anthropic/claude-sonnet-4.6');
    });

    it('parses "Use Power" (case insensitive)', () => {
      const result = parseCommand('Use Power');
      expect(result.type).toBe('set_model');
    });
  });

  describe('agent commands', () => {
    it('parses "use agent coder"', () => {
      const result = parseCommand('use agent coder');
      expect(result.type).toBe('set_agent');
      expect(result.agentName).toBe('coder');
    });

    it('parses "Use Agent my-custom-agent"', () => {
      const result = parseCommand('Use Agent my-custom-agent');
      expect(result.type).toBe('set_agent');
      expect(result.agentName).toBe('my-custom-agent');
    });
  });

  describe('passthrough', () => {
    it('returns "none" for regular text', () => {
      const result = parseCommand('Hello, how are you?');
      expect(result.type).toBe('none');
      expect(result.remainingText).toBe('Hello, how are you?');
    });

    it('returns "none" for empty string', () => {
      const result = parseCommand('');
      expect(result.type).toBe('none');
      expect(result.remainingText).toBe('');
    });

    it('trims whitespace', () => {
      const result = parseCommand('  hello world  ');
      expect(result.type).toBe('none');
      expect(result.remainingText).toBe('hello world');
    });
  });
});
