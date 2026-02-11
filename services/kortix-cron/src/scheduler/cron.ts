import { Cron } from 'croner';

/**
 * Validate a 6-field cron expression (sec min hour day month weekday).
 */
export function isValidCronExpression(expr: string): boolean {
  try {
    new Cron(expr);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the next run time for a cron expression.
 */
export function getNextRun(expr: string, timezone: string = 'UTC'): Date | null {
  try {
    const cron = new Cron(expr, { timezone });
    return cron.nextRun() ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if a cron expression is due to run at a given time.
 * Returns true if the next run time is at or before the reference time.
 */
export function isDue(nextRunAt: Date | null, referenceTime: Date = new Date()): boolean {
  if (!nextRunAt) return false;
  return nextRunAt.getTime() <= referenceTime.getTime();
}

/**
 * Format a cron expression into a human-readable description.
 * Returns a simplified description for common patterns.
 */
export function describeCron(expr: string): string {
  try {
    // Basic parsing of 6-field cron: sec min hour day month weekday
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 6) return expr;

    const [sec, min, hour, day, month, weekday] = parts;

    // Every N seconds
    if (sec.startsWith('*/') && min === '*' && hour === '*') {
      return `Every ${sec.slice(2)} seconds`;
    }

    // Every N minutes
    if (sec === '0' && min.startsWith('*/') && hour === '*') {
      return `Every ${min.slice(2)} minutes`;
    }

    // Every N hours
    if (sec === '0' && min === '0' && hour.startsWith('*/')) {
      return `Every ${hour.slice(2)} hours`;
    }

    // Daily at specific time
    if (sec === '0' && !min.includes('*') && !hour.includes('*') && day === '*' && month === '*' && weekday === '*') {
      return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
    }

    return expr;
  } catch {
    return expr;
  }
}
