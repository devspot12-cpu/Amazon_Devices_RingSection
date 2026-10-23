import { existsSync, readFileSync } from 'node:fs';

import { loadConfig } from './config';

/**
 * Client for the Ring Appstore Knowledge MCP server.
 *
 * Predator Guard never ships hand-copied Ring facts: everything doc-shaped
 * (webhook signatures, media limits, linking rules ...) is fetched live from
 * the Ring MCP gateway during every request. This file is the entry point
 * that makes that tech requirement real: it loads `mcp.json`, performs the
 * MCP `initialize` handshake over streamable HTTP and calls the gateway's
 * `search_docs` / `get_doc` tools by name discovered from `tools/list`.
 *
 * Server-side only. Like Ring's data API, the gateway must be reached from
 * our backend, never from the browser.
 */

const HANDSHAKE_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 30_000;
/** Relay the employee-facing gateway name the dashboard status line shows. */
const SERVER_KEY = 'ring-appstore-knowledge-mcp-server';

interface McpConfig {
  mcpServers: Record<
    string,
    { type?: string; url?: string; headers?: Record<string, string> } | undefined
  >;
}

export interface RingMcpStatus {
  url: string;
  serverName: string;
  serverVersion: string;
  tools: string[];
}

export interface RingSearchHit {
  /** Doc snippet exactly as the gateway returned it - never rewritten. */
  content: string;
  score: string | undefined;
  /** metadata.type - FILE paths or WEB urls, both usable with getRingDoc. */
  sourceType: 'FILE' | 'WEB' | undefined;
  source: string | undefined;
}

export interface RingSearchOutcome {
  /** "success" | "clarification_needed" | "error", as reported by the tool. */
  status: string;
  confidence: string | undefined;
  hits: RingSearchHit[];
  followUpQuestions: string[];
}

export interface RingDocContent {
  source: string;
  /** Full document body exactly as the gateway returned it - never rewritten. */
  content: string;
}

interface JsonRpcResponse {
  result?: {
    serverInfo?: { name?: string; version?: string };
    tools?: Array<{ name?: string }>;
    content?: Array<{ type?: string; text?: string }>;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

// ---------------------------------------------------------------------------
// Config loading: mcp.json at the repo root (or RING_MCP_URL env override)
// ---------------------------------------------------------------------------

function findMcpConfigPath(): string | undefined {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop += 1) {
    const candidate = `${dir}/mcp.json`;
    if (existsSync(candidate)) return candidate;
    const parent = dir.slice(0, Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\')));
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function loadMcpServer(): { url: string; headers?: Record<string, string> } {
  const envUrl = loadConfig().ringMcpUrl;
  if (envUrl) return { url: envUrl };

  const path = findMcpConfigPath();
  if (!path) {
    throw new Error('mcp_not_configured: no mcp.json found with the Ring knowledge MCP server');
  }
  const config = JSON.parse(readFileSync(path, 'utf8')) as McpConfig;
  const server = config.mcpServers[SERVER_KEY];
  if (!server?.url) {
    throw new Error(`mcp_not_configured: ${SERVER_KEY} missing in mcp.json`);
  }
  if (server.type && server.type !== 'streamable-http') {
    throw new Error(`mcp_transport_unsupported: ${server.type} (only streamable-http is supported)`);
  }
  return { url: server.url, headers: server.headers };
}

// ---------------------------------------------------------------------------
// Minimal streamable-HTTP transport (initialize + tools/list + tools/call)
// ---------------------------------------------------------------------------

let gateway: Promise<{
  url: string;
  headers?: Record<string, string>;
  sessionId: string | undefined;
  serverName: string;
  serverVersion: string;
  tools: string[];
}> | null = null;

async function rpc(
  url: string,
  headers: Record<string, string> | undefined,
  sessionId: string | undefined,
  body: unknown,
): Promise<{ json: JsonRpcResponse; sessionId: string | undefined }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      ...(sessionId ? { 'MCP-Session-Id': sessionId } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(body && typeof body === 'object' && 'method' in body && (body as { method: string }).method === 'initialize' ? HANDSHAKE_TIMEOUT_MS : CALL_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`MCP gateway returned HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  const type = response.headers.get('content-type') ?? '';
  // Streamable HTTP allows either a single JSON body or an SSE stream; both
  // carry the same JSON-RPC payload, only the envelope differs.
  const raw = await response.text();
  let json: JsonRpcResponse;
  if (type.includes('text/event-stream')) {
    const data = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .at(-1);
    json = JSON.parse(data ?? '{}') as JsonRpcResponse;
  } else {
    json = JSON.parse(raw) as JsonRpcResponse;
  }
  return { json, sessionId: response.headers.get('mcp-session-id') ?? undefined };
}

async function getGateway() {
  if (!gateway) {
    gateway = (async () => {
      const base = loadMcpServer();
      const init = await rpc(base.url, base.headers, undefined, {
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'predator-guard', version: '0.1.0' },
        },
      });
      if (init.json.error) {
        throw new Error(`MCP initialize failed: ${init.json.error.message ?? 'unknown error'}`);
      }
      const listing = await rpc(base.url, base.headers, init.sessionId, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });
      if (listing.json.error) {
        throw new Error(`MCP tools/list failed: ${listing.json.error.message ?? 'unknown error'}`);
      }
      return {
        ...base,
        sessionId: init.sessionId,
        serverName: init.json.result?.serverInfo?.name ?? 'unknown',
        serverVersion: init.json.result?.serverInfo?.version ?? 'unknown',
        tools: (listing.json.result?.tools ?? [])
          .map((tool) => tool.name ?? '')
          .filter(Boolean),
      };
    })().catch((err) => {
      gateway = null; // next caller retries the handshake
      throw err;
    });
  }
  return gateway;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const session = await getGateway();
  const { json } = await rpc(session.url, session.headers, session.sessionId, {
    jsonrpc: '2.0',
    id: nextRequestId(),
    method: 'tools/call',
    params: { name, arguments: args },
  });
  if (json.error) {
    throw new Error(json.error.message ?? `MCP tool ${name} failed`);
  }
  const text = (json.result?.content ?? [])
    .filter((part) => !part.type || part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n');
  if (json.result?.isError) {
    throw new Error(text || `MCP tool ${name} reported an error`);
  }
  return text;
}

let requestId = 1;
function nextRequestId(): number {
  requestId += 1;
  return requestId;
}

// The gateway namespaces tools per app (observed: `ring___search_docs`,
// `ring___get_doc`). Resolve suffix -> full name from tools/list.
function resolveTool(tools: string[], suffix: string): string {
  const match = tools.find((tool) => tool.endsWith(`___${suffix}`)) ?? tools.find((tool) => tool.endsWith(suffix));
  if (!match) throw new Error(`mcp_tool_missing: no *${suffix} tool on the Ring gateway`);
  return match;
}

// ---------------------------------------------------------------------------
// Public surface used by the /api/ring-docs route and the dashboard section
// ---------------------------------------------------------------------------

export async function ringMcpStatus(): Promise<RingMcpStatus> {
  const session = await getGateway();
  return {
    url: session.url,
    serverName: session.serverName,
    serverVersion: session.serverVersion,
    tools: session.tools,
  };
}

export async function searchRingDocs(
  query: string,
  options: { maxResults?: string; minConfidence?: string } = {},
): Promise<RingSearchOutcome> {
  const session = await getGateway();
  const raw = await callTool(resolveTool(session.tools, 'search_docs'), {
    query,
    ...('maxResults' in options ? { max_results: options.maxResults } : {}),
    ...('minConfidence' in options ? { min_confidence: options.minConfidence } : {}),
  });
  let parsed: {
    status?: string;
    confidence?: string;
    results?: Array<{
      content?: string;
      score?: string;
      metadata?: { type?: string; source?: string };
    }>;
    followUpQuestions?: unknown[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`mcp_search_unparseable: ${raw.slice(0, 200)}`);
  }
  return {
    status: parsed.status ?? 'success',
    confidence: parsed.confidence,
    hits: (parsed.results ?? []).map((hit) => ({
      content: hit.content ?? '',
      score: hit.score,
      sourceType: hit.metadata?.type === 'WEB' ? 'WEB' : hit.metadata?.type === 'FILE' ? 'FILE' : undefined,
      source: hit.metadata?.source,
    })),
    followUpQuestions: (parsed.followUpQuestions ?? [])
      .filter((question): question is string => typeof question === 'string'),
  };
}

export async function getRingDoc(uri: string): Promise<RingDocContent> {
  const session = await getGateway();
  const content = await callTool(resolveTool(session.tools, 'get_doc'), { uri });
  return { source: uri, content };
}
