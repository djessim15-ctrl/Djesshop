/** Bound memory use even when Content-Length is missing or incorrect. */
export async function readBodyBytes(request: Request, maxBytes: number): Promise<{ bytes: Uint8Array; error?: never } | { bytes?: never; error: 'invalid' | 'too-large' }> {
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > maxBytes) return { error: 'too-large' };
  if (!request.body) return { error: 'invalid' };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { error: 'too-large' };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { bytes };
  } catch {
    return { error: 'invalid' };
  } finally {
    reader.releaseLock();
  }
}
