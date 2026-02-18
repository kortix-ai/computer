import { config } from '../../config';
import { PipedreamProvider } from './pipedream';
import type { AuthProvider } from './types';

export type { AuthProvider, ConnectedAccount, AuthToken, ConnectTokenResult, AppInfo, AppListResult } from './types';

let _provider: AuthProvider | null = null;

export function createAuthProvider(): AuthProvider {
  if (_provider) return _provider;

  const providerName = config.INTEGRATION_AUTH_PROVIDER;

  switch (providerName) {
    case 'pipedream':
      _provider = new PipedreamProvider({
        clientId: config.PIPEDREAM_CLIENT_ID,
        clientSecret: config.PIPEDREAM_CLIENT_SECRET,
        projectId: config.PIPEDREAM_PROJECT_ID,
        environment: config.PIPEDREAM_ENVIRONMENT,
      });
      break;
    default:
      throw new Error(`Unknown integration auth provider: ${providerName}`);
  }

  return _provider;
}
