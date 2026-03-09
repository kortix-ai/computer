import type {
  AuthProvider,
  ConnectedAccount,
  AuthToken,
  ConnectTokenResult,
  AppInfo,
  AppListResult,
  ProxyRequest,
  ProxyResponse,
  ActionListResult,
  ActionSummary,
  ActionParam,
  ActionRunResult,
} from './types';

interface PipedreamConfig {
  clientId: string;
  clientSecret: string;
  projectId: string;
  environment: string;
}

function isNonEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

export class PipedreamProvider implements AuthProvider {
  readonly name = 'pipedream';

  private readonly baseUrl = 'https://api.pipedream.com';
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly projectId: string;
  private readonly environment: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  private actionsCache = new Map<string, { data: ActionListResult; expiresAt: number }>();
  private static readonly ACTIONS_CACHE_TTL = 30 * 60 * 1000;

  constructor(cfg: PipedreamConfig) {
    this.clientId = cfg.clientId;
    this.clientSecret = cfg.clientSecret;
    this.projectId = cfg.projectId;
    this.environment = cfg.environment;
  }

  private getFrontendOriginAndBase(): { origin: string; base: string } {
    const raw = process.env.FRONTEND_URL || 'http://localhost:3000';
    try {
      const url = new URL(raw);
      return {
        origin: url.origin,
        base: url.origin,
      };
    } catch {
      return {
        origin: 'http://localhost:3000',
        base: 'http://localhost:3000',
      };
    }
  }

  private async getApiToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const res = await fetch(`${this.baseUrl}/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Pipedream auth failed (${res.status}): ${body}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  private async apiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.getApiToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-pd-environment': this.environment,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipedream API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async createConnectToken(accountId: string, app?: string): Promise<ConnectTokenResult> {
    const { origin, base } = this.getFrontendOriginAndBase();
    const body: Record<string, unknown> = {
      external_user_id: accountId,
      allowed_origins: [origin],
      success_redirect_uri: `${base}/integrations?connected=true`,
      error_redirect_uri: `${base}/integrations?error=true`,
    };
    if (app) {
      body.app_slug = app;
    }

    const token = await this.getApiToken();
    const res = await fetch(`${this.baseUrl}/v1/connect/${this.projectId}/tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-pd-environment': this.environment,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipedream connect token failed (${res.status}): ${text}`);
    }

    const data = await res.json() as {
      token: string;
      expires_at: string;
      connect_link_url?: string;
    };

    return {
      token: data.token,
      expiresAt: data.expires_at,
      connectUrl: data.connect_link_url,
    };
  }

  async listAccounts(accountId: string): Promise<ConnectedAccount[]> {
    const data = await this.apiRequest<{
      data: Array<{
        id: string;
        name?: string;
        external_user_id: string;
        app: { name_slug: string; name: string };
        created_at: string;
        healthy: boolean;
      }>;
    }>('GET', `/v1/connect/${this.projectId}/accounts?external_user_id=${encodeURIComponent(accountId)}&include_credentials=0`);

    return (data.data || []).map((a) => ({
      id: a.id,
      app: a.app.name_slug,
      appName: a.app.name,
      externalUserId: a.external_user_id,
      createdAt: a.created_at,
    }));
  }

  async getAccount(accountId: string, accountProviderId: string): Promise<ConnectedAccount | null> {
    try {
      const data = await this.apiRequest<{
        id: string;
        name?: string;
        external_user_id: string;
        app: { name_slug: string; name: string };
        created_at: string;
      }>('GET', `/v1/connect/${this.projectId}/accounts/${accountProviderId}`);

      if (data.external_user_id !== accountId) return null;

      return {
        id: data.id,
        app: data.app.name_slug,
        appName: data.app.name,
        externalUserId: data.external_user_id,
        createdAt: data.created_at,
      };
    } catch {
      return null;
    }
  }

  async getAuthToken(accountId: string, app: string, providerAccountId?: string): Promise<AuthToken> {
    let pdAccountId: string;

    if (providerAccountId) {
      pdAccountId = providerAccountId;
    } else {
      const accounts = await this.listAccounts(accountId);
      const account = accounts.find((a) => a.app === app);
      if (!account) {
        throw new Error(`No connected account found for app "${app}"`);
      }
      pdAccountId = account.id;
    }

    const data = await this.apiRequest<{
      id: string;
      credentials: {
        oauth_access_token?: string;
        oauth_refresh_token?: string;
        token_type?: string;
        oauth_uid?: string;
        [key: string]: unknown;
      };
    }>('GET', `/v1/connect/${this.projectId}/accounts/${pdAccountId}?include_credentials=1`);

    const creds = data.credentials;
    if (!creds?.oauth_access_token) {
      throw new Error(`No access token available for app "${app}"`);
    }

    return {
      accessToken: creds.oauth_access_token,
      tokenType: creds.token_type || 'Bearer',
      refreshToken: creds.oauth_refresh_token,
    };
  }

  async deleteAccount(_accountId: string, accountProviderId: string): Promise<void> {
    await this.apiRequest<void>('DELETE', `/v1/connect/${this.projectId}/accounts/${accountProviderId}`);
  }

  async proxyRequest(accountId: string, app: string, request: ProxyRequest, providerAccountId?: string): Promise<ProxyResponse> {
    let pdAccountId: string;

    if (providerAccountId) {
      pdAccountId = providerAccountId;
    } else {
      const accounts = await this.listAccounts(accountId);
      const account = accounts.find((a) => a.app === app);
      if (!account) {
        throw new Error(`No connected account found for app "${app}"`);
      }
      pdAccountId = account.id;
    }

    const encodedUrl = Buffer.from(request.url)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const token = await this.getApiToken();
    const proxyUrl = `${this.baseUrl}/v1/connect/${this.projectId}/proxy/${encodedUrl}?external_user_id=${encodeURIComponent(accountId)}&account_id=${pdAccountId}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'x-pd-environment': this.environment,
    };

    if (request.headers) {
      for (const [key, value] of Object.entries(request.headers)) {
        const lower = key.toLowerCase();
        if (lower !== 'authorization' && lower !== 'host') {
          headers[`x-pd-proxy-${key}`] = value;
        }
      }
    }

    if (request.body) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(proxyUrl, {
      method: request.method,
      headers,
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    });

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let body: unknown;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    return {
      status: res.status,
      headers: responseHeaders,
      body,
    };
  }

  async listApps(query?: string, limit = 48, cursor?: string): Promise<AppListResult> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('limit', String(limit));
    if (cursor) params.set('after', cursor);
    // Sort by popularity (featured_weight) descending so popular apps appear first
    if (!query) {
      params.set('sort_key', 'featured_weight');
      params.set('sort_direction', 'desc');
    }

    const data = await this.apiRequest<{
      page_info: {
        total_count: number;
        count: number;
        end_cursor?: string;
      };
      data: Array<{
        name_slug: string;
        name: string;
        description?: string;
        img_src?: string;
        auth_type?: string;
        categories: string[];
        featured_weight?: number;
      }>;
    }>('GET', `/v1/connect/${this.projectId}/apps?${params.toString()}`);

    const apps = (data.data || []).map((a) => ({
      slug: a.name_slug,
      name: a.name,
      description: a.description,
      imgSrc: a.img_src,
      authType: a.auth_type,
      categories: a.categories || [],
      featuredWeight: a.featured_weight,
    }));

    const pageInfo = data.page_info || {};
    return {
      apps,
      pageInfo: {
        totalCount: pageInfo.total_count ?? apps.length,
        count: pageInfo.count ?? apps.length,
        endCursor: pageInfo.end_cursor,
        hasMore: apps.length >= limit,
      },
    };
  }

  async listActions(app: string, query?: string, limit = 50): Promise<ActionListResult> {
    const cacheKey = `${app}:${query || ''}:${limit}`;
    const cached = this.actionsCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const params = new URLSearchParams();
    params.set('app', app);
    if (query) params.set('q', query);
    params.set('limit', String(limit));

    const data = await this.apiRequest<{
      data: Array<{
        key: string;
        name: string;
        description?: string;
        configurable_props?: Array<{
          name: string;
          type: string;
          optional?: boolean;
          description?: string;
        }>;
      }>;
    }>('GET', `/v1/connect/${this.projectId}/actions?${params.toString()}`);

    const actions: ActionSummary[] = (data.data || []).map((a) => {
      const params: ActionParam[] = (a.configurable_props || [])
        .filter((p) => p.name !== 'app')
        .map((p) => ({
          name: p.name,
          type: p.type,
          required: !p.optional,
          description: p.description,
        }));

      return {
        key: a.key,
        name: a.name,
        description: a.description,
        params,
      };
    });

    const result: ActionListResult = { actions, app };

    this.actionsCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + PipedreamProvider.ACTIONS_CACHE_TTL,
    });

    return result;
  }

  async runAction(
    accountId: string,
    actionKey: string,
    props: Record<string, unknown>,
    app: string,
    providerAccountId?: string,
  ): Promise<ActionRunResult> {
    let pdAccountId: string;

    if (providerAccountId) {
      pdAccountId = providerAccountId;
    } else {
      const accounts = await this.listAccounts(accountId);
      const account = accounts.find((a) => a.app === app);
      if (!account) {
        return {
          success: false,
          error: `No connected account found for app "${app}". The user needs to connect it first.`,
        };
      }
      pdAccountId = account.id;
    }

    try {
      const configured_props: Record<string, unknown> = {
        [app]: { authProvisionId: pdAccountId },
        ...props,
      };

      const data = await this.apiRequest<{
        exports?: Record<string, unknown>;
        ret?: unknown;
        os?: unknown[];
        [key: string]: unknown;
      }>('POST', `/v1/connect/${this.projectId}/actions/run`, {
        id: actionKey,
        external_user_id: accountId,
        configured_props,
      });

      const resultCandidates = [
        data.ret,
        data.exports,
        data.os,
        data,
      ];

      const selectedResult = resultCandidates.find(isNonEmptyValue) ?? data;

      return {
        success: true,
        result: selectedResult,
      };
    } catch (err) {
      return {
        success: false,
        error: `Action execution failed: ${err}`,
      };
    }
  }
}
