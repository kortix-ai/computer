export const config = {
  PORT: parseInt(process.env.PORT || '8011', 10),
  ENV_MODE: process.env.ENV_MODE || 'local',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Supabase (for auth)
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || '',

  // Scheduler
  SCHEDULER_TICK_INTERVAL_MS: parseInt(process.env.SCHEDULER_TICK_INTERVAL_MS || '1000', 10),
  SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED !== 'false',

  isLocal(): boolean {
    return this.ENV_MODE === 'local';
  },

  isDevelopment(): boolean {
    return this.ENV_MODE === 'local' || this.ENV_MODE === 'staging';
  },
};
