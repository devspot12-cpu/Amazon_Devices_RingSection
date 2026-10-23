import { getRingDoc, ringMcpStatus, searchRingDocs } from '@/lib/ring-mcp';

import { jsonError } from '@/lib/http';

/**
 * /api/ring-docs - server-side proxy to the Ring Appstore Knowledge MCP
 * gateway (loaded from mcp.json). Two read paths:
 *
 *   GET ?q=<query>                  -> search_docs snippets + sources
 *   GET ?doc=<file path or url>     -> get_doc full document content
 *   GET (no params)                 -> gateway status (server + tool names)
 *
 * The browser talks only to us; the gateway itself stays backend-only, the
 * same rule the Ring API applies to partners.
 */
export const dynamic = 'force-dynamic';

interface RouteError {
  error: string;
  detail?: string;
  [key: string]: unknown;
}

function mcpErrorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ stage: 'ring-mcp.error', error: message }));
  const notConfigured = message.startsWith('mcp_not_configured');
  const status: RouteError = notConfigured
    ? { error: 'mcp_not_configured', detail: 'Ring documentation search is not configured on this deployment.' }
    : {
        error: 'ring_mcp_unavailable',
        detail: 'Ring documentation search is unavailable right now. Try again in a moment.',
      };
  return Response.json(status, { status: notConfigured ? 503 : 502 });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();
  const doc = url.searchParams.get('doc')?.trim();

  try {
    if (query) {
      if (query.length < 3 || query.length > 300) {
        return Response.json({ error: 'invalid_query', detail: 'q must be 3-300 characters' }, { status: 400 });
      }
      const maxResults = url.searchParams.get('max')?.trim() || '5';
      if (!/^\d{1,2}$/.test(maxResults) || Number(maxResults) < 1 || Number(maxResults) > 10) {
        return Response.json({ error: 'invalid_max', detail: 'max must be 1-10' }, { status: 400 });
      }
      const outcome = await searchRingDocs(query, { maxResults });
      return Response.json(
        { query, ...outcome },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (doc) {
      if (doc.length > 500 || doc.startsWith('/') || doc.includes('..')) {
        return Response.json({ error: 'invalid_doc', detail: 'doc must be a relative docs path (or a ring.com URL)' }, { status: 400 });
      }
      const result = await getRingDoc(doc);
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }

    const status = await ringMcpStatus();
    return Response.json({ server: status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return mcpErrorResponse(err);
  }
}
