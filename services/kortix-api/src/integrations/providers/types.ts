export interface ConnectedAccount {
  id: string;                     
  app: string;                 
  appName: string;               
  externalUserId: string;        
  createdAt: string;
}

export interface AuthToken {
  accessToken: string;
  tokenType?: string;            
  expiresAt?: number;            
  refreshToken?: string;         
  scopes?: string[];
}

export interface ConnectTokenResult {
  token: string;
  expiresAt: string;
  connectUrl?: string;           
}

export interface AppInfo {
  slug: string;
  name: string;
  description?: string;
  imgSrc?: string;
  authType?: string;
  categories: string[];
}

export interface AppListResult {
  apps: AppInfo[];
  pageInfo: {
    totalCount: number;
    count: number;
    endCursor?: string;
    hasMore: boolean;
  };
}

export interface ProxyRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface AuthProvider {
  readonly name: string;

  createConnectToken(accountId: string, app?: string): Promise<ConnectTokenResult>;
  listAccounts(accountId: string): Promise<ConnectedAccount[]>;
  getAccount(accountId: string, accountProviderId: string): Promise<ConnectedAccount | null>;
  getAuthToken(accountId: string, app: string): Promise<AuthToken>;
  deleteAccount(accountId: string, accountProviderId: string): Promise<void>;
  listApps(query?: string, limit?: number, cursor?: string): Promise<AppListResult>;
  proxyRequest(accountId: string, app: string, request: ProxyRequest): Promise<ProxyResponse>;
}
