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
  const relativePath = searchParams.get('relativePath');
  const raw = searchParams.get('raw') ?? 'true';

  if (!fullPath && !relativePath) {
    return NextResponse.json(
      { error: 'Either path or relativePath query parameter is required' },
      { status: 400 }
    );
  }

  const downloadUrl = getProxyDownloadUrl(request);
  downloadUrl.searchParams.set('raw', raw);

  if (fullPath) {
    downloadUrl.searchParams.set('path', fullPath);
  }
  if (relativePath) {
    downloadUrl.searchParams.set('relativePath', relativePath);
  }

  return NextResponse.redirect(downloadUrl, 307);
}
