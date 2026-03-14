import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const REPO_URL = 'https://github.com/kortix-ai/computer';
const REPO_SCRIPT_URL = `${REPO_URL}/blob/main/scripts/get-kortix.sh`;
const RAW_SCRIPT_URL = 'https://raw.githubusercontent.com/kortix-ai/computer/main/scripts/get-kortix.sh';
const LOCAL_SCRIPT_CANDIDATES = [
  path.join(process.cwd(), '../../scripts/get-kortix.sh'),
  path.join(process.cwd(), '../scripts/get-kortix.sh'),
  path.join(process.cwd(), 'scripts/get-kortix.sh'),
];

function prefersHtml(request: NextRequest): boolean {
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

function scriptHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers(upstreamHeaders);
  headers.set('Content-Type', 'text/x-shellscript; charset=utf-8');
  headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('X-Kortix-Install-Source', RAW_SCRIPT_URL);
  return headers;
}

async function readLocalInstaller(): Promise<string | null> {
  for (const candidate of LOCAL_SCRIPT_CANDIDATES) {
    try {
      return await readFile(candidate, 'utf8');
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  if (prefersHtml(request)) {
    return NextResponse.redirect(REPO_SCRIPT_URL, 302);
  }

  const localInstaller = await readLocalInstaller();
  if (localInstaller !== null) {
    return new NextResponse(localInstaller, {
      status: 200,
      headers: scriptHeaders(new Headers()),
    });
  }

  const upstream = await fetch(RAW_SCRIPT_URL, {
    headers: {
      'User-Agent': 'kortix-install-route',
    },
    next: {
      revalidate: 300,
    },
  });

  if (!upstream.ok) {
    return new NextResponse(`Failed to fetch installer from ${RAW_SCRIPT_URL}`, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: scriptHeaders(upstream.headers),
  });
}
