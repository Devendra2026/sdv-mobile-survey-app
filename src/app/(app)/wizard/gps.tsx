'use no memo';

/**
 * Step 7 — GPS capture. Target ±2–3 m outdoors; accepts up to ±20 m on phones.
 */
import { AppButton, AppCard, Banner, GPSStatus, SectionLabel, Spinner, Tag } from '@/components';
import {
  GPS_EXCELLENT_ACCURACY_METERS,
  GPS_SAMPLE_DURATION_MS,
  GPS_TARGET_ACCURACY_METERS,
} from '@/convex/gpsAccuracy';
import { stepCompletion } from '@/hooks/useWizardDraft';
import { WizardStepFrame } from '@/hooks/WizardStepFrame';
import {
  captureGpsWithTargetAccuracy,
  GpsAccuracyError,
  gpsAccuracyTagLabel,
  gpsAccuracyTagTone,
  type GpsCaptureProgress,
} from '@/utils/captureGps';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

type State = 'idle' | 'locating' | 'captured' | 'error';

function StepGPS() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sampling, setSampling] = useState<GpsCaptureProgress | null>(null);
  const [lastAttemptMeters, setLastAttemptMeters] = useState<number | null>(null);

  if (!localId) {
    return <Spinner label="Loading…" />;
  }

  return (
    <WizardStepFrame
      localId={localId}
      activeKey="gps"
      title="GPS location"
      subtitle="Stand outside the property"
      nextDisabled={(d) => !stepCompletion(d).gps}
    >
      {({ draft, update }) => {
        const capture = async () => {
          if (state === 'locating') return;
          setError(null);
          setLastAttemptMeters(null);
          setSampling(null);
          setState('locating');
          try {
            const gps = await captureGpsWithTargetAccuracy((p) => setSampling(p));
            await update({ gps });
            setState('captured');
          } catch (e) {
            if (e instanceof GpsAccuracyError) setLastAttemptMeters(e.accuracyMeters);
            setError(e instanceof Error ? e.message : 'Could not get location');
            setState('error');
          } finally {
            setSampling(null);
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

        return (
          <>
            {ui === 'captured' && gps?.isMockLocation ? (
              <Banner
                tone="danger"
                title="Mock location detected"
                message="The captured coordinates appear to come from a fake-GPS source. Retake using a real device location."
                icon="warning-outline"
                className="mb-3"
              />
            ) : null}

            {ui === 'captured' && gps && gps.accuracyMeters > GPS_TARGET_ACCURACY_METERS ? (
              <Banner
                tone="warning"
                title="Captured with reduced accuracy"
                message={`Reading is ±${Math.round(gps.accuracyMeters)} m. For best results, retake in open sky (target ±${GPS_TARGET_ACCURACY_METERS} m).`}
                icon="locate-outline"
                className="mb-3"
              />
            ) : null}

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
                  <GPSStatus state={ui} accuracy={statusAccuracy} />
                </View>
                {ui === 'locating' && sampling ? (
                  <Text className="text-caption text-ink-tertiary-light text-center mt-2">
                    {sampling.sampleCount} samples · {Math.round(sampling.elapsedMs / 1000)}s
                  </Text>
                ) : null}
                {gps && ui === 'captured' ? (
                  <View className="mt-3 items-center">
                    <Text className="text-body font-mono text-ink-primary-light dark:text-ink-primary-dark">
                      {gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}
                    </Text>
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
              title="±2–3 m target"
              message={`Stand outside with a clear sky view. Capture usually finishes in a few seconds (up to ${Math.round(GPS_SAMPLE_DURATION_MS / 1000)} s). Target ±${GPS_TARGET_ACCURACY_METERS} m (±${GPS_EXCELLENT_ACCURACY_METERS} m is excellent). Readings up to ±20 m are accepted when the signal is weak.`}
              icon="information-circle-outline"
              className="mt-3"
            />
          </>
        );
      }}
    </WizardStepFrame>
  );
}

export default StepGPS;
