/**
 * Survey summary / detail — thumbnail grid with real storage URLs.
 */
import { humanizeRole } from '@/utils/format';
import { SURVEY_PHOTO_SLOT_LABEL, type SurveyPhotoSlot } from '@/utils/surveyPhotos';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';

const SLOT_ORDER: Record<string, number> = {
  front: 0,
  side: 1,
  inside: 2,
  document: 3,
};

function slotLabel(slot: string): string {
  if (slot === 'front' || slot === 'side') {
    return SURVEY_PHOTO_SLOT_LABEL[slot as SurveyPhotoSlot];
  }
  return humanizeRole(slot);
}

export type SurveyPhotoRow = {
  _id: string;
  slot: string;
  url: string | null;
};

export function SurveyPhotoGrid({ photos, canRetake = false }: { photos: SurveyPhotoRow[]; canRetake?: boolean }) {
  const [preview, setPreview] = useState<SurveyPhotoRow | null>(null);

  const sorted = [...photos].sort((a, b) => (SLOT_ORDER[a.slot] ?? 99) - (SLOT_ORDER[b.slot] ?? 99));

  return (
    <>
      <View className="flex-row flex-wrap gap-3">
        {sorted.map((p) => (
          <Pressable
            key={p._id}
            onPress={() => p.url && setPreview(p)}
            className="flex-1 min-w-[42%]"
            accessibilityRole="imagebutton"
            accessibilityLabel={slotLabel(p.slot)}
          >
            <View className="rounded-lg overflow-hidden border border-line-subtle bg-page-light dark:bg-page-dark h-36">
              {p.url ? (
                <Image source={{ uri: p.url }} className="w-full h-36" resizeMode="cover" />
              ) : (
                <View className="flex-1 items-center justify-center p-3">
                  <Ionicons name="image-outline" size={32} color="#9CA3AF" />
                  <Text className="text-[11px] text-ink-tertiary-light text-center mt-2">
                    {canRetake ? 'Photo missing — retake in wizard' : 'Photo file missing'}
                  </Text>
                </View>
              )}
              {p.url ? (
                <View className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 items-center justify-center">
                  <Ionicons name="expand-outline" size={16} color="#FFFFFF" />
                </View>
              ) : null}
            </View>
            <Text className="text-caption text-ink-secondary-light dark:text-ink-secondary-dark text-center mt-1.5 font-medium">
              {slotLabel(p.slot)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal visible={preview != null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable className="flex-1 bg-black/90 justify-center p-4" onPress={() => setPreview(null)}>
          {preview?.url ? (
            <View>
              <Image
                source={{ uri: preview.url }}
                className="w-full rounded-lg"
                style={{ aspectRatio: 4 / 3 }}
                resizeMode="contain"
              />
              <Text className="text-white text-center mt-3 text-body font-medium">{slotLabel(preview.slot)}</Text>
              <Text className="text-white/60 text-center mt-1 text-caption">Tap anywhere to close</Text>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}
