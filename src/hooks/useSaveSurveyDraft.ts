/**
 * Syncs a local AsyncStorage wizard draft to Convex (`surveys.saveDraft`)
 * plus child rows (floors, photos, GPS) when present.
 */
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { draftToSaveDraftPayload, type WizardDraft } from '@/hooks/useWizardDraft';
import { useConvex, useMutation } from 'convex/react';
import { useCallback, useState } from 'react';

function floorReadyForSync(f: NonNullable<WizardDraft['floors']>[number]): boolean {
  return !!(f.floorName && f.areaSqft > 0 && f.usageFactor && f.usageType && f.constructionType);
}

export function useSaveSurveyDraft() {
  const convex = useConvex();
  const saveDraft = useMutation(api.surveys.saveDraft);
  const upsertFloor = useMutation(api.floors.upsert);
  const removeFloor = useMutation(api.floors.remove);
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
            usageFactor: f.usageFactor,
            usageType: f.usageType,
            constructionType: f.constructionType,
            isOccupied: f.isOccupied,
            areaSqft: f.areaSqft,
          });
        }
        const keep = new Set(syncedFloorIds);
        const serverFloors = await convex.query(api.floors.list, { surveyId });
        for (const row of serverFloors) {
          if (!keep.has(row.clientFloorId)) {
            await removeFloor({ id: row._id });
          }
        }

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
    [convex, saveDraft, upsertFloor, removeFloor, linkPhoto],
  );

  return { save, saving };
}
