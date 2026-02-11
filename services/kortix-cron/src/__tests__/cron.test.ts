/**
 * Unit tests for scheduler/cron.ts — pure logic, no DB required.
 */
import { describe, test, expect } from 'bun:test';
import { isValidCronExpression, getNextRun, isDue, describeCron } from '../scheduler/cron';

describe('isValidCronExpression', () => {
  test('accepts valid 6-field cron expressions', () => {
    expect(isValidCronExpression('0 */5 * * * *')).toBe(true);    // every 5 min
    expect(isValidCronExpression('*/30 * * * * *')).toBe(true);   // every 30 sec
    expect(isValidCronExpression('0 0 9 * * 1-5')).toBe(true);   // 9am weekdays
    expect(isValidCronExpression('0 0 0 1 1 *')).toBe(true);     // midnight jan 1
    expect(isValidCronExpression('0 0 */2 * * *')).toBe(true);   // every 2 hours
  });

  test('accepts standard 5-field cron (croner supports both)', () => {
    expect(isValidCronExpression('*/5 * * * *')).toBe(true);
  });

  test('rejects invalid expressions', () => {
    expect(isValidCronExpression('')).toBe(false);
    expect(isValidCronExpression('not a cron')).toBe(false);
    expect(isValidCronExpression('60 * * * * *')).toBe(false);    // 60 seconds invalid
    expect(isValidCronExpression('* * * * * * *')).toBe(false);   // 7 fields
  });
});

describe('getNextRun', () => {
  test('returns a Date for valid expressions', () => {
    const next = getNextRun('0 */5 * * * *');
    expect(next).toBeInstanceOf(Date);
    expect(next!.getTime()).toBeGreaterThan(Date.now());
  });

  test('returns null for invalid expressions', () => {
    expect(getNextRun('invalid')).toBeNull();
  });

  test('respects timezone', () => {
    // "Every day at 09:00" in two different timezones should differ
    const utcNext = getNextRun('0 0 9 * * *', 'UTC');
    const tokyoNext = getNextRun('0 0 9 * * *', 'Asia/Tokyo');
    expect(utcNext).toBeInstanceOf(Date);
    expect(tokyoNext).toBeInstanceOf(Date);
    // They should resolve to different UTC timestamps
    // (unless it happens to be exactly the overlap — very unlikely)
    if (utcNext && tokyoNext) {
      expect(utcNext.getTime()).not.toBe(tokyoNext.getTime());
    }
  });

  test('next run is always in the future', () => {
    const next = getNextRun('*/1 * * * * *'); // every second
    expect(next).toBeInstanceOf(Date);
    expect(next!.getTime()).toBeGreaterThanOrEqual(Date.now());
  });
});

describe('isDue', () => {
  test('returns true when nextRunAt is in the past', () => {
    const past = new Date(Date.now() - 60_000);
    expect(isDue(past)).toBe(true);
  });

  test('returns true when nextRunAt equals reference', () => {
    const now = new Date();
    expect(isDue(now, now)).toBe(true);
  });

  test('returns false when nextRunAt is in the future', () => {
    const future = new Date(Date.now() + 60_000);
    expect(isDue(future)).toBe(false);
  });

  test('returns false for null', () => {
    expect(isDue(null)).toBe(false);
  });
});

describe('describeCron', () => {
  test('describes every N seconds', () => {
    expect(describeCron('*/10 * * * * *')).toBe('Every 10 seconds');
  });

  test('describes every N minutes', () => {
    expect(describeCron('0 */5 * * * *')).toBe('Every 5 minutes');
  });

  test('describes every N hours', () => {
    expect(describeCron('0 0 */3 * * *')).toBe('Every 3 hours');
  });

  test('describes daily at specific time', () => {
    expect(describeCron('0 30 9 * * *')).toBe('Daily at 09:30');
  });

  test('returns raw expression for complex patterns', () => {
    const expr = '0 0 9 * * 1-5';
    expect(describeCron(expr)).toBe(expr);
  });

  test('returns raw expression for invalid input', () => {
    expect(describeCron('invalid')).toBe('invalid');
  });
});
