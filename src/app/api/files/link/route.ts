import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function getProxyDownloadUrl(request: NextRequest): URL {
  const configuredProxy = process.env.FILE_DOWNLOAD_PROXY_URL?.trim();

  if (!configuredProxy) {
    return new URL('/api/files/download', request.nextUrl.origin);
  }

  const proxyBase = new URL(configuredProxy);

  if (proxyBase.pathname.endsWith('/api/files/download')) {
    return new URL(proxyBase.toString());
  }

  return new URL('/api/files/download', proxyBase);
}

function extractRelativeFromProjectsPath(inputPath: string): string | null {
  const normalized = inputPath.replace(/\\/g, '/');
  const marker = '/projects/';
  const idx = normalized.lastIndexOf(marker);
  if (idx === -1) return null;

  const rel = normalized.slice(idx + marker.length).replace(/^\/+/, '');
  return rel || null;
}

/**
 * GET /api/files/link?path=... or ?relativePath=...
 * Redirects to the active file download endpoint.
 *
 * This acts as a stable proxy so UI links do not depend on local
 * filesystem paths being readable on the Mission Control host.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fullPath = searchParams.get('path');
  let relativePath = searchParams.get('relativePath');
  const raw = searchParams.get('raw') ?? 'true';

  if (!fullPath && !relativePath) {
    return NextResponse.json(
      { error: 'Either path or relativePath query parameter is required' },
      { status: 400 }
    );
  }

  if (!relativePath && fullPath) {
    // Many agents send absolute paths like /data/workspace/projects/foo/bar.
    // Converting to relativePath lets /api/files/download resolve against
    // the deployment's PROJECTS_PATH instead of hard-coding machine paths.
    relativePath = extractRelativeFromProjectsPath(fullPath);
  }

  const downloadUrl = getProxyDownloadUrl(request);
  downloadUrl.searchParams.set('raw', raw);

  if (relativePath) {
    downloadUrl.searchParams.set('relativePath', relativePath);
  } else if (fullPath) {
    downloadUrl.searchParams.set('path', fullPath);
  }

  // Avoid absolute localhost redirects behind some reverse proxies:
  // emit a relative Location header when no external proxy is configured.
  if (!process.env.FILE_DOWNLOAD_PROXY_URL?.trim()) {
    const relativeLocation = `${downloadUrl.pathname}${downloadUrl.search}`;
    return new NextResponse(null, {
      status: 307,
      headers: { Location: relativeLocation },
    });
  }

  return NextResponse.redirect(downloadUrl, 307);
}
