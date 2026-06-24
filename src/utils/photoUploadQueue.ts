/**
 * Offline photo link queue — flush when network returns (storage already uploaded).
 */
import type { SurveyPhotoSlot } from '@/utils/surveyPhotos';
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'photo_upload_queue_v1';

export type QueuedPhotoUpload = {
  localId: string;
  slot: SurveyPhotoSlot;
  storageId: string;
  sizeKb: number;
  width: number;
  height: number;
  capturedAt: number;
  previewUri?: string;
};

export async function enqueuePhotoUpload(entry: QueuedPhotoUpload): Promise<void> {
  const queue = await readPhotoUploadQueue();
  const without = queue.filter((e) => !(e.localId === entry.localId && e.slot === entry.slot));
  without.push(entry);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(without));
}

export async function readPhotoUploadQueue(): Promise<QueuedPhotoUpload[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedPhotoUpload[]) : [];
}

export async function hasPendingPhotoUploads(localId: string): Promise<boolean> {
  const queue = await readPhotoUploadQueue();
  return queue.some((e) => e.localId === localId);
}

export function previewUrisFromQueue(
  queue: QueuedPhotoUpload[],
  localId: string,
): Partial<Record<SurveyPhotoSlot, string>> {
  const out: Partial<Record<SurveyPhotoSlot, string>> = {};
  for (const item of queue) {
    if (item.localId === localId && item.previewUri) {
      out[item.slot] = item.previewUri;
    }
  }
  return out;
}

export async function dequeuePhotoUpload(localId: string, slot: SurveyPhotoSlot): Promise<void> {
  const queue = await readPhotoUploadQueue();
  const next = queue.filter((e) => !(e.localId === localId && e.slot === slot));
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
}
