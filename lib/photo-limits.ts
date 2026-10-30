/** Shared limits: the compressed multipart request stays below Vercel's body limit. */
export const MAX_PHOTO_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTO_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_PHOTO_REQUEST_BYTES = MAX_PHOTO_UPLOAD_BYTES + 32_000;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_BUCKET = 'request-photos';
export const PHOTO_REQUESTS_PER_HOUR = 15;

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
