import { MAX_PHOTO_SOURCE_BYTES, MAX_PHOTO_UPLOAD_BYTES, PHOTO_MIME_TYPES } from './photo-limits';

export function photoSelectionError(file: File): string | null {
  if (!PHOTO_MIME_TYPES.includes(file.type.toLowerCase() as typeof PHOTO_MIME_TYPES[number])) return 'Choisissez une image JPG, PNG ou WebP.';
  if (!file.size) return 'Cette image est vide. Choisissez une autre photo.';
  if (file.size > MAX_PHOTO_SOURCE_BYTES) return 'Cette photo dépasse 25 Mo. Choisissez une image plus légère.';
  return null;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Impossible de préparer la photo.')), type, quality));
}

/** Resize on the visitor's device so ordinary phone photos fit serverless limits. */
export async function preparePhoto(file: File): Promise<Blob> {
  const selectionError = photoSelectionError(file);
  if (selectionError) throw new Error(selectionError);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Impossible de lire cette image. Essayez une photo JPG, PNG ou WebP.'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 100_000_000) {
      throw new Error('Cette image est trop grande. Choisissez une autre photo.');
    }
    let scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Impossible de préparer la photo sur cet appareil.');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const quality = [0.84, 0.72, 0.62, 0.62][attempt];
      let result = await toBlob(canvas, 'image/webp', quality);
      // Older browsers may not encode WebP; JPEG is accepted by the server too.
      if (result.type !== 'image/webp') {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        result = await toBlob(canvas, 'image/jpeg', quality);
      }
      if (result.size > 0 && result.size <= MAX_PHOTO_UPLOAD_BYTES && PHOTO_MIME_TYPES.includes(result.type as typeof PHOTO_MIME_TYPES[number])) return result;
      if (attempt >= 1) scale *= 0.8;
    }
    throw new Error('Impossible de réduire cette photo. Choisissez une autre image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
