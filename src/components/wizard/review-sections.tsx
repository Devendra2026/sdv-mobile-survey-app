import { AppButton, AppCard, Banner, ListRow, SectionLabel, StepIndicator } from '@/components';
import { GpsDebugPanel, GpsMapPreview } from '@/components/gis';
import { displayPropertyId } from '@/convex/propertyId';
import type { WizardDraft, WizardOwnerRow } from '@/hooks/useWizardDraft';
import {
  incompleteStepLabels,
  indicatorSteps,
  STEP_BEFORE_REVIEW_ROUTE,
  WIZARD_STEPS,
  wizardStepProgress,
} from '@/hooks/wizardSteps';
import { builtUpSqftFromFloors, plinthSqftFromFloors } from '@/utils/area';
import { formatArea, formatSurveyParcelLabel, humanizeRole } from '@/utils/format';
import { formatGpsDisplay, formatGpsFull } from '@/utils/formatGps';
import type { MastersBundle } from '@/utils/mastersBundle';
import { optionLabel, yesNoLabel } from '@/utils/services';
import { taxationSubcategoryFieldLabel } from '@/utils/taxation';
import { allMissingFields, stepValidationDetails } from '@/utils/wizardValidation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function ReviewDivider() {
  return <View className="h-px bg-line-subtle" />;
}

function ownerHasDetails(o: WizardOwnerRow): boolean {
  return !!(o.name?.trim() || o.fatherOrHusbandName?.trim() || o.mobileNo?.trim() || o.altMobileNo?.trim());
}

function collectPopulatedOwners(owners: WizardOwnerRow[] | undefined): WizardOwnerRow[] {
  const result: WizardOwnerRow[] = [];
  for (const o of owners ?? []) {
    if (ownerHasDetails(o)) result.push(o);
  }
  return result;
}

function formatOwnerSubtitle(o: WizardOwnerRow): string {
  return (
    [
      o.name?.trim(),
      o.fatherOrHusbandName?.trim(),
      o.mobileNo?.trim() ? `M: ${o.mobileNo.trim()}` : null,
      o.altMobileNo?.trim() ? `Alt: ${o.altMobileNo.trim()}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || '—'
  );
}

export function ReviewWizardHeader({ draft }: { draft: WizardDraft }) {
  const router = useRouter();
  const progress = wizardStepProgress(draft, 'photos');

  return (
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
          <Text className="text-caption text-white/80 mt-1">
            Step {progress.total} of {progress.total} · Review · {progress.percent}% complete
          </Text>
        </View>
      </View>
      <View className="mx-4 mb-2 h-1.5 rounded-full bg-white/20 overflow-hidden">
        <View className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, progress.percent)}%` }} />
      </View>
      <StepIndicator
        steps={indicatorSteps(draft, '')}
        activeKey=""
        onSelect={(key) => {
          const step = WIZARD_STEPS.find((s) => s.key === key);
          if (!step) return;
          router.replace({ pathname: step.route as never, params: { localId: draft.localId } });
        }}
      />
    </SafeAreaView>
  );
}

export function ReviewStepChecklist({ draft }: { draft: WizardDraft }) {
  const router = useRouter();
  const details = stepValidationDetails(draft);

  return (
    <>
      <SectionLabel>Step checklist</SectionLabel>
      <AppCard padded={false} className="mb-3">
        {details.map((step, i) => {
          const done = step.status === 'complete';
          const inProgress = step.status === 'in_progress';
          const subtitle = done
            ? 'Complete — tap to review'
            : step.missingFields.length > 0
              ? `Missing: ${step.missingFields.slice(0, 3).join(', ')}${step.missingFields.length > 3 ? '…' : ''}`
              : inProgress
                ? 'In progress — tap to continue'
                : 'Incomplete — tap to fix';
          const route = WIZARD_STEPS.find((s) => s.key === step.key)?.route;
          return (
            <View key={step.key}>
              {i > 0 ? <ReviewDivider /> : null}
              <ListRow
                icon={done ? 'checkmark-circle' : inProgress ? 'ellipse' : 'ellipse-outline'}
                iconTone={done ? 'success' : inProgress ? 'warning' : 'neutral'}
                title={step.label}
                subtitle={subtitle}
                showChevron
                onPress={
                  route
                    ? () => router.replace({ pathname: route as never, params: { localId: draft.localId } })
                    : undefined
                }
              />
            </View>
          );
        })}
      </AppCard>
    </>
  );
}

export function ReviewCompletionBanner({ allComplete, draft }: { allComplete: boolean; draft?: WizardDraft }) {
  if (!allComplete) {
    const missingFields = draft ? allMissingFields(draft) : [];
    const missingSteps = draft ? incompleteStepLabels(draft) : [];
    const fieldPreview = missingFields.slice(0, 5).join(', ');
    return (
      <Banner
        tone="warning"
        title="Some steps incomplete"
        message={
          missingFields.length > 0
            ? `Missing: ${fieldPreview}${missingFields.length > 5 ? ` (+${missingFields.length - 5} more)` : ''}. Steps: ${missingSteps.join(', ')}.`
            : missingSteps.length > 0
              ? `Complete: ${missingSteps.join(', ')}. Tap the checklist to jump to a step.`
              : 'Tap the checklist to jump to a step and finish it.'
        }
        icon="warning-outline"
        className="mb-3"
      />
    );
  }

  return (
    <Banner
      tone="success"
      title="Ready to submit"
      message="Verify your photos below, then submit. The supervisor will review next."
      icon="checkmark-done-circle-outline"
      className="mb-3"
    />
  );
}

export function ReviewSurveyStartSection({
  draft,
  districtName,
  muniName,
  muniCode,
}: {
  draft: WizardDraft;
  districtName: string;
  muniName: string;
  muniCode: string;
}) {
  return (
    <>
      <SectionLabel>Survey start</SectionLabel>
      <AppCard padded={false} className="mb-3">
        <ListRow
          icon="calendar-outline"
          iconTone="brand"
          title="Assessment year"
          subtitle={draft.assessmentYear ?? '—'}
          showChevron={false}
        />
        <ReviewDivider />
        <ListRow icon="map-outline" iconTone="neutral" title="District" subtitle={districtName} showChevron={false} />
        <ReviewDivider />
        <ListRow
          icon="business-outline"
          iconTone="neutral"
          title="ULB"
          subtitle={`${muniName} (${muniCode})`}
          showChevron={false}
        />
      </AppCard>
    </>
  );
}

export function ReviewPropertySection({ draft, ulbCode }: { draft: WizardDraft; ulbCode: string }) {
  const propertyId = displayPropertyId(
    {
      propertyId: draft.propertyId,
      wardNo: draft.wardNo,
      parcelNo: draft.parcelNo,
      unitNo: draft.unitNo,
      propertyUse: draft.propertyUse,
    },
    ulbCode,
  );

  return (
    <>
      <SectionLabel>Property</SectionLabel>
      <AppCard padded={false} className="mb-3">
        <ReviewDivider />
        <ListRow
          icon="map-outline"
          iconTone="neutral"
          title="Ward"
          subtitle={draft.wardNo ?? '—'}
          showChevron={false}
        />
        {draft.sectorNo ? (
          <>
            <ReviewDivider />
            <ListRow
              icon="grid-outline"
              iconTone="neutral"
              title="Sector"
              subtitle={draft.sectorNo}
              showChevron={false}
            />
          </>
        ) : null}
        <ReviewDivider />
        <ListRow
          icon="pricetag-outline"
          iconTone="neutral"
          title="Parcel / unit"
          subtitle={draft.parcelNo && draft.unitNo ? formatSurveyParcelLabel(draft.parcelNo, draft.unitNo) : '—'}
          showChevron={false}
        />
        {draft.oldPropertyNo ? (
          <>
            <ReviewDivider />
            <ListRow
              icon="document-text-outline"
              iconTone="neutral"
              title="Old property no"
              subtitle={draft.oldPropertyNo}
              showChevron={false}
            />
          </>
        ) : null}
        <ReviewDivider />
        <ListRow
          icon="finger-print-outline"
          iconTone="neutral"
          title="Property ID"
          subtitle={propertyId ?? '—'}
          showChevron={false}
        />
        {draft.constructedYear != null ? (
          <>
            <ReviewDivider />
            <ListRow
              icon="calendar-outline"
              iconTone="neutral"
              title="Constructed year"
              subtitle={String(draft.constructedYear)}
              showChevron={false}
            />
          </>
        ) : (
          <>
            <ReviewDivider />
            <ListRow
              icon="calendar-outline"
              iconTone="neutral"
              title="Constructed year"
              subtitle="—"
              showChevron={false}
            />
          </>
        )}
      </AppCard>
    </>
  );
}

export function ReviewOwnerSection({ draft }: { draft: WizardDraft }) {
  const populatedOwners = collectPopulatedOwners(draft.owners);
  const multiOwner = (draft.owners?.length ?? 0) > 1;

  return (
    <>
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
            <ReviewDivider />
            <ListRow
              icon="link-outline"
              iconTone="neutral"
              title="Relation to owner"
              subtitle={draft.relationship}
              showChevron={false}
            />
          </>
        ) : null}
        {populatedOwners.map((o, i) => (
          <View key={o.clientOwnerId}>
            <ReviewDivider />
            <ListRow
              icon="home-outline"
              iconTone="neutral"
              title={multiOwner ? `Owner ${i + 1}` : 'Owner'}
              subtitle={formatOwnerSubtitle(o)}
              showChevron={false}
            />
          </View>
        ))}
        {draft.familySize != null ? (
          <>
            <ReviewDivider />
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
    </>
  );
}

export function ReviewAddressSection({ draft }: { draft: WizardDraft }) {
  return (
    <>
      <SectionLabel>Address</SectionLabel>
      <AppCard padded className="mb-3">
        <Text className="text-body text-ink-primary-light dark:text-ink-primary-dark">
          {[draft.houseNo, draft.colonyName, draft.locality].filter(Boolean).join(', ')}
        </Text>
        <Text className="text-helper text-ink-tertiary-light mt-1">
          {draft.city} — {draft.pinCode}
        </Text>
      </AppCard>
    </>
  );
}

export function ReviewTaxationSection({ draft, bundle }: { draft: WizardDraft; bundle: MastersBundle }) {
  return (
    <>
      <SectionLabel>Taxation</SectionLabel>
      <AppCard padded={false} className="mb-3">
        <ListRow title="Assessment year" subtitle={draft.assessmentYear ?? '—'} showChevron={false} />
        <ReviewDivider />
        <ListRow title="Ownership use" subtitle={humanizeRole(draft.ownershipType)} showChevron={false} />
        <ReviewDivider />
        <ListRow title="Property type" subtitle={humanizeRole(draft.propertyUse)} showChevron={false} />
        {draft.propertyType ? (
          <>
            <ReviewDivider />
            <ListRow
              title={taxationSubcategoryFieldLabel(draft.propertyUse)}
              subtitle={optionLabel(
                draft.propertyType,
                bundle.propertyUseSubcategories?.[draft.propertyUse ?? ''] ?? [],
              )}
              showChevron={false}
            />
          </>
        ) : null}
        <ReviewDivider />
        <ListRow title="Situation" subtitle={humanizeRole(draft.situation)} showChevron={false} />
        <ReviewDivider />
        <ListRow title="Road type" subtitle={humanizeRole(draft.roadType)} showChevron={false} />
        <ReviewDivider />
        <ListRow title="Road size tax zone" subtitle={humanizeRole(draft.taxRateZone)} showChevron={false} />
      </AppCard>
    </>
  );
}

export function ReviewAreaSection({ draft }: { draft: WizardDraft }) {
  return (
    <>
      <SectionLabel>Area detail</SectionLabel>
      <AppCard padded={false} className="mb-3">
        <ListRow title="Plot area" subtitle={formatArea(draft.plotSqft ?? 0)} showChevron={false} />
        <ReviewDivider />
        <ListRow
          title="Plinth area"
          subtitle={formatArea(plinthSqftFromFloors(draft.floors ?? []) || draft.plinthSqft || 0)}
          showChevron={false}
        />
        <ReviewDivider />
        <ListRow
          title="Total built-up"
          subtitle={formatArea(builtUpSqftFromFloors(draft.floors ?? []))}
          showChevron={false}
        />
      </AppCard>
    </>
  );
}

export function ReviewFloorsSection({ draft, bundle }: { draft: WizardDraft; bundle: MastersBundle }) {
  return (
    <>
      <SectionLabel>Floors ({draft.floors?.length ?? 0})</SectionLabel>
      <AppCard padded={false} className="mb-3">
        {!draft.floors || draft.floors.length === 0 ? (
          <Text className="text-helper text-ink-tertiary-light text-center py-4">No floors</Text>
        ) : (
          draft.floors.map((f, i) => (
            <View key={f.clientFloorId}>
              {i > 0 ? <ReviewDivider /> : null}
              <ListRow
                title={`${humanizeRole(f.floorName)} · ${optionLabel(f.usageFactor, bundle.usageFactors)}`}
                subtitle={[
                  optionLabel(f.usageType, bundle.usageTypes),
                  formatArea(f.areaSqft),
                  humanizeRole(f.constructionType),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                showChevron={false}
              />
            </View>
          ))
        )}
      </AppCard>
    </>
  );
}

export function ReviewServicesSection({ draft, bundle }: { draft: WizardDraft; bundle: MastersBundle }) {
  return (
    <>
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
    </>
  );
}

export function ReviewGpsSection({ draft }: { draft: WizardDraft }) {
  return (
    <>
      <SectionLabel>GPS</SectionLabel>
      <AppCard padded className="mb-3">
        {draft.gps ? (
          <>
            {draft.gps.isMockLocation ? (
              <Banner
                tone="danger"
                title="Mock location detected"
                message="Retake GPS using a real device location before submitting."
                icon="warning-outline"
                className="mb-3"
              />
            ) : null}
            <GpsMapPreview coordinate={draft.gps} interactive={false} />
            <Text className="text-body font-mono text-ink-primary-light dark:text-ink-primary-dark mt-3">
              {formatGpsFull(draft.gps)}
            </Text>
            <Text className="text-caption text-ink-tertiary-light mt-1">{formatGpsDisplay(draft.gps)}</Text>
            <GpsDebugPanel gps={draft.gps} />
          </>
        ) : (
          <Text className="text-helper text-ink-tertiary-light">No GPS captured</Text>
        )}
      </AppCard>
    </>
  );
}

export function ReviewSubmitActions({
  canSaveDraft,
  allComplete,
  savingDraft,
  busy,
  onSaveDraft,
  onSubmit,
}: {
  canSaveDraft: boolean;
  allComplete: boolean;
  savingDraft: boolean;
  busy: boolean;
  onSaveDraft: () => void;
  onSubmit: () => void;
}) {
  return (
    <View className="gap-2">
      <AppButton
        label={savingDraft ? 'Saving draft…' : 'Save draft'}
        variant="outline"
        loading={savingDraft}
        disabled={!canSaveDraft || busy}
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
  );
}
