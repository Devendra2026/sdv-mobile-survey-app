import { AppButton, AppCard, Banner, ListRow, SectionLabel, StatusBadge, Tag } from '@/components';
import { GpsDebugPanel, GpsMapPreview } from '@/components/gis';
import { SurveyPhotoGrid } from '@/components/survey/survey-photo-grid';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { builtUpSqftFromFloors, plinthSqftFromFloors } from '@/utils/area';
import { formatArea, formatSurveyParcelLabel, humanizeRole, timeAgo } from '@/utils/format';
import { formatGpsDisplay, formatGpsFull } from '@/utils/formatGps';
import type { MastersBundle } from '@/utils/mastersBundle';
import { optionLabel, yesNoLabel } from '@/utils/services';
import { taxationSubcategoryFieldLabel } from '@/utils/taxation';
import { Ionicons } from '@expo/vector-icons';
import type { FunctionReturnType } from 'convex/server';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type SurveyDetail = NonNullable<FunctionReturnType<typeof api.survey.get>>;

type OwnerRow = NonNullable<SurveyDetail['owners']>[number];

function RowDivider() {
  return <View className="h-px bg-line-subtle" />;
}

function ownerHasDetails(o: OwnerRow): boolean {
  return !!(o.name?.trim() || o.fatherOrHusbandName?.trim() || o.mobileNo?.trim() || o.altMobileNo?.trim());
}

function collectPopulatedOwners(owners: OwnerRow[] | undefined): OwnerRow[] {
  const result: OwnerRow[] = [];
  for (const o of owners ?? []) {
    if (ownerHasDetails(o)) result.push(o);
  }
  return result;
}

function formatOwnerSubtitle(o: OwnerRow): string {
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

export function SurveyDetailHeader({ survey, onBack }: { survey: SurveyDetail; onBack: () => void }) {
  return (
    <SafeAreaView edges={['top']} className="bg-brand">
      <View className="px-4 py-3 flex-row items-center">
        <Ionicons name="chevron-back" size={22} color="#FFFFFF" onPress={onBack} />
        <View className="flex-1 ml-2">
          <Text className="text-helper text-white/75">Survey · v{survey.serverVersion}</Text>
          <Text className="text-h3 font-medium text-white" numberOfLines={1}>
            {formatSurveyParcelLabel(survey.parcelNo, survey.unitNo)}
          </Text>
        </View>
      </View>
      <View className="px-4 pb-3 flex-row gap-1.5">
        <StatusBadge status={survey.status} />
        {survey.qcStatus !== 'pending' ? (
          <Tag
            label={`QC: ${survey.qcStatus}`}
            tone={survey.qcStatus === 'approved' ? 'success' : 'danger'}
            icon={survey.qcStatus === 'approved' ? 'checkmark-circle' : 'alert'}
          />
        ) : null}
        <Tag label={`Ward ${survey.wardNo}`} tone="neutral" icon="map-outline" />
      </View>
    </SafeAreaView>
  );
}

export function SurveyRejectedBanner({ survey }: { survey: SurveyDetail }) {
  if (survey.qcStatus !== 'rejected') return null;
  return (
    <Banner
      tone="danger"
      icon="alert-circle"
      title="Returned by supervisor"
      message="Check the remarks below and edit the draft to resubmit."
      className="mb-3"
    />
  );
}

export function SurveyOwnerSection({ survey }: { survey: SurveyDetail }) {
  const populatedOwners = collectPopulatedOwners(survey.owners);
  const multiOwner = (survey.owners?.length ?? 0) > 1;

  return (
    <>
      <SectionLabel>Owner</SectionLabel>
      <AppCard padded={false} className="mb-3">
        <ListRow
          icon="person-outline"
          iconTone="brand"
          title="Respondent"
          subtitle={survey.respondentName?.trim() || '—'}
          showChevron={false}
        />
        {survey.relationship ? (
          <>
            <RowDivider />
            <ListRow
              icon="link-outline"
              iconTone="neutral"
              title="Relation to owner"
              subtitle={survey.relationship}
              showChevron={false}
            />
          </>
        ) : null}
        {populatedOwners.map((o, i) => (
          <View key={`${o.name ?? ''}-${o.fatherOrHusbandName ?? ''}-${o.mobileNo ?? ''}`}>
            <RowDivider />
            <ListRow
              icon="home-outline"
              iconTone="neutral"
              title={multiOwner ? `Owner ${i + 1}` : 'Owner'}
              subtitle={formatOwnerSubtitle(o)}
              showChevron={false}
            />
          </View>
        ))}
        {survey.familySize != null ? (
          <>
            <RowDivider />
            <ListRow
              icon="people-outline"
              iconTone="neutral"
              title="Family members"
              subtitle={`${survey.familySize}`}
              showChevron={false}
            />
          </>
        ) : null}
        {!survey.owners?.some((o) => o.mobileNo?.trim()) && survey.mobileNo ? (
          <>
            <RowDivider />
            <ListRow
              icon="call-outline"
              iconTone="neutral"
              title="Mobile"
              subtitle={survey.mobileNo}
              showChevron={false}
            />
          </>
        ) : null}
      </AppCard>
    </>
  );
}

export function SurveyAddressSection({ survey }: { survey: SurveyDetail }) {
  return (
    <>
      <SectionLabel>Address</SectionLabel>
      <AppCard padded className="mb-3">
        <Text className="text-body text-ink-primary-light dark:text-ink-primary-dark">
          {[survey.houseNo, survey.colonyName, survey.locality].filter(Boolean).join(', ')}
        </Text>
        <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1">
          {survey.city} — {survey.pinCode}
        </Text>
      </AppCard>
    </>
  );
}

export function SurveyTaxationSection({ survey, bundle }: { survey: SurveyDetail; bundle: MastersBundle }) {
  return (
    <>
      <SectionLabel>Taxation</SectionLabel>
      <AppCard padded={false} className="mb-3">
        <ListRow title="Assessment year" subtitle={survey.assessmentYear} showChevron={false} />
        <RowDivider />
        <ListRow title="Ownership use" subtitle={humanizeRole(survey.ownershipType)} showChevron={false} />
        <RowDivider />
        <ListRow title="Property type" subtitle={humanizeRole(survey.propertyUse)} showChevron={false} />
        {survey.propertyType ? (
          <>
            <RowDivider />
            <ListRow
              title={taxationSubcategoryFieldLabel(survey.propertyUse)}
              subtitle={optionLabel(survey.propertyType, bundle.propertyUseSubcategories?.[survey.propertyUse] ?? [])}
              showChevron={false}
            />
          </>
        ) : null}
        <RowDivider />
        <ListRow title="Situation" subtitle={humanizeRole(survey.situation)} showChevron={false} />
        <RowDivider />
        <ListRow title="Road type" subtitle={humanizeRole(survey.roadType)} showChevron={false} />
        <RowDivider />
        <ListRow title="Road size tax zone" subtitle={humanizeRole(survey.taxRateZone)} showChevron={false} />
      </AppCard>
    </>
  );
}

export function SurveyAreaSection({ survey }: { survey: SurveyDetail }) {
  return (
    <>
      <SectionLabel>Area detail</SectionLabel>
      <AppCard padded={false} className="mb-3">
        <ListRow title="Plot area" subtitle={formatArea(survey.plotSqft)} showChevron={false} />
        <RowDivider />
        <ListRow
          title="Plinth area"
          subtitle={formatArea(plinthSqftFromFloors(survey.floors) || survey.plinthSqft)}
          showChevron={false}
        />
        <RowDivider />
        <ListRow
          title="Total built-up"
          subtitle={formatArea(builtUpSqftFromFloors(survey.floors))}
          showChevron={false}
        />
      </AppCard>
    </>
  );
}

export function SurveyFloorsSection({ survey, bundle }: { survey: SurveyDetail; bundle: MastersBundle }) {
  return (
    <>
      <SectionLabel>Floors ({survey.floors.length})</SectionLabel>
      <AppCard padded={false} className="mb-3">
        {survey.floors.length === 0 ? (
          <View className="p-4 items-center">
            <Text className="text-helper text-ink-tertiary-light">No floors yet</Text>
          </View>
        ) : (
          survey.floors.map((f, i) => (
            <View key={f._id}>
              {i > 0 ? <RowDivider /> : null}
              <ListRow
                title={`${humanizeRole(f.floorName)} · ${optionLabel(f.usageFactor, bundle.usageFactors)}`}
                subtitle={[
                  optionLabel(f.usageType, bundle.usageTypes),
                  formatArea(f.areaSqft),
                  humanizeRole(f.constructionType),
                  f.isOccupied ? undefined : 'vacant',
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

export function SurveyServicesSection({ survey, bundle }: { survey: SurveyDetail; bundle: MastersBundle }) {
  return (
    <>
      <SectionLabel>Services</SectionLabel>
      <AppCard padded={false} className="mb-3">
        <ListRow
          title="Municipal water connection"
          subtitle={yesNoLabel(survey.municipalWaterConnection)}
          showChevron={false}
        />
        <RowDivider />
        <ListRow
          title="Source of water"
          subtitle={optionLabel(survey.waterSource, bundle.waterSources)}
          showChevron={false}
        />
        <RowDivider />
        <ListRow
          title="Sanitation"
          subtitle={optionLabel(survey.sanitationType, bundle.sanitationTypes)}
          showChevron={false}
        />
        <RowDivider />
        <ListRow
          title="Door-to-door waste collection"
          subtitle={yesNoLabel(survey.municipalWasteCollection)}
          showChevron={false}
        />
      </AppCard>
    </>
  );
}

export function SurveyGpsSection({ survey }: { survey: SurveyDetail }) {
  return (
    <>
      <SectionLabel>GPS</SectionLabel>
      <AppCard padded={false} className="mb-3">
        {survey.gps ? (
          <>
            <View className="p-4 pb-0">
              <GpsMapPreview coordinate={survey.gps} interactive={false} />
            </View>
            <ListRow
              icon="location-outline"
              iconTone="brand"
              title="Coordinates"
              subtitle={formatGpsFull(survey.gps)}
              showChevron={false}
            />
            <RowDivider />
            <ListRow
              icon="map-outline"
              iconTone="neutral"
              title="Display"
              subtitle={formatGpsDisplay(survey.gps)}
              showChevron={false}
            />
            <RowDivider />
            {survey.gps.isMockLocation ? (
              <>
                <RowDivider />
                <ListRow
                  icon="warning-outline"
                  iconTone="danger"
                  title="Location source"
                  subtitle="Mock / simulated GPS detected"
                  showChevron={false}
                />
              </>
            ) : null}
            <View className="px-4 pb-4">
              <GpsDebugPanel gps={survey.gps} />
            </View>
          </>
        ) : (
          <View className="p-4 items-center">
            <Text className="text-helper text-ink-tertiary-light">No GPS captured</Text>
          </View>
        )}
      </AppCard>
    </>
  );
}

export function SurveyPhotosCard({ survey, canRetake }: { survey: SurveyDetail; canRetake: boolean }) {
  return (
    <>
      <SectionLabel>Photos ({survey.photos.length})</SectionLabel>
      <AppCard padded className="mb-3">
        {survey.photos.length === 0 ? (
          <Text className="text-helper text-ink-tertiary-light text-center py-2">
            No photos yet. Front and side view photos are required to submit.
          </Text>
        ) : (
          <SurveyPhotoGrid
            canRetake={canRetake}
            photos={survey.photos.map((p) => ({
              _id: p._id,
              slot: p.slot,
              url: p.url ?? null,
            }))}
          />
        )}
      </AppCard>
    </>
  );
}

export function SurveyQcSection({
  survey,
  surveyId,
  onOpenConversation,
}: {
  survey: SurveyDetail;
  surveyId: Id<'surveys'>;
  onOpenConversation: () => void;
}) {
  return (
    <>
      <SectionLabel>QC remarks ({survey.qcRemarks.length})</SectionLabel>
      <AppCard padded className="mb-4">
        {survey.qcRemarks.length === 0 ? (
          <Text className="text-helper text-ink-tertiary-light text-center py-2">No remarks yet</Text>
        ) : (
          survey.qcRemarks.slice(0, 3).map((r) => (
            <View key={r._id} className="mb-3 last:mb-0">
              <View className="flex-row items-center gap-1.5">
                <Tag label={r.authorRole} tone={r.authorRole === 'surveyor' ? 'neutral' : 'brand'} />
                <Text className="text-caption text-ink-tertiary-light">{timeAgo(r._creationTime)}</Text>
              </View>
              <Text className="text-body text-ink-primary-light dark:text-ink-primary-dark mt-1" numberOfLines={3}>
                {r.message}
              </Text>
            </View>
          ))
        )}
        <AppButton
          label={survey.qcRemarks.length > 0 ? 'Open conversation' : 'Start a conversation'}
          variant="outline"
          size="sm"
          iconLeft="chatbubble-ellipses-outline"
          onPress={onOpenConversation}
          className="mt-2"
          fullWidth
        />
      </AppCard>
    </>
  );
}

export function SurveyDetailActions({
  canContinueWizard,
  canSubmit,
  canReview,
  busy,
  submitHint,
  onContinueWizard,
  onSubmit,
  onDecide,
}: {
  canContinueWizard: boolean;
  canSubmit: boolean;
  canReview: boolean;
  busy: boolean;
  submitHint?: string;
  onContinueWizard: () => void;
  onSubmit: () => void;
  onDecide: (decision: 'approve' | 'reject') => void;
}) {
  return (
    <>
      {canContinueWizard ? (
        <AppButton
          label="Continue in wizard"
          variant="outline"
          iconLeft="create-outline"
          size="lg"
          fullWidth
          className="mb-2"
          onPress={onContinueWizard}
        />
      ) : null}
      {canSubmit ? (
        <AppButton
          label={busy ? 'Submitting…' : 'Submit for review'}
          loading={busy}
          onPress={onSubmit}
          iconLeft="cloud-upload-outline"
          size="lg"
          fullWidth
          className="mb-2"
        />
      ) : submitHint ? (
        <AppButton
          label="Submit for review"
          disabled
          iconLeft="cloud-upload-outline"
          size="lg"
          fullWidth
          className="mb-2"
        />
      ) : null}
      {submitHint && !canSubmit ? (
        <Text className="text-caption text-ink-tertiary-light text-center mb-3">Complete: {submitHint}</Text>
      ) : null}
      {canReview ? (
        <View className="flex-row gap-2">
          <AppButton
            label="Reject"
            variant="outline"
            size="lg"
            iconLeft="close-outline"
            onPress={() => onDecide('reject')}
            loading={busy}
            className="flex-1"
          />
          <AppButton
            label="Approve"
            size="lg"
            iconLeft="checkmark-outline"
            onPress={() => onDecide('approve')}
            loading={busy}
            className="flex-1"
          />
        </View>
      ) : null}
    </>
  );
}
