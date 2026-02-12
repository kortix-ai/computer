export const config = {
  PORT: parseInt(process.env.PORT || '8012', 10),
  ENV_MODE: process.env.ENV_MODE || 'local',

  // Database (Drizzle ORM)
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Supabase (JWT auth verification only)
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Daytona SDK (sandbox provisioning)
  DAYTONA_API_KEY: process.env.DAYTONA_API_KEY || '',
  DAYTONA_SERVER_URL: process.env.DAYTONA_SERVER_URL || '',
  DAYTONA_TARGET: process.env.DAYTONA_TARGET || '',

  // Kortix Router URL (injected into sandbox as KORTIX_URL env var)
  KORTIX_URL: process.env.KORTIX_URL || '',

  isDevelopment(): boolean {
    return this.ENV_MODE === 'local' || this.ENV_MODE === 'staging';
  },
};
