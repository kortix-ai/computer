/**
 * @deprecated - All data access migrated to Drizzle via @kortix/db.
 * This file is kept for reference only. Remove once fully verified.
 */

import { config } from '../config';

export function isSupabaseConfigured(): boolean {
  return !!(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
}
