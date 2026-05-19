/**
 * Syncs a local AsyncStorage wizard draft to Convex (`surveys.saveDraft`)
 * plus child rows (floors, photos, GPS) when present.
 */
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { draftToSaveDraftPayload, type WizardDraft } from '@/hooks/useWizardDraft';
import { useMutation } from 'convex/react';
import { useCallback, useState } from 'react';

function floorReadyForSync(f: NonNullable<WizardDraft['floors']>[number]): boolean {
  return !!(f.floorName && f.areaSqft > 0 && f.usageType && f.constructionType);
}

export function useSaveSurveyDraft() {
  const saveDraft = useMutation(api.surveys.saveDraft);
  const upsertFloor = useMutation(api.floors.upsert);
  const removeOrphanFloors = useMutation(api.floors.removeOrphans);
  const linkPhoto = useMutation(api.photos.linkPhoto);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (draft: WizardDraft): Promise<Id<'surveys'> | null> => {
      const payload = draftToSaveDraftPayload(draft);
      if (!payload) return null;

      setSaving(true);
      try {
        const surveyId = await saveDraft(payload);

        const syncedFloorIds: string[] = [];
        for (let i = 0; i < (draft.floors ?? []).length; i++) {
          const f = draft.floors![i]!;
          if (!floorReadyForSync(f)) continue;
          syncedFloorIds.push(f.clientFloorId);
          await upsertFloor({
            surveyId,
            clientFloorId: f.clientFloorId,
            position: i,
            floorName: f.floorName,
            usageType: f.usageType,
            constructionType: f.constructionType,
            isOccupied: f.isOccupied,
            areaSqft: f.areaSqft,
          });
        }
        await removeOrphanFloors({ surveyId, keepClientFloorIds: syncedFloorIds });

        for (const photo of draft.photos ?? []) {
          await linkPhoto({
            surveyId,
            slot: photo.slot,
            storageId: photo.storageId,
            sizeKb: photo.sizeKb,
            width: photo.width,
            height: photo.height,
            capturedAt: photo.capturedAt,
          });
        }

        return surveyId;
      } finally {
        setSaving(false);
      }
    },
    [saveDraft, upsertFloor, removeOrphanFloors, linkPhoto],
  );

  return { save, saving };
}
