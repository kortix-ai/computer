export const config = {
  PORT: parseInt(process.env.PORT || '8013', 10),
  ENV_MODE: process.env.ENV_MODE || 'local',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',

  // RevenueCat
  REVENUECAT_API_KEY: process.env.REVENUECAT_API_KEY || '',
  REVENUECAT_WEBHOOK_SECRET: process.env.REVENUECAT_WEBHOOK_SECRET || '',

  isLocal(): boolean {
    return this.ENV_MODE === 'local';
  },

  isDevelopment(): boolean {
    return this.ENV_MODE === 'local' || this.ENV_MODE === 'staging';
  },
};
