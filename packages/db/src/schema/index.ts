// Kortix schema (the single source of truth for all new tables)
export * from './kortix';

// Legacy schema (existing tables from drizzle-kit pull)
// NOTE: Not exported by default due to broken auth.users references
// from Supabase's auth schema which drizzle-kit cannot introspect.
// Import directly from '@kortix/db/schema/legacy' if needed.
// export * as legacy from './legacy';
