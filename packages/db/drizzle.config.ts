import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: ['./src/schema/kortix.ts', './src/schema/public.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ['kortix', 'public'],
  // Only manage these specific tables. basejump.* and api_keys are managed
  // externally (Supabase / cloud migrations) and excluded from drizzle push.
  tablesFilter: [
    'kortix.*',
    'credit_accounts',
    'credit_ledger',
    'credit_usage',
    'account_deletion_requests',
    'credit_purchases',
  ],
});
