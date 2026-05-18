/**
 * Review & submit.
 *
 * Validates that every step is complete (re-running stepCompletion) and
 * then runs the submit pipeline:
 *
 *   1. `surveys.upsert(filledDraft)` → returns surveyId
 *   2. `photos.linkPhoto(...)` for every photo captured in step 8
 *   3. `surveys.submit({ id: surveyId })` → flips status to 'submitted',
 *      enforces business rules server-side
 *   4. clear the AsyncStorage draft
 *   5. navigate to the survey detail screen
 *
 * Failures at any step leave the local draft intact so the surveyor can
 * fix and retry without losing data.
 */
import { AppButton, AppCard, Banner, ListRow, SectionLabel, Spinner, StepIndicator, Tag, Toast } from '@/components';
import { ReviewPhotosSection } from '@/components/wizard/review-photos-section';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useSaveSurveyDraft } from '@/hooks/useSaveSurveyDraft';
import {
  clearDraft,
  draftToSaveDraftPayload,
  draftToUpsertArgs,
  stepCompletion,
  useWizardDraft,
} from '@/hooks/useWizardDraft';
import { indicatorSteps, STEP_BEFORE_REVIEW_ROUTE, WIZARD_STEPS } from '@/hooks/wizardSteps';
import { gpsAccuracyTagLabel, gpsAccuracyTagTone } from '@/utils/captureGps';
import { toUserMessage } from '@/utils/errors';
import { formatArea, formatSurveyParcelLabel, humanizeRole } from '@/utils/format';
import { normalizeMastersBundle } from '@/utils/mastersBundle';
import { optionLabel, yesNoLabel } from '@/utils/services';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReviewScreen() {
  const router = useRouter();
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const { draft, loading, update } = useWizardDraft(localId);
  const masters = useQuery(api.masters.bundle, {});

  const { save: saveToServer, saving: savingDraft } = useSaveSurveyDraft();
  const submit = useMutation(api.surveys.submit);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ title: string; tone: 'success' | 'danger' } | null>(null);

  if (loading || !draft || !masters) return <Spinner label="Loading…" />;

  const bundle = normalizeMastersBundle(masters);
  const completion = stepCompletion(draft);
  const allComplete = Object.values(completion).every(Boolean);
  const args = allComplete ? draftToUpsertArgs(draft) : null;

  const selectedUlb = bundle.ulbs.find((u) => u._id === draft.municipalityId);
  const muniName = selectedUlb?.name ?? '—';
  const districtName =
    bundle.districts.find((d) => d._id === draft.districtId)?.name ?? selectedUlb?.districtName ?? '—';

  const persistServerSurveyId = async (surveyId: Id<'surveys'>) => {
    if (draft.serverSurveyId !== surveyId) {
      await update({ serverSurveyId: surveyId });
    }
  };

  const onSaveDraft = async () => {
    if (!draftToSaveDraftPayload(draft)) {
      setToast({ title: 'Select district and ULB first', tone: 'danger' });
      return;
    }
    try {
      const surveyId = await saveToServer(draft);
      if (surveyId) await persistServerSurveyId(surveyId);
      setToast({ title: 'Draft saved — you can continue later', tone: 'success' });
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    }
  };

  const onSubmit = async () => {
    if (!args) return;
    setBusy(true);
    try {
      const surveyId = await saveToServer(draft);
      if (!surveyId) {
        setToast({ title: 'Complete all required steps before submitting', tone: 'danger' });
        return;
      }
      await persistServerSurveyId(surveyId);
      await submit({ id: surveyId });
      await clearDraft(draft.localId);
      setToast({ title: 'Submitted for review', tone: 'success' });
      setTimeout(() => {
        router.replace({ pathname: '/(app)/survey/[id]', params: { id: surveyId } });
      }, 700);
    } catch (e) {
      setToast({ title: toUserMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-page-light dark:bg-page-dark">
      <SafeAreaView edges={['top']} className="bg-brand">
        <View className="px-4 pt-2 pb-2.5 flex-row items-center">
          <Ionicons
            name="chevron-back"
            size={22}
            color="#FFFFFF"
            onPress={() =>
              router.replace({ pathname: STEP_BEFORE_REVIEW_ROUTE as never, params: { localId: draft.localId } })
            }
          />
          <View className="flex-1 ml-2">
            <Text className="text-helper text-white/70">New survey</Text>
            <Text className="text-h3 font-medium text-white">Review & submit</Text>
          </View>
        </View>
        <StepIndicator
          steps={indicatorSteps(draft, '')}
          activeKey=""
          onSelect={(key) => {
            const step = WIZARD_STEPS.find((s) => s.key === key);
            if (step) router.replace({ pathname: step.route as never, params: { localId: draft.localId } });
          }}
        />
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        {!allComplete ? (
          <Banner
            tone="warning"
            title="Some steps incomplete"
            message="Tap the indicator above to jump to a step and finish it."
            icon="warning-outline"
            className="mb-3"
          />
        ) : (
          <Banner
            tone="success"
            title="Ready to submit"
            message="Verify your photos below, then submit. The supervisor will review next."
            icon="checkmark-done-circle-outline"
            className="mb-3"
          />
        )}

        <SectionLabel>Survey start</SectionLabel>
        <AppCard padded={false} className="mb-3">
          <ListRow
            icon="calendar-outline"
            iconTone="brand"
            title="Assessment year"
            subtitle={draft.assessmentYear ?? '—'}
            showChevron={false}
          />
          <Divider />
          <ListRow icon="map-outline" iconTone="neutral" title="District" subtitle={districtName} showChevron={false} />
          <Divider />
          <ListRow
            icon="business-outline"
            iconTone="neutral"
            title="ULB"
            subtitle={`${muniName} (${selectedUlb?.code ?? '—'})`}
            showChevron={false}
          />
        </AppCard>

        <SectionLabel>Property</SectionLabel>
        <AppCard padded={false} className="mb-3">
          <Divider />
          <ListRow
            icon="map-outline"
            iconTone="neutral"
            title="Ward"
            subtitle={draft.wardNo ?? '—'}
            showChevron={false}
          />
          {draft.sectorNo ? (
            <>
              <Divider />
              <ListRow
                icon="grid-outline"
                iconTone="neutral"
                title="Sector"
                subtitle={draft.sectorNo}
                showChevron={false}
              />
            </>
          ) : null}
          <Divider />
          <ListRow
            icon="pricetag-outline"
            iconTone="neutral"
            title="Parcel / unit"
            subtitle={draft.parcelNo && draft.unitNo ? formatSurveyParcelLabel(draft.parcelNo, draft.unitNo) : '—'}
            showChevron={false}
          />
          {draft.oldPropertyNo ? (
            <>
              <Divider />
              <ListRow
                icon="document-text-outline"
                iconTone="neutral"
                title="Old property no"
                subtitle={draft.oldPropertyNo}
                showChevron={false}
              />
            </>
          ) : null}
          {draft.constructedYear != null ? (
            <>
              <Divider />
              <ListRow
                icon="calendar-outline"
                iconTone="neutral"
                title="Constructed year"
                subtitle={String(draft.constructedYear)}
                showChevron={false}
              />
            </>
          ) : null}
        </AppCard>

        <SectionLabel>Owner</SectionLabel>
        <AppCard padded={false} className="mb-3">
          <ListRow
            icon="person-outline"
            iconTone="brand"
            title="Respondent"
            subtitle={draft.respondentName?.trim() || '—'}
            showChevron={false}
          />
          {draft.relationship ? (
            <>
              <Divider />
              <ListRow
                icon="link-outline"
                iconTone="neutral"
                title="Relation to owner"
                subtitle={draft.relationship}
                showChevron={false}
              />
            </>
          ) : null}
          {(draft.owners ?? [])
            .filter(
              (o) => o.name?.trim() || o.fatherOrHusbandName?.trim() || o.mobileNo?.trim() || o.altMobileNo?.trim(),
            )
            .map((o, i) => (
              <View key={o.clientOwnerId}>
                <Divider />
                <ListRow
                  icon="home-outline"
                  iconTone="neutral"
                  title={(draft.owners?.length ?? 0) > 1 ? `Owner ${i + 1}` : 'Owner'}
                  subtitle={
                    [
                      o.name?.trim(),
                      o.fatherOrHusbandName?.trim(),
                      o.mobileNo?.trim() ? `M: ${o.mobileNo.trim()}` : null,
                      o.altMobileNo?.trim() ? `Alt: ${o.altMobileNo.trim()}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'
                  }
                  showChevron={false}
                />
              </View>
            ))}
          {draft.familySize != null ? (
            <>
              <Divider />
              <ListRow
                icon="people-outline"
                iconTone="neutral"
                title="Family members"
                subtitle={`${draft.familySize}`}
                showChevron={false}
              />
            </>
          ) : null}
        </AppCard>

        <SectionLabel>Address</SectionLabel>
        <AppCard padded className="mb-3">
          <Text className="text-body text-ink-primary-light dark:text-ink-primary-dark">
            {[draft.houseNo, draft.colonyName, draft.locality].filter(Boolean).join(', ')}
          </Text>
          <Text className="text-helper text-ink-tertiary-light mt-1">
            {draft.city} — {draft.pinCode}
          </Text>
        </AppCard>

        <SectionLabel>Taxation</SectionLabel>
        <AppCard padded={false} className="mb-3">
          <ListRow title="Assessment year" subtitle={draft.assessmentYear ?? '—'} showChevron={false} />
          <Divider />
          <ListRow title="Ownership" subtitle={humanizeRole(draft.ownershipType)} showChevron={false} />
          <Divider />
          <ListRow title="Property use" subtitle={humanizeRole(draft.propertyUse)} showChevron={false} />
          {draft.propertyType ? (
            <>
              <Divider />
              <ListRow title="Subcategory" subtitle={humanizeRole(draft.propertyType)} showChevron={false} />
            </>
          ) : null}
          <Divider />
          <ListRow title="Situation" subtitle={humanizeRole(draft.situation)} showChevron={false} />
          <Divider />
          <ListRow title="Road type" subtitle={humanizeRole(draft.roadType)} showChevron={false} />
          <Divider />
          <ListRow title="Road size tax zone" subtitle={humanizeRole(draft.taxRateZone)} showChevron={false} />
        </AppCard>

        <SectionLabel>Area detail</SectionLabel>
        <AppCard padded={false} className="mb-3">
          <ListRow title="Plot area" subtitle={formatArea(draft.plotSqft ?? 0)} showChevron={false} />
          {(draft.floors ?? []).some((f) => f.floorName === 'open_land') ? (
            <>
              <Divider />
              <ListRow title="Plinth area" subtitle={formatArea(draft.plinthSqft ?? 0)} showChevron={false} />
              <Divider />
              <ListRow
                title="Total built-up"
                subtitle={formatArea((draft.floors ?? []).reduce((s, f) => s + (f.areaSqft > 0 ? f.areaSqft : 0), 0))}
                showChevron={false}
              />
            </>
          ) : null}
        </AppCard>

        <SectionLabel>Floors ({draft.floors?.length ?? 0})</SectionLabel>
        <AppCard padded={false} className="mb-3">
          {!draft.floors || draft.floors.length === 0 ? (
            <Text className="text-helper text-ink-tertiary-light text-center py-4">No floors</Text>
          ) : (
            draft.floors.map((f, i) => (
              <View key={f.clientFloorId}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={
                    f.floorName === 'open_land'
                      ? humanizeRole(f.floorName)
                      : `${humanizeRole(f.floorName)} · ${humanizeRole(f.usageType)}`
                  }
                  subtitle={
                    f.floorName === 'open_land'
                      ? formatArea(f.areaSqft)
                      : `${formatArea(f.areaSqft)} · ${humanizeRole(f.constructionType)}`
                  }
                  showChevron={false}
                />
              </View>
            ))
          )}
        </AppCard>

        <SectionLabel>Services</SectionLabel>
        <AppCard padded={false} className="mb-3">
          <ListRow
            title="Municipal water connection"
            subtitle={yesNoLabel(draft.municipalWaterConnection)}
            showChevron={false}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow
            title="Source of water"
            subtitle={optionLabel(draft.waterSource, bundle.waterSources)}
            showChevron={false}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow
            title="Sanitation"
            subtitle={optionLabel(draft.sanitationType, bundle.sanitationTypes)}
            showChevron={false}
          />
          <View className="h-px bg-line-subtle" />
          <ListRow
            title="Door-to-door waste collection"
            subtitle={yesNoLabel(draft.municipalWasteCollection)}
            showChevron={false}
          />
        </AppCard>

        <SectionLabel>GPS</SectionLabel>
        <AppCard padded className="mb-3">
          {draft.gps ? (
            <>
              <Text className="text-body font-mono text-ink-primary-light dark:text-ink-primary-dark">
                {draft.gps.latitude.toFixed(6)}, {draft.gps.longitude.toFixed(6)}
              </Text>
              <View className="flex-row gap-1.5 mt-2">
                <Tag
                  label={gpsAccuracyTagLabel(draft.gps.accuracyMeters)}
                  tone={gpsAccuracyTagTone(draft.gps.accuracyMeters)}
                  icon="locate-outline"
                />
              </View>
            </>
          ) : (
            <Text className="text-helper text-ink-tertiary-light">No GPS captured</Text>
          )}
        </AppCard>

        <ReviewPhotosSection
          draft={draft}
          update={update}
          serverSurveyId={draft.serverSurveyId}
          onEditStep={() =>
            router.replace({ pathname: '/(app)/wizard/photos' as never, params: { localId: draft.localId } })
          }
        />

        <View className="gap-2">
          <AppButton
            label={savingDraft ? 'Saving draft…' : 'Save draft'}
            variant="outline"
            loading={savingDraft}
            disabled={!draftToSaveDraftPayload(draft) || busy}
            onPress={onSaveDraft}
            iconLeft="cloud-outline"
            size="lg"
            fullWidth
          />
          <AppButton
            label={busy ? 'Submitting…' : 'Submit for review'}
            loading={busy}
            disabled={!allComplete || savingDraft}
            onPress={onSubmit}
            iconLeft="cloud-upload-outline"
            size="lg"
            fullWidth
          />
        </View>
      </ScrollView>

      {toast ? <Toast visible title={toast.title} tone={toast.tone} onHide={() => setToast(null)} /> : null}
    </View>
  );
}

function Divider() {
  return <View className="h-px bg-line-subtle" />;
}
