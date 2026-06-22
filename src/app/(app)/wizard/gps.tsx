'use no memo';

/**
 * Step 7 — GPS capture. Government survey standard: ≤ ±1 m pinpoint fix required.
 */
import { AppButton, AppCard, Banner, GPSStatus, SectionLabel, Spinner, Tag } from '@/components';
import { GpsDebugPanel, GpsMapPreview } from '@/components/gis';
import { WizardStepFrame } from '@/components/wizard';
import {
  GPS_ACCEPT_MAX_ACCURACY_METERS,
  GPS_RETAKE_SAMPLE_DURATION_MS,
  GPS_SAMPLE_DURATION_MS,
  GPS_TARGET_ACCURACY_METERS,
  GPS_WARMUP_GATE_MS,
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
  startGnssWarmup,
  stopGnssWarmup,
  type GpsCaptureProgress,
} from '@/utils/captureGps';
import { formatGpsDisplay, formatGpsFull } from '@/utils/formatGps';
import { formatGpsBuildFingerprintLine } from '@/utils/gpsBuildInfo';
import { formatGpsAccuracyErrorDetail, locationErrorMessage } from '@/utils/gpsLocationErrors';
import { getGpsCapturePolicy } from '@/utils/gpsPolicy';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Text, View } from 'react-native';

type State = 'idle' | 'locating' | 'captured' | 'error';

type GpsCoordinateView = Pick<
  NonNullable<WizardDraft['gps']>,
  'latitude' | 'longitude' | 'accuracyMeters' | 'capturedAt'
>;

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

type GpsCaptureUiState = {
  state: State;
  error: string | null;
  sampling: GpsCaptureProgress | null;
  lastAttemptMeters: number | null;
  lastAttemptPinpointCount: number | null;
  lastAttemptCoordinate: GpsCoordinateView | null;
};

type GpsCaptureAction =
  | { type: 'start_capture' }
  | { type: 'capture_progress'; sampling: GpsCaptureProgress }
  | { type: 'capture_success' }
  | {
      type: 'capture_error';
      error: string;
      lastAttemptMeters: number | null;
      lastAttemptPinpointCount: number | null;
      lastAttemptCoordinate: GpsCoordinateView | null;
    }
  | { type: 'capture_finally' };

const initialGpsCaptureUiState: GpsCaptureUiState = {
  state: 'idle',
  error: null,
  sampling: null,
  lastAttemptMeters: null,
  lastAttemptPinpointCount: null,
  lastAttemptCoordinate: null,
};

function gpsCaptureReducer(state: GpsCaptureUiState, action: GpsCaptureAction): GpsCaptureUiState {
  switch (action.type) {
    case 'start_capture':
      return {
        ...state,
        state: 'locating',
        error: null,
        sampling: null,
        lastAttemptMeters: null,
        lastAttemptPinpointCount: null,
        lastAttemptCoordinate: null,
      };
    case 'capture_progress':
      return { ...state, sampling: action.sampling };
    case 'capture_success':
      return { ...state, state: 'captured' };
    case 'capture_error':
      return {
        ...state,
        state: 'error',
        error: action.error,
        lastAttemptMeters: action.lastAttemptMeters,
        lastAttemptPinpointCount: action.lastAttemptPinpointCount,
        lastAttemptCoordinate: action.lastAttemptCoordinate,
      };
    case 'capture_finally':
      return { ...state, sampling: null };
    default:
      return state;
  }
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
  const buildFingerprint = useMemo(() => formatGpsBuildFingerprintLine(), []);
  const [captureUi, dispatch] = useReducer(gpsCaptureReducer, initialGpsCaptureUiState);
  const { state, error, sampling, lastAttemptMeters, lastAttemptPinpointCount, lastAttemptCoordinate } = captureUi;
  const captureInFlight = useRef(false);
  const progressRef = useRef<GpsCaptureProgress | null>(null);
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmupDeadlineRef = useRef(Date.now() + GPS_WARMUP_GATE_MS);
  const [captureAllowed, setCaptureAllowed] = useState(false);
  const [warmupSecondsLeft, setWarmupSecondsLeft] = useState(Math.ceil(GPS_WARMUP_GATE_MS / 1000));

  const scheduleWarmupGate = useCallback(() => {
    if (warmupTimerRef.current) clearTimeout(warmupTimerRef.current);
    warmupDeadlineRef.current = Date.now() + GPS_WARMUP_GATE_MS;
    setCaptureAllowed(false);
    setWarmupSecondsLeft(Math.ceil(GPS_WARMUP_GATE_MS / 1000));
    warmupTimerRef.current = setTimeout(() => {
      setCaptureAllowed(true);
      setWarmupSecondsLeft(0);
    }, GPS_WARMUP_GATE_MS);
  }, []);

  useEffect(() => {
    void startGnssWarmup();
    scheduleWarmupGate();
    const countdown = setInterval(() => {
      const leftMs = warmupDeadlineRef.current - Date.now();
      if (leftMs <= 0) {
        setWarmupSecondsLeft(0);
        return;
      }
      setWarmupSecondsLeft(Math.ceil(leftMs / 1000));
    }, 500);
    return () => {
      clearInterval(countdown);
      if (warmupTimerRef.current) clearTimeout(warmupTimerRef.current);
      stopGnssWarmup();
    };
  }, [scheduleWarmupGate]);

  const capture = async () => {
    if (captureInFlight.current || state === 'locating') return;
    const isRetake = Boolean(draft.gps);
    captureInFlight.current = true;
    stopGnssWarmup();
    progressRef.current = null;
    dispatch({ type: 'start_capture' });
    try {
      const gps = await captureGpsWithTargetAccuracy(
        (p) => {
          progressRef.current = p;
          dispatch({ type: 'capture_progress', sampling: p });
        },
        { retake: isRetake },
      );
      await update({ gps });
      dispatch({ type: 'capture_success' });
    } catch (e) {
      const lastProgress = progressRef.current as GpsCaptureProgress | null;
      const attemptCoord = coordinateFromSampling(lastProgress);
      const bestFromProgress = lastProgress?.bestAccuracyMeters ?? null;
      const attemptMeters = e instanceof GpsAccuracyError ? e.accuracyMeters : bestFromProgress;
      dispatch({
        type: 'capture_error',
        error: locationErrorMessage(e, isOnline, devPreview),
        lastAttemptMeters: attemptMeters,
        lastAttemptPinpointCount: lastProgress?.pinpointSampleCount ?? null,
        lastAttemptCoordinate: attemptCoord,
      });
    } finally {
      dispatch({ type: 'capture_finally' });
      captureInFlight.current = false;
      void startGnssWarmup();
      scheduleWarmupGate();
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
  const accuracyErrorDetail = formatGpsAccuracyErrorDetail(
    lastAttemptMeters,
    lastAttemptPinpointCount,
    policy.minSamplesAccept,
    policy.acceptMaxAccuracyMeters,
  );

  return (
    <>
      {ui === 'idle' && !gps ? (
        <Banner
          tone="info"
          title="Before you capture"
          message={
            captureAllowed
              ? 'GNSS is warm. Stand at the property boundary in open sky, enable Android High accuracy location, then tap Capture GPS and hold still.'
              : `GNSS warming up… wait ${warmupSecondsLeft} s before capture. Stand at the property boundary in open sky and enable Android High accuracy location.`
          }
          icon="sunny-outline"
          className="mb-3"
        />
      ) : null}

      {ui === 'idle' && !gps && !captureAllowed ? (
        <Text className="text-caption text-ink-tertiary-light text-center mb-3">
          GNSS warmup: {warmupSecondsLeft}s remaining
        </Text>
      ) : null}

      {ui === 'error' ? (
        <Banner
          tone="warning"
          title="Field tips"
          message="Move to the property boundary with a clear view of the sky. Disable mock location apps, turn off battery saver for this app, wait for GNSS warmup, then retake and hold still until sampling finishes."
          icon="footsteps-outline"
          className="mb-3"
        />
      ) : null}
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
            <View className="mt-2 items-center gap-1">
              <Text className="text-caption text-ink-primary-light dark:text-ink-primary-dark text-center">
                Pinpoint readings: {sampling.pinpointSampleCount}/{sampling.minSamplesAccept} at ≤ ±
                {policy.acceptMaxAccuracyMeters} m
                {sampling.bestAccuracyMeters != null
                  ? ` · best ±${Math.round(sampling.bestAccuracyMeters * 10) / 10} m`
                  : ''}
              </Text>
              <Text className="text-caption text-ink-tertiary-light text-center">
                {sampling.sampleCount} samples · {Math.round(sampling.elapsedMs / 1000)}s
              </Text>
            </View>
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
          message={[accuracyErrorDetail, error].filter(Boolean).join('\n\n')}
          icon="alert-circle-outline"
          className="mb-3"
        />
      ) : null}

      <AppButton
        label={state === 'locating' ? 'Sampling GPS…' : gps ? 'Retake location' : 'Capture GPS'}
        loading={state === 'locating'}
        disabled={state !== 'locating' && !captureAllowed}
        iconLeft={gps ? 'refresh' : 'locate'}
        size="lg"
        onPress={capture}
        fullWidth
      />

      <Banner
        tone="info"
        title={`Pinpoint required · ±${GPS_ACCEPT_MAX_ACCURACY_METERS} m max`}
        message={`Government survey standard. Stand at the property boundary in open sky and hold still. Good signal usually finishes in a few seconds; retakes use a shorter window (up to ${Math.round(GPS_RETAKE_SAMPLE_DURATION_MS / 1000)} s). First capture allows up to ${Math.round(GPS_SAMPLE_DURATION_MS / 1000)} s. Readings above ±${GPS_ACCEPT_MAX_ACCURACY_METERS} m are rejected.`}
        icon="information-circle-outline"
        className="mt-3"
      />

      <Text className="text-caption text-ink-tertiary-light text-center mt-2">{buildFingerprint}</Text>
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
