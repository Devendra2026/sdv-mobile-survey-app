'use no memo';

/**
 * Step 7 — GPS capture. Single-shot coordinate with strict submit validation
 * (mock block, freshness, positive accuracy).
 */
import { AppButton, AppCard, Banner, GPSStatus, SectionLabel, Spinner } from '@/components';
import { GpsMapPreview } from '@/components/gis';
import { WizardStepFrame } from '@/components/wizard';
import { useNetworkStatus } from '@/hooks/use-network-status';
import type { WizardDraft } from '@/hooks/useWizardDraft';
import {
  captureGps,
  checkLocationAvailability,
  getLocationUnavailableMessage,
  isGpsStepComplete,
  prepareLocationAccess,
  startLiveLocationWatch,
  stopLiveLocationWatch,
} from '@/utils/captureGps';
import { locationErrorMessage } from '@/utils/gpsLocationErrors';
import { isExpoGoDevPreview } from '@/utils/gpsPolicy';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { Text, View } from 'react-native';

type LocationUiState = 'checking' | 'available' | 'unavailable';

type GpsStepState = {
  locationState: LocationUiState;
  liveLatitude: number | null;
  liveLongitude: number | null;
  capturing: boolean;
  captureError: string | null;
};

type GpsStepAction = { type: 'patch'; patch: Partial<GpsStepState> };

const initialGpsStepState: GpsStepState = {
  locationState: 'checking',
  liveLatitude: null,
  liveLongitude: null,
  capturing: false,
  captureError: null,
};

function gpsStepReducer(state: GpsStepState, action: GpsStepAction): GpsStepState {
  if (action.type === 'patch') {
    return { ...state, ...action.patch };
  }
  return state;
}

function GpsStepContent({
  draft,
  update,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => Promise<void>;
}) {
  const { isOnline } = useNetworkStatus();
  const [state, dispatch] = useReducer(gpsStepReducer, initialGpsStepState);
  const { locationState, liveLatitude, liveLongitude, capturing, captureError } = state;

  const gps = draft.gps;
  const displayLatitude = gps?.latitude ?? liveLatitude;
  const displayLongitude = gps?.longitude ?? liveLongitude;
  const mapCoordinate = useMemo(() => {
    if (displayLatitude == null || displayLongitude == null) return null;
    return {
      latitude: displayLatitude,
      longitude: displayLongitude,
      accuracyMeters: gps?.accuracyMeters ?? 1,
      capturedAt: gps?.capturedAt ?? 0,
    };
  }, [displayLatitude, displayLongitude, gps?.accuracyMeters, gps?.capturedAt]);

  const refreshAvailability = useCallback(async () => {
    dispatch({ type: 'patch', patch: { locationState: 'checking', captureError: null } });
    const available = await prepareLocationAccess();
    if (!available) {
      const message = await getLocationUnavailableMessage(isOnline);
      dispatch({ type: 'patch', patch: { locationState: 'unavailable', captureError: message } });
      return false;
    }
    dispatch({ type: 'patch', patch: { locationState: 'available', captureError: null } });
    return true;
  }, [isOnline]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const available = await refreshAvailability();
      if (cancelled || !available) return;

      await startLiveLocationWatch((lat, lng) => {
        if (!cancelled) {
          dispatch({ type: 'patch', patch: { liveLatitude: lat, liveLongitude: lng } });
        }
      });
    })();

    return () => {
      cancelled = true;
      stopLiveLocationWatch();
    };
  }, [refreshAvailability]);

  const capture = async () => {
    if (capturing) return;
    dispatch({ type: 'patch', patch: { capturing: true, captureError: null } });

    try {
      const captured = await captureGps();
      await update({ gps: captured });
      dispatch({
        type: 'patch',
        patch: {
          liveLatitude: captured.latitude,
          liveLongitude: captured.longitude,
          locationState: 'available',
        },
      });
    } catch (e) {
      const available = await checkLocationAvailability();
      dispatch({
        type: 'patch',
        patch: {
          captureError: locationErrorMessage(e, isOnline),
          locationState: available ? 'available' : 'unavailable',
        },
      });
    } finally {
      dispatch({ type: 'patch', patch: { capturing: false } });
    }
  };

  const gpsStatusState = capturing ? 'locating' : gps ? 'captured' : locationState === 'unavailable' ? 'error' : 'idle';

  const captureEnabled = !capturing;

  return (
    <>
      {locationState === 'checking' ? (
        <Banner
          tone="info"
          title="Requesting location access"
          message="Allow location when prompted to show the map and capture coordinates."
          icon="location-outline"
          className="mb-3"
        />
      ) : null}

      {locationState === 'unavailable' || captureError ? (
        <Banner
          tone="warning"
          title="Location unavailable"
          message={captureError ?? 'Unable to get location. Please enable Location Services.'}
          icon="location-outline"
          className="mb-3"
        />
      ) : null}

      {gps?.isMockLocation ? (
        <Banner
          tone="danger"
          title="Mock location detected"
          message="The captured coordinates appear to come from a fake-GPS source. Retake using a real device location."
          icon="warning-outline"
          className="mb-3"
        />
      ) : null}

      <Banner
        tone="info"
        title="Fresh GPS required"
        message="GPS must be captured within 15 minutes of submission. Recapture here if you pause before submitting."
        icon="time-outline"
        className="mb-3"
      />

      {isExpoGoDevPreview() && gps ? (
        <Banner
          tone="info"
          title="Expo Go capture"
          message="Coordinates will submit normally. This capture is tagged for audit — use a fleet APK for field validation."
          icon="information-circle-outline"
          className="mb-3"
        />
      ) : null}

      <SectionLabel>Map</SectionLabel>
      {mapCoordinate ? (
        <AppCard padded className="mb-3">
          <GpsMapPreview coordinate={mapCoordinate} />
          {!gps ? (
            <Text className="text-caption text-ink-tertiary-light text-center mt-2">
              Live preview — tap Capture Coordinate to save this location.
            </Text>
          ) : null}
        </AppCard>
      ) : (
        <AppCard padded className="mb-3">
          <Text className="text-helper text-ink-tertiary-light text-center py-6">
            {locationState === 'checking'
              ? 'Waiting for location…'
              : 'Move to the property to preview coordinates on the map.'}
          </Text>
        </AppCard>
      )}

      <SectionLabel>Current capture</SectionLabel>
      <AppCard padded className="mb-3">
        <View className="gap-3">
          <View>
            <Text className="text-caption text-ink-tertiary-light">Current Latitude</Text>
            <Text className="text-body font-mono text-ink-primary-light dark:text-ink-primary-dark mt-1">
              {displayLatitude != null ? displayLatitude.toFixed(6) : '—'}
            </Text>
          </View>
          <View>
            <Text className="text-caption text-ink-tertiary-light">Current Longitude</Text>
            <Text className="text-body font-mono text-ink-primary-light dark:text-ink-primary-dark mt-1">
              {displayLongitude != null ? displayLongitude.toFixed(6) : '—'}
            </Text>
          </View>
          <View>
            <Text className="text-caption text-ink-tertiary-light">Location Status</Text>
            <View className="mt-2">
              <GPSStatus state={gpsStatusState} locationAvailable={locationState === 'available'} />
            </View>
          </View>
        </View>
      </AppCard>

      <AppButton
        label={capturing ? 'Capturing…' : gps ? 'Retake' : 'Capture Coordinate'}
        loading={capturing}
        disabled={!captureEnabled}
        iconLeft={gps ? 'refresh' : 'locate'}
        size="lg"
        onPress={capture}
        fullWidth
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
