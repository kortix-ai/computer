export const config = {
  PORT: parseInt(process.env.PORT || '8010', 10),
  ENV_MODE: process.env.ENV_MODE || 'local',

  // Database (Drizzle ORM - for sandbox ownership checks)
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Supabase (kept for JWT auth verification only)
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Daytona SDK (sandbox management + preview links)
  DAYTONA_API_KEY: process.env.DAYTONA_API_KEY || '',
  DAYTONA_SERVER_URL: process.env.DAYTONA_SERVER_URL || '',
  DAYTONA_TARGET: process.env.DAYTONA_TARGET || '',

  isDevelopment(): boolean {
    return this.ENV_MODE === 'local' || this.ENV_MODE === 'staging';
  },
};
