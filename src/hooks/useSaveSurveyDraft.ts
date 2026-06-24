/**
 * Syncs a local AsyncStorage wizard draft to Convex (`survey.saveDraft`)
 * plus child rows (floors, photos, GPS) when present.
 */
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { draftToSaveDraftPayload, type WizardDraft } from '@/hooks/useWizardDraft';
import { withMutationRetry } from '@/utils/convexMutationRetry';
import { toUserMessage } from '@/utils/errors';
import { useConvex, useMutation } from 'convex/react';
import { useCallback, useRef, useState } from 'react';

export type DraftSyncSection = 'header' | 'floors' | 'photos';

export type SaveDraftResult = {
  surveyId: Id<'surveys'> | null;
  failedSections: DraftSyncSection[];
  sectionErrors: Partial<Record<DraftSyncSection, string>>;
};

export function formatSaveDraftError(result: SaveDraftResult): string {
  if (result.failedSections.length === 0) return '';
  return result.failedSections
    .map((s) => {
      const detail = result.sectionErrors[s];
      return detail ? `${s}: ${detail}` : s;
    })
    .join('; ');
}

function floorReadyForSync(f: NonNullable<WizardDraft['floors']>[number]): boolean {
  return !!(f.floorName && f.areaSqft > 0 && f.usageFactor && f.usageType && f.constructionType);
}

const EMPTY_SECTION_ERRORS: SaveDraftResult['sectionErrors'] = {};

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
      if (!payload) return { surveyId: null, failedSections: [], sectionErrors: EMPTY_SECTION_ERRORS };

      saveInFlight.current = (async () => {
        setSaving(true);
        const failedSections: DraftSyncSection[] = [];
        const sectionErrors: Partial<Record<DraftSyncSection, string>> = {};
        let surveyId: Id<'surveys'> | null = null;

        try {
          try {
            surveyId = await withMutationRetry(() => saveDraft(payload));
          } catch (e) {
            failedSections.push('header');
            sectionErrors.header = toUserMessage(e);
            return { surveyId: null, failedSections, sectionErrors };
          }

          const sid = surveyId;
          const floorSyncs: { f: NonNullable<WizardDraft['floors']>[number]; i: number }[] = [];
          const syncedFloorIds: string[] = [];
          (draft.floors ?? []).forEach((f, i) => {
            if (!floorReadyForSync(f)) return;
            floorSyncs.push({ f, i });
            syncedFloorIds.push(f.clientFloorId);
          });

          const upsertResults = await Promise.allSettled(
            floorSyncs.map(({ f, i }) =>
              withMutationRetry(() =>
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
            ),
          );

          const upsertFailed = upsertResults.filter((r) => r.status === 'rejected');
          if (upsertFailed.length > 0) {
            failedSections.push('floors');
            sectionErrors.floors = upsertFailed
              .map((r) => toUserMessage((r as PromiseRejectedResult).reason))
              .join('; ');
          } else {
            try {
              const keep = new Set(syncedFloorIds);
              const serverFloors = await convex.query(api.floors.list, { surveyId: sid });
              const removalResults = await Promise.allSettled(
                serverFloors
                  .filter((row) => !keep.has(row.clientFloorId))
                  .map((row) => withMutationRetry(() => removeFloor({ id: row._id }))),
              );
              const removalFailed = removalResults.filter((r) => r.status === 'rejected');
              if (removalFailed.length > 0) {
                failedSections.push('floors');
                sectionErrors.floors = removalFailed
                  .map((r) => toUserMessage((r as PromiseRejectedResult).reason))
                  .join('; ');
              }
            } catch (e) {
              failedSections.push('floors');
              sectionErrors.floors = toUserMessage(e);
            }
          }

          const photoResults = await Promise.allSettled(
            (draft.photos ?? []).map((photo) =>
              withMutationRetry(() =>
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
            ),
          );

          const photoFailed = photoResults.filter((r) => r.status === 'rejected');
          if (photoFailed.length > 0) {
            failedSections.push('photos');
            sectionErrors.photos = photoFailed
              .map((r) => toUserMessage((r as PromiseRejectedResult).reason))
              .join('; ');
          }

          return { surveyId: sid, failedSections, sectionErrors };
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
