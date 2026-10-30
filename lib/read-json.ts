/** Read at most maxBytes, including when a client omits Content-Length. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<{ value: unknown; error?: never } | { value?: never; error: 'invalid' | 'too-large' }> {
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > maxBytes) return { error: 'too-large' };
  if (!request.body) return { error: 'invalid' };
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel().catch(() => {}); return { error: 'too-large' }; }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { value: JSON.parse(text) as unknown };
  } catch { return { error: 'invalid' }; }
  finally { reader.releaseLock(); }
}
