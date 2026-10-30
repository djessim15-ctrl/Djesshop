import sharp from 'sharp';
import { MAX_PHOTO_UPLOAD_BYTES, PHOTO_MIME_TYPES } from './photo-limits';

/**
 * Never trust a filename or MIME type. Decode only raster formats and re-encode
 * without metadata, so originals, EXIF location data and extra payloads are not stored.
 */
export async function normalizePhoto(photo: Blob): Promise<Buffer> {
  if (!PHOTO_MIME_TYPES.includes(photo.type.toLowerCase() as typeof PHOTO_MIME_TYPES[number]) || photo.size === 0 || photo.size > MAX_PHOTO_UPLOAD_BYTES) {
    throw new Error('Invalid photo');
  }
  const input = Buffer.from(await photo.arrayBuffer());
  const image = sharp(input, { limitInputPixels: 40_000_000, failOn: 'warning', sequentialRead: true });
  const metadata = await image.metadata();
  if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format) || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1 || metadata.width * metadata.height > 40_000_000) {
    throw new Error('Invalid photo');
  }
  const output = await image.rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  if (output.length > MAX_PHOTO_UPLOAD_BYTES) throw new Error('Photo too large after conversion');
  return output;
}
