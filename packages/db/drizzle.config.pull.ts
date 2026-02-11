import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/schema/legacy',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ['public', 'basejump'],
});