import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Create a Drizzle database client.
 * 
 * @param databaseUrl - PostgreSQL connection string
 * @param options - Additional postgres.js options
 * @returns Drizzle database client with full schema
 */
export function createDb(databaseUrl: string, options?: postgres.Options<{}>) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  // Connection with prepare: false for Supabase connection pooler compatibility
  const client = postgres(databaseUrl, { 
    prepare: false,
    ...options 
  });

  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;