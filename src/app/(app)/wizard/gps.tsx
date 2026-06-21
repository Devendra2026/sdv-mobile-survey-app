'use no memo';

/**
 * Step 7 — GPS capture. Government survey standard: ≤ ±1 m pinpoint fix required.
 */
import { AppButton, AppCard, Banner, GPSStatus, SectionLabel, Spinner, Tag } from '@/components';
import { GpsDebugPanel, GpsMapPreview } from '@/components/gis';
import { WizardStepFrame } from '@/components/wizard';
import {
  GPS_ACCEPT_MAX_ACCURACY_METERS,
  GPS_SAMPLE_DURATION_MS,
  GPS_TARGET_ACCURACY_METERS,
} from '@/convex/gpsAccuracy';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useDebouncedCloudSave } from '@/hooks/useDebouncedCloudSave';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import {
  captureGpsWithTargetAccuracy,
  GpsAccuracyError,
  gpsAccuracyTagLabel,
  gpsAccuracyTagTone,
  isGpsStepComplete,
  type GpsCaptureProgress,
} from '@/utils/captureGps';
import { formatGpsDisplay, formatGpsFull } from '@/utils/formatGps';
import { getGpsCapturePolicy } from '@/utils/gpsPolicy';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

type State = 'idle' | 'locating' | 'captured' | 'error';

type GpsCoordinateView = Pick<
  NonNullable<WizardDraft['gps']>,
  'latitude' | 'longitude' | 'accuracyMeters' | 'capturedAt'
>;

function locationErrorMessage(e: unknown, isOnline: boolean, devPreview: boolean): string {
  if (e instanceof GpsAccuracyError) {
    const base = e.message;
    if (!devPreview) {
      return `${base} Move outdoors to the property boundary. Expo Go cannot guarantee ±1 m — use a fleet APK for production surveys.`;
    }
    return base;
  }
  if (e instanceof Error) {
    if (!isOnline && /network|offline|internet/i.test(e.message)) {
      return 'No network connection. GPS still works offline — ensure location services are enabled.';
    }
    if (/permission/i.test(e.message)) {
      return 'Location permission denied. Open Settings → Apps → Survey App → Permissions → Location → Allow.';
    }
    if (/location services/i.test(e.message)) {
      return 'Turn on device location (GPS) in system settings, then retry.';
    }
    if (/mock/i.test(e.message)) {
      return e.message;
    }
    if (/timed out/i.test(e.message)) {
      return `${e.message} Hold still in open sky and retry.`;
    }
    return e.message;
  }
  return 'Could not get location';
}

function coordinateFromSampling(sampling: GpsCaptureProgress | null): GpsCoordinateView | null {
  if (sampling?.bestLatitude == null || sampling.bestLongitude == null || sampling.bestAccuracyMeters == null) {
    return null;
  }
  return {
    latitude: sampling.bestLatitude,
    longitude: sampling.bestLongitude,
    accuracyMeters: sampling.bestAccuracyMeters,
    capturedAt: Date.now(),
  };
}

function currentCaptureCoordinate(
  gps: WizardDraft['gps'],
  ui: State,
  sampling: GpsCaptureProgress | null,
  lastAttempt: GpsCoordinateView | null,
): GpsCoordinateView | null {
  if (gps && (ui === 'captured' || ui === 'idle')) return gps;
  if (ui === 'locating') return coordinateFromSampling(sampling);
  if (ui === 'error' && lastAttempt) return lastAttempt;
  return null;
}

function GpsStepContent({
  draft,
  update,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
}) {
  useDebouncedCloudSave(draft);
  const { isOnline } = useNetworkStatus();
  const policy = useMemo(() => getGpsCapturePolicy(), []);
  const devPreview = policy.devPreview;
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sampling, setSampling] = useState<GpsCaptureProgress | null>(null);
  const [lastAttemptMeters, setLastAttemptMeters] = useState<number | null>(null);
  const [lastAttemptCoordinate, setLastAttemptCoordinate] = useState<GpsCoordinateView | null>(null);
  const captureInFlight = useRef(false);
  const progressRef = useRef<GpsCaptureProgress | null>(null);

  const capture = async () => {
    if (captureInFlight.current || state === 'locating') return;
    captureInFlight.current = true;
    setError(null);
    setLastAttemptMeters(null);
    setLastAttemptCoordinate(null);
    setSampling(null);
    progressRef.current = null;
    setState('locating');
    try {
      const gps = await captureGpsWithTargetAccuracy((p) => {
        progressRef.current = p;
        setSampling(p);
      });
      await update({ gps });
      setState('captured');
    } catch (e) {
      const lastProgress = progressRef.current as GpsCaptureProgress | null;
      const attemptCoord = coordinateFromSampling(lastProgress);
      if (attemptCoord) setLastAttemptCoordinate(attemptCoord);
      const bestFromProgress = lastProgress?.bestAccuracyMeters ?? null;
      const attemptMeters = e instanceof GpsAccuracyError ? e.accuracyMeters : bestFromProgress;
      if (attemptMeters != null) setLastAttemptMeters(attemptMeters);
      setError(locationErrorMessage(e, isOnline, devPreview));
      setState('error');
    } finally {
      setSampling(null);
      captureInFlight.current = false;
    }
  };

  const gps = draft.gps;
  const ui: State = state === 'idle' && gps ? 'captured' : state;
  const statusAccuracy =
    ui === 'locating'
      ? (sampling?.bestAccuracyMeters ?? undefined)
      : ui === 'error'
        ? (lastAttemptMeters ?? undefined)
        : gps?.accuracyMeters;
  const captureCoordinate = currentCaptureCoordinate(
    gps,
    ui,
    ui === 'locating' ? sampling : null,
    lastAttemptCoordinate,
  );
  const showMapDetails = ui === 'captured' && gps;

  return (
    <>
      {ui === 'locating' && sampling?.waitingForBetterSignal ? (
        <Banner
          tone="info"
          title="Waiting for better GPS signal…"
          message={`Target ±${GPS_TARGET_ACCURACY_METERS} m. Stand at the property boundary in open sky with a clear view of the sky.`}
          icon="locate-outline"
          className="mb-3"
        />
      ) : null}

      {ui === 'captured' && gps?.isMockLocation ? (
        <Banner
          tone="danger"
          title="Mock location detected"
          message="The captured coordinates appear to come from a fake-GPS source. Retake using a real device location."
          icon="warning-outline"
          className="mb-3"
        />
      ) : null}

      <SectionLabel>Map verification</SectionLabel>
      {captureCoordinate ? (
        <AppCard padded className="mb-3">
          <GpsMapPreview coordinate={captureCoordinate} />
          {showMapDetails ? (
            <>
              <Text className="text-caption font-mono text-ink-primary-light dark:text-ink-primary-dark mt-3 text-center">
                {formatGpsFull(gps)}
              </Text>
              <Text className="text-caption text-ink-tertiary-light text-center mt-1">{formatGpsDisplay(gps)}</Text>
              <GpsDebugPanel gps={gps} />
            </>
          ) : (
            <Text className="text-caption text-ink-tertiary-light text-center mt-2">
              Live preview — refining GPS fix…
            </Text>
          )}
        </AppCard>
      ) : (
        <AppCard padded className="mb-3">
          <Text className="text-helper text-ink-tertiary-light text-center py-6">
            Capture GPS to preview the pin on the map.
          </Text>
        </AppCard>
      )}

      <SectionLabel>Current capture</SectionLabel>
      <AppCard padded className="mb-3">
        <View className="items-center py-3">
          <View
            className={[
              'w-20 h-20 rounded-full items-center justify-center',
              ui === 'captured' ? 'bg-success-soft' : ui === 'error' ? 'bg-danger-soft' : 'bg-brand-soft',
            ].join(' ')}
          >
            <Ionicons
              name={
                ui === 'captured'
                  ? 'checkmark-done'
                  : ui === 'locating'
                    ? 'compass'
                    : ui === 'error'
                      ? 'alert'
                      : 'location'
              }
              size={36}
              color={ui === 'captured' ? '#16A34A' : ui === 'error' ? '#DC2626' : '#003B8E'}
            />
          </View>
          <View className="mt-3">
            <GPSStatus state={ui} accuracy={statusAccuracy} acceptMaxMeters={policy.acceptMaxAccuracyMeters} />
          </View>
          {captureCoordinate ? (
            <View className="mt-3 items-center gap-1">
              <Text className="text-caption font-mono text-ink-primary-light dark:text-ink-primary-dark text-center">
                {formatGpsFull(captureCoordinate)}
              </Text>
              <Text className="text-caption text-ink-tertiary-light text-center">
                {formatGpsDisplay(captureCoordinate)}
              </Text>
            </View>
          ) : null}
          {ui === 'locating' && sampling ? (
            <Text className="text-caption text-ink-tertiary-light text-center mt-2">
              {sampling.sampleCount} samples · {Math.round(sampling.elapsedMs / 1000)}s
            </Text>
          ) : null}
          {gps && ui === 'captured' ? (
            <View className="mt-3 items-center">
              <View className="flex-row gap-1.5 mt-2">
                <Tag
                  label={gpsAccuracyTagLabel(gps.accuracyMeters)}
                  tone={gpsAccuracyTagTone(gps.accuracyMeters)}
                  icon="locate-outline"
                />
              </View>
            </View>
          ) : null}
        </View>
      </AppCard>

      {error ? (
        <Banner
          tone="danger"
          title={lastAttemptMeters != null ? 'Accuracy not met' : 'Capture failed'}
          message={error}
          icon="alert-circle-outline"
          className="mb-3"
        />
      ) : null}

      <AppButton
        label={state === 'locating' ? 'Sampling GPS…' : gps ? 'Retake location' : 'Capture GPS'}
        loading={state === 'locating'}
        iconLeft={gps ? 'refresh' : 'locate'}
        size="lg"
        onPress={capture}
        fullWidth
      />

      <Banner
        tone="info"
        title={`Pinpoint required · ±${GPS_ACCEPT_MAX_ACCURACY_METERS} m max`}
        message={`Government survey standard. Stand at the property boundary in open sky — hold still. Sampling takes up to ${Math.round(GPS_SAMPLE_DURATION_MS / 1000)} s plus one retry. Readings above ±${GPS_ACCEPT_MAX_ACCURACY_METERS} m are rejected.`}
        icon="information-circle-outline"
        className="mt-3"
      />
    </>
  );
}

function StepGPS() {
  const { localId } = useLocalSearchParams<{ localId: string }>();

  if (!localId) {
    return <Spinner label="Loading…" />;
  }

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="gps"
      title="GPS location"
      subtitle="Stand outside the property"
      nextDisabled={(d) => !isGpsStepComplete(d.gps)}
    >
      {({ draft, update }) => <GpsStepContent draft={draft} update={update} />}
    </WizardStepFrame>
  );
}

export default StepGPS;
