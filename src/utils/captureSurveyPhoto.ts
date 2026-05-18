import type { Id } from '@/convex/_generated/dataModel';
import { toPhotoErrorMessage, uploadJpegBytesToConvexUrl } from '@/utils/convex-storage';
import * as ImageManipulator from 'expo-image-manipulator';
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

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toCaptureError(e: unknown): Error {
  return new Error(toPhotoErrorMessage(e));
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
      quality: 1,
      exif: false,
      allowsEditing: false,
      ...(Platform.OS === 'android' ? { skipProcessing: true as const } : {}),
    });

    if (picked.canceled || picked.assets.length === 0) {
      return { canceled: true };
    }

    const compressed = await ImageManipulator.manipulateAsync(picked.assets[0].uri, [{ resize: { width: 1280 } }], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });

    if (!compressed.base64) {
      throw new Error('Photo processing failed — try again');
    }

    return {
      canceled: false,
      uri: compressed.uri,
      width: compressed.width,
      height: compressed.height,
      jpegBytes: base64ToBytes(compressed.base64),
    };
  } catch (e) {
    throw toCaptureError(e);
  }
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
