/**
 * Syncs a local AsyncStorage wizard draft to Convex (`survey.saveDraft`)
 * plus child rows (floors, photos, GPS) when present.
 */
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { draftToSaveDraftPayload, type WizardDraft } from '@/hooks/useWizardDraft';
import { useConvex, useMutation } from 'convex/react';
import { useCallback, useRef, useState } from 'react';

export type DraftSyncSection = 'header' | 'floors' | 'photos';

export type SaveDraftResult = {
  surveyId: Id<'surveys'> | null;
  failedSections: DraftSyncSection[];
};

function floorReadyForSync(f: NonNullable<WizardDraft['floors']>[number]): boolean {
  return !!(f.floorName && f.areaSqft > 0 && f.usageFactor && f.usageType && f.constructionType);
}

export function useSaveSurveyDraft() {
  const convex = useConvex();
  const saveDraft = useMutation(api.survey.saveDraft);
  const upsertFloor = useMutation(api.floors.upsert);
  const removeFloor = useMutation(api.floors.remove);
  const linkPhoto = useMutation(api.photos.linkPhoto);
  const [saving, setSaving] = useState(false);

  const saveInFlight = useRef<Promise<SaveDraftResult> | null>(null);

  const save = useCallback(
    async (draft: WizardDraft): Promise<SaveDraftResult> => {
      if (saveInFlight.current) return saveInFlight.current;

      const payload = draftToSaveDraftPayload(draft);
      if (!payload) return { surveyId: null, failedSections: [] };

      saveInFlight.current = (async () => {
        setSaving(true);
        const failedSections: DraftSyncSection[] = [];
        let surveyId: Id<'surveys'> | null = null;

        try {
          try {
            surveyId = await saveDraft(payload);
          } catch {
            failedSections.push('header');
            return { surveyId: null, failedSections };
          }

          const sid = surveyId;
          const floorSyncs: { f: NonNullable<WizardDraft['floors']>[number]; i: number }[] = [];
          const syncedFloorIds: string[] = [];
          (draft.floors ?? []).forEach((f, i) => {
            if (!floorReadyForSync(f)) return;
            floorSyncs.push({ f, i });
            syncedFloorIds.push(f.clientFloorId);
          });

          try {
            await Promise.all(
              floorSyncs.map(({ f, i }) =>
                upsertFloor({
                  surveyId: sid,
                  clientFloorId: f.clientFloorId,
                  position: i,
                  floorName: f.floorName,
                  usageFactor: f.usageFactor,
                  usageType: f.usageType,
                  constructionType: f.constructionType,
                  isOccupied: f.isOccupied,
                  areaSqft: f.areaSqft,
                }),
              ),
            );

            const keep = new Set(syncedFloorIds);
            const serverFloors = await convex.query(api.floors.list, { surveyId: sid });
            const removals = [];
            for (const row of serverFloors) {
              if (!keep.has(row.clientFloorId)) {
                removals.push(removeFloor({ id: row._id }));
              }
            }
            await Promise.all(removals);
          } catch {
            failedSections.push('floors');
          }

          try {
            await Promise.all(
              (draft.photos ?? []).map((photo) =>
                linkPhoto({
                  surveyId: sid,
                  slot: photo.slot,
                  storageId: photo.storageId,
                  sizeKb: photo.sizeKb,
                  width: photo.width,
                  height: photo.height,
                  capturedAt: photo.capturedAt,
                }),
              ),
            );
          } catch {
            failedSections.push('photos');
          }

          return { surveyId: sid, failedSections };
        } finally {
          setSaving(false);
        }
      })();

      try {
        return await saveInFlight.current;
      } finally {
        saveInFlight.current = null;
      }
    },
    [convex, saveDraft, upsertFloor, removeFloor, linkPhoto],
  );

  return { save, saving };
}
