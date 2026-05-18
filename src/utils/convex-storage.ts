import type { Id } from '@/convex/_generated/dataModel';
import * as ImageManipulator from 'expo-image-manipulator';

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** User-facing message for camera / upload failures (never raw "blob" from RN fetch). */
export function toPhotoErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/split bundle|ERR_NGROK|ngrok|offline|Unable to resolve module/i.test(raw)) {
    return 'Camera could not open. Restart the dev server and reopen the app, or use a release build in the field.';
  }
  if (/blob|\[object Blob\]|BodyInit|not a valid HTTP header/i.test(raw)) {
    return 'Photo could not be uploaded. Try capturing again.';
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
  const body = Uint8Array.from(jpegBytes);

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
    xhr.send(body);
  });
}

/** POST image bytes from a local URI to a Convex storage upload URL. */
export async function uploadImageFromUri(
  uploadUrl: string,
  uri: string,
): Promise<{ storageId: Id<'_storage'>; sizeKb: number }> {
  const processed = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!processed.base64) {
    throw new Error('Photo upload failed');
  }
  const jpegBytes = base64ToBytes(processed.base64);
  const { storageId } = await uploadJpegBytesToConvexUrl(uploadUrl, jpegBytes);
  return { storageId, sizeKb: Math.max(1, Math.ceil(jpegBytes.byteLength / 1024)) };
}
