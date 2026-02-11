import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/kortix.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ['kortix'],
});
