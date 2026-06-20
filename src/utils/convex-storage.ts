import type { Id } from '@/convex/_generated/dataModel';
import { compressSurveyPhotoUri } from '@/utils/jpegBytes';

/** User-facing message for camera / upload failures (never raw "blob" from RN fetch). */
export function toPhotoErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/split bundle|ERR_NGROK|ngrok|offline|Unable to resolve module/i.test(raw)) {
    return 'Camera could not open. Restart the dev server and reopen the app, or use a release build in the field.';
  }
  if (/blob|\[object Blob\]|BodyInit|not a valid HTTP header/i.test(raw)) {
    return 'Photo could not be uploaded. Try capturing again.';
  }
  if (/out of memory|OOM|allocation failed|Cannot allocate/i.test(raw)) {
    return 'Photo is too large for this device. Try again in better lighting or restart the app.';
  }
  if (err instanceof Error && raw) return raw;
  return 'Photo upload failed';
}

/**
 * POST raw JPEG bytes to a Convex storage upload URL.
 * Uses XMLHttpRequest so React Native sends binary correctly (fetch + Blob often fails).
 */
export function uploadJpegBytesToConvexUrl(
  uploadUrl: string,
  jpegBytes: Uint8Array,
): Promise<{ storageId: Id<'_storage'> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Content-Type', 'image/jpeg');
    xhr.responseType = 'text';

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Photo upload failed (${xhr.status})`));
        return;
      }
      try {
        const json = JSON.parse(xhr.responseText) as { storageId?: Id<'_storage'> };
        if (!json.storageId) {
          reject(new Error('Photo upload failed — invalid server response'));
          return;
        }
        resolve({ storageId: json.storageId });
      } catch {
        reject(new Error('Photo upload failed — invalid server response'));
      }
    };

    xhr.onerror = () => reject(new Error('Photo upload failed — check your connection'));
    xhr.onabort = () => reject(new Error('Photo upload was cancelled'));
    xhr.send(jpegBytes);
  });
}

/** POST image bytes from a local URI to a Convex storage upload URL. */
async function uploadImageFromUri(
  uploadUrl: string,
  uri: string,
): Promise<{ storageId: Id<'_storage'>; sizeKb: number }> {
  const { jpegBytes } = await compressSurveyPhotoUri(uri);
  const { storageId } = await uploadJpegBytesToConvexUrl(uploadUrl, jpegBytes);
  return { storageId, sizeKb: Math.max(1, Math.ceil(jpegBytes.byteLength / 1024)) };
}
