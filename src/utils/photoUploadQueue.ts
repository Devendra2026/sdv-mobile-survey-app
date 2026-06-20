/**
 * Offline photo upload queue — flush when network returns.
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
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: QueuedPhotoUpload[] = raw ? (JSON.parse(raw) as QueuedPhotoUpload[]) : [];
  queue.push(entry);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function readPhotoUploadQueue(): Promise<QueuedPhotoUpload[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedPhotoUpload[]) : [];
}

async function clearPhotoUploadQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function dequeuePhotoUpload(localId: string, slot: SurveyPhotoSlot): Promise<void> {
  const queue = await readPhotoUploadQueue();
  const next = queue.filter((e) => !(e.localId === localId && e.slot === slot));
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
}
