/**
 * Shared JSON error handling for the demo's API routes: every route wraps its
 * body in try/catch and returns `jsonError(err)` for the unexpected case, so
 * one shape (`{ error, detail? }` + an HTTP status) comes out of every
 * endpoint. Expected failures (validation, missing model, unknown camera)
 * are returned explicitly with their own status inside the route.
 */
export function jsonError(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ stage: 'http.error', error: message }));
  // Visitors get an actionable sentence, not an internal error code; the real
  // message stays in the server log. Dev keeps it inline to shorten the loop.
  const detail =
    process.env.NODE_ENV === 'production'
      ? 'Something went wrong on the server. Try again in a moment.'
      : message;
  return Response.json({ error: 'internal_error', detail }, { status: 500 });
}
