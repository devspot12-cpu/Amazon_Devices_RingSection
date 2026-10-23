/**
 * Client-side reader for the API's `{ error, detail? }` shape. Routes put the
 * sentence a visitor should see in `detail`; a bare `error` is usually a
 * machine code (`camera_not_found`), so it is shown only when it already reads
 * like a sentence ("Unknown region").
 */
export function errorText(
  body: { error?: string; detail?: string } | null | undefined,
  status: number,
  fallback: string,
): string {
  if (body?.detail) return body.detail;
  const code = body?.error;
  if (code && !/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(code)) return code;
  return `${fallback} (HTTP ${status}).`;
}
