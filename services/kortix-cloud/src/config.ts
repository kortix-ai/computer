export const config = {
  PORT: parseInt(process.env.PORT || '8009', 10),
  ENV_MODE: process.env.ENV_MODE || 'local',

  // Supabase (JWT verification + ownership checks)
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
