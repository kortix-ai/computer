export type SandboxProviderType = 'daytona' | 'local_docker' | 'auto';

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
  DAYTONA_SNAPSHOT: process.env.DAYTONA_SNAPSHOT || '',

  // Kortix Router URL (injected into sandbox as KORTIX_URL env var)
  KORTIX_URL: process.env.KORTIX_URL || '',

  // Sandbox provisioning
  SANDBOX_PROVIDER: (process.env.SANDBOX_PROVIDER || 'auto') as SandboxProviderType,
  SANDBOX_IMAGE: process.env.SANDBOX_IMAGE || 'heyagi/sandbox:latest',
  DOCKER_HOST: process.env.DOCKER_HOST || '', // empty = default local socket

  // Local Docker sandbox defaults
  SANDBOX_NETWORK: process.env.SANDBOX_NETWORK || '', // empty = default bridge

  isDevelopment(): boolean {
    return this.ENV_MODE === 'local' || this.ENV_MODE === 'staging';
  },

  isDaytonaEnabled(): boolean {
    if (this.SANDBOX_PROVIDER === 'daytona') return true;
    if (this.SANDBOX_PROVIDER === 'local_docker') return false;
    // 'auto' — enable if credentials are configured
    return !!this.DAYTONA_API_KEY;
  },

  isLocalDockerEnabled(): boolean {
    if (this.SANDBOX_PROVIDER === 'local_docker') return true;
    if (this.SANDBOX_PROVIDER === 'daytona') return false;
    // 'auto' — always available (Docker socket assumed present)
    return true;
  },
};
