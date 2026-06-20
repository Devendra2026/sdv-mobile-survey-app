import type { Id } from '@/convex/_generated/dataModel';
import { toPhotoErrorMessage, uploadJpegBytesToConvexUrl } from '@/utils/convex-storage';
import { compressSurveyPhotoUri } from '@/utils/jpegBytes';
import type { SurveyPhotoSlot } from '@/utils/surveyPhotos';
import { isSurveyPhotoSlot } from '@/utils/surveyPhotos';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type SurveyPhotoPickResult =
  | { canceled: true }
  | {
      canceled: false;
      uri: string;
      width: number;
      height: number;
      jpegBytes: Uint8Array;
    };

/** Persisted before opening the camera so we can finish upload after Android process restart. */
const PENDING_SURVEY_PHOTO_SLOT_KEY = '@survey_app/pending_photo_slot';

function toCaptureError(e: unknown): Error {
  return new Error(toPhotoErrorMessage(e));
}

async function processCameraAsset(asset: ImagePicker.ImagePickerAsset): Promise<SurveyPhotoPickResult> {
  const compressed = await compressSurveyPhotoUri(asset.uri);
  return { canceled: false, ...compressed };
}

/**
 * After Android kills the app while the camera is open, the picker result is
 * delivered on the next launch via getPendingResultAsync (see expo-image-picker docs).
 */
export async function recoverPendingSurveyPhotoPick(): Promise<SurveyPhotoPickResult | null> {
  if (Platform.OS !== 'android') return null;

  const pending = await ImagePicker.getPendingResultAsync();
  if (!pending) return null;
  if ('code' in pending) return null;
  if (pending.canceled || pending.assets.length === 0) return null;

  try {
    return await processCameraAsset(pending.assets[0]);
  } catch (e) {
    throw toCaptureError(e);
  }
}

/** Opens the device camera and returns a compressed JPEG ready to upload. */
export async function pickSurveyPhotoFromCamera(): Promise<SurveyPhotoPickResult> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Camera permission is required to capture survey photos');
    }

    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      // Downscale in the picker first — full-quality photos OOM on low-RAM Android devices.
      quality: 0.85,
      exif: false,
      allowsEditing: false,
    });

    if (picked.canceled || picked.assets.length === 0) {
      return { canceled: true };
    }

    return await processCameraAsset(picked.assets[0]);
  } catch (e) {
    throw toCaptureError(e);
  }
}

export async function setPendingSurveyPhotoSlot(slot: SurveyPhotoSlot): Promise<void> {
  await AsyncStorage.setItem(PENDING_SURVEY_PHOTO_SLOT_KEY, slot);
}

export async function clearPendingSurveyPhotoSlot(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_SURVEY_PHOTO_SLOT_KEY);
}

export async function readPendingSurveyPhotoSlot(): Promise<SurveyPhotoSlot | null> {
  const slot = await AsyncStorage.getItem(PENDING_SURVEY_PHOTO_SLOT_KEY);
  return isSurveyPhotoSlot(slot) ? slot : null;
}

/** Loads camera native module early so the first tap does not fetch a dev split bundle. */
export async function warmCameraModule(): Promise<void> {
  await ImagePicker.getCameraPermissionsAsync();
}

/** POST JPEG bytes to a Convex storage upload URL (no file:// fetch). */
export async function uploadSurveyPhotoBytes(
  uploadUrl: string,
  jpegBytes: Uint8Array,
): Promise<{ storageId: Id<'_storage'>; sizeKb: number }> {
  const { storageId } = await uploadJpegBytesToConvexUrl(uploadUrl, jpegBytes);
  return { storageId, sizeKb: Math.max(1, Math.ceil(jpegBytes.byteLength / 1024)) };
}
