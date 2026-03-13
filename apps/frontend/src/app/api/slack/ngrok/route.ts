import { execSync, spawn } from 'node:child_process';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NgrokTunnel = {
  public_url: string;
  proto: string;
  config?: {
    addr?: string;
  };
};

async function detectNgrokUrl(): Promise<{ url: string; forwardPort: number | null } | null> {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels', {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { tunnels: NgrokTunnel[] };
    const httpsTunnel = data.tunnels.find((tunnel) => tunnel.proto === 'https');
    const tunnel = httpsTunnel ?? data.tunnels[0];
    if (!tunnel) return null;

    let forwardPort: number | null = null;
    if (tunnel.config?.addr) {
      const portMatch = tunnel.config.addr.match(/:(\d+)$/);
      if (portMatch) {
        forwardPort = Number(portMatch[1]);
      }
    }

    return { url: tunnel.public_url, forwardPort };
  } catch {
    return null;
  }
}

function isNgrokInstalled(): boolean {
  try {
    execSync('which ngrok', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const portParam = request.nextUrl.searchParams.get('port');
  const port = Number(portParam || '8008');
  const detected = await detectNgrokUrl();

  return NextResponse.json({
    detected: Boolean(detected),
    url: detected?.url ?? null,
    forwardPort: detected?.forwardPort ?? null,
    portMatches: detected?.forwardPort ? detected.forwardPort === port : null,
    ngrokInstalled: isNgrokInstalled(),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { port?: number };
  const port = Number(body.port || 8008);

  const existing = await detectNgrokUrl();
  if (existing) {
    return NextResponse.json({
      started: false,
      alreadyRunning: true,
      url: existing.url,
      forwardPort: existing.forwardPort,
    });
  }

  if (!isNgrokInstalled()) {
    return NextResponse.json(
      {
        started: false,
        error: 'ngrok is not installed',
      },
      { status: 400 },
    );
  }

  try {
    const ngrokProc = spawn('ngrok', ['http', String(port)], {
      stdio: 'ignore',
      detached: true,
    });
    ngrokProc.unref();

    for (let i = 0; i < 15; i += 1) {
      const result = await detectNgrokUrl();
      if (result) {
        return NextResponse.json({
          started: true,
          alreadyRunning: false,
          url: result.url,
          forwardPort: result.forwardPort,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return NextResponse.json(
      {
        started: false,
        error: 'ngrok started but tunnel URL was not detected in time',
      },
      { status: 504 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start ngrok';
    return NextResponse.json(
      {
        started: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
