'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

/**
 * Ring Docs - the dashboard's live link to Ring's own documentation,
 * fetched through the Ring Appstore Knowledge MCP server (see mcp.json
 * and lib/ring-mcp.ts). Every search and every full-doc read below is the
 * gateway answering in real time; nothing doc-shaped is cached or invented
 * client-side.
 *
 * Use case: while configuring cameras, webhook intake or the linking flow,
 * the team (and an AI agent browsing /llms.txt) can ask Ring's docs directly
 * from this page instead of collocating a second tool.
 */

interface Hit {
  content: string;
  score: string | undefined;
  sourceType: 'FILE' | 'WEB' | undefined;
  source: string | undefined;
}

interface SearchBody {
  query?: string;
  status?: string;
  confidence?: string;
  hits?: Hit[];
  followUpQuestions?: string[];
  error?: string;
  detail?: string;
}

interface StatusBody {
  server?: { serverName?: string; serverVersion?: string; tools?: string[]; url?: string };
  error?: string;
  detail?: string;
}

interface DocBody {
  source?: string;
  content?: string;
  error?: string;
  detail?: string;
}

/** Queries mapped to the features this demo actually relies on. */
const SUGGESTED = [
  'webhook HMAC signature verification',
  'image snapshot download at timestamp',
  'event history pagination cursor',
  'account linking nonce validation',
  'motion zones normalized coordinates',
];

export function RingDocs() {
  const [serverName, setServerName] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);

  const [doc, setDoc] = useState<{ source: string; content: string } | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch('/api/ring-docs');
        const body = (await response.json().catch(() => null)) as StatusBody | null;
        if (!alive) return;
        if (!response.ok || !body?.server?.serverName) {
          setServerError(body?.detail ?? `The documentation status check failed (HTTP ${response.status}).`);
          return;
        }
        setServerName(`${body.server.serverName} v${body.server.serverVersion ?? '?'}`);
      } catch {
        if (alive) setServerError('The documentation search could not reach the server.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setSearchError(null);
    setDoc(null);
    setDocError(null);
    try {
      const response = await fetch(`/api/ring-docs?q=${encodeURIComponent(q.trim())}`);
      const body = (await response.json().catch(() => null)) as SearchBody | null;
      if (!response.ok) {
        setSearchError(body?.detail ?? `The documentation search failed (HTTP ${response.status}).`);
        return;
      }
      setConfidence(body?.confidence ?? null);
      setHits(body?.hits ?? []);
      setFollowUps(body?.followUpQuestions ?? []);
      setQuery(q);
    } catch {
      setSearchError('The documentation search could not reach the server.');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  async function openDoc(uri: string) {
    if (docBusy) return;
    setDocBusy(true);
    setDocError(null);
    try {
      const response = await fetch(`/api/ring-docs?doc=${encodeURIComponent(uri)}`);
      const body = (await response.json().catch(() => null)) as DocBody | null;
      if (!response.ok || !body?.content) {
        setDocError(body?.detail ?? `The document could not be loaded (HTTP ${response.status}).`);
        return;
      }
      setDoc({ source: body.source ?? uri, content: body.content });
    } catch {
      setDocError('The document could not be loaded. Try again in a moment.');
    } finally {
      setDocBusy(false);
    }
  }

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(query);
  }

  if (serverError) {
    return (
      <p className="failure" role="alert">
        {serverError}
      </p>
    );
  }

  return (
    <div className="stack-sm">
      <form className="row" onSubmit={onSearch}>
        <label className="field" style={{ flex: 1, maxWidth: '480px' }}>
          Ask Ring's documentation {serverName ? <span className="muted">· live via {serverName}</span> : null}
          <input
            type="search"
            value={query}
            placeholder="e.g. webhook signature verification"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy || query.trim().length < 3}>
          {busy ? 'Searching…' : 'Search docs'}
        </button>
      </form>

      <ul className="chip-list" aria-label="Suggested Ring doc queries">
        {SUGGESTED.map((item) => (
          <li key={item}>
            <button
              type="button"
              className="silent"
              onClick={() => void search(item)}
              disabled={busy}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
            >
              {item}
            </button>
          </li>
        ))}
      </ul>

      {searchError ? (
        <p className="failure" role="alert">{searchError}</p>
      ) : null}

      {docError ? (
        <p className="failure" role="alert">{docError}</p>
      ) : null}

      {doc ? (
        <div className="card stack-sm">
          <div className="row">
            <strong>{doc.source}</strong>
            <button type="button" onClick={() => setDoc(null)} style={{ marginLeft: 'auto' }}>
              ← Back to results
            </button>
          </div>
          <div className="scroll-area" tabIndex={0} style={{ maxHeight: '480px' }}>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, font: 'inherit' }}>{doc.content}</pre>
          </div>
        </div>
      ) : hits.length > 0 ? (
        <div className="stack-sm">
          <p className="muted" style={{ margin: 0 }}>
            Gateway confidence {confidence ?? 'n/a'} · {hits.length} result{hits.length === 1 ? '' : 's'} · content is Ring's, verbatim
          </p>
          <div className="scroll-area scroll-area--log" tabIndex={0}>
            <ul className="feed">
              {hits.map((hit, index) => (
                <li className="card" key={`${hit.source ?? 'hit'}-${index}`}>
                  <div className="row">
                    <span className="badge badge-monitor">{hit.sourceType ?? 'DOC'}</span>
                    <code>{hit.source ?? '(no source)'}</code>
                    <span className="muted" style={{ marginLeft: 'auto' }}>score {hit.score ?? 'n/a'}</span>
                  </div>
                  <p style={{ margin: '0.25rem 0 0.75rem' }}>{hit.content}</p>
                  <div>
                    {hit.source ? (
                      <button type="button" onClick={() => void openDoc(hit.source as string)} disabled={docBusy}>
                        {docBusy ? 'Reading…' : 'Read full doc →'}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {followUps.length > 0 ? (
        <ul className="chip-list" aria-label="Gateway follow-up questions">
          {followUps.map((item) => (
            <li key={item}>
              <button
                type="button"
                onClick={() => void search(item)}
                disabled={busy}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
