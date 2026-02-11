/**
 * Hono environment type for the application.
 * Defines context variables set by middleware.
 */
export type AppEnv = {
  Variables: {
    userId: string;
    userEmail: string;
  };
};
