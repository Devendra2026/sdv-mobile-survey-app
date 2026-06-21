import { Banner } from '@/components';
import type { GpsCaptureInput } from '@/convex/lib/gpsValidation';
import { formatGpsDisplay } from '@/utils/formatGps';
import { isExpoGo } from '@/utils/gpsPolicy';
import Constants from 'expo-constants';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

const REGION_DELTA = 0.0005;

type MapsExtra = {
  googleMapsApiKey?: string;
  googleMapsAndroidKey?: string;
  googleMapsIosKey?: string;
};

function resolveGoogleMapsKey(platform: 'android' | 'ios' | 'web'): string | undefined {
  const extra = Constants.expoConfig?.extra as MapsExtra | undefined;
  if (platform === 'android') {
    return (
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ??
      extra?.googleMapsAndroidKey ??
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
      extra?.googleMapsApiKey
    );
  }
  if (platform === 'ios') {
    return (
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ??
      extra?.googleMapsIosKey ??
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
      extra?.googleMapsApiKey
    );
  }
  return process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? extra?.googleMapsApiKey;
}

function canRenderNativeMap(): boolean {
  if (isExpoGo()) return true;
  const androidMapsKey = resolveGoogleMapsKey('android');
  const iosMapsKey = resolveGoogleMapsKey('ios');
  return Platform.OS === 'android' ? Boolean(androidMapsKey) : Boolean(iosMapsKey);
}

type GpsMapPreviewProps = {
  coordinate: Pick<GpsCaptureInput, 'latitude' | 'longitude' | 'accuracyMeters' | 'capturedAt'>;
  interactive?: boolean;
  height?: number;
};

function regionForCoordinate(coordinate: Pick<GpsCaptureInput, 'latitude' | 'longitude'>): Region {
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: REGION_DELTA,
    longitudeDelta: REGION_DELTA,
  };
}

function GpsMapPreviewInner({ coordinate, interactive = true, height = 220 }: GpsMapPreviewProps) {
  const mapRef = useRef<MapView>(null);
  const region = useMemo(() => regionForCoordinate(coordinate), [coordinate.latitude, coordinate.longitude]);
  const showMap = canRenderNativeMap();
  const useGoogleProvider = !isExpoGo() && Platform.OS === 'android';

  useEffect(() => {
    mapRef.current?.animateToRegion(region, 300);
  }, [region, coordinate.capturedAt]);

  const openExternal = () => {
    const url = `https://www.google.com/maps?q=${coordinate.latitude},${coordinate.longitude}`;
    void Linking.openURL(url);
  };

  if (!showMap) {
    return (
      <View style={{ gap: 8 }}>
        <Banner
          tone="info"
          icon="map-outline"
          title="Map preview unavailable"
          message="Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (or platform-specific keys) in .env.local, then restart Expo. Coordinates below match the saved pin."
        />
        <Text className="text-body font-mono text-ink-primary-light text-center">{formatGpsDisplay(coordinate)}</Text>
        <Text className="text-caption text-brand text-center" onPress={openExternal}>
          Open in Google Maps
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden' }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={useGoogleProvider ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        region={region}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        moveOnMarkerPress={false}
      >
        <Marker
          coordinate={{
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
          }}
          title="Survey GPS"
          description={`±${Math.round(coordinate.accuracyMeters)} m`}
        />
      </MapView>
    </View>
  );
}

export const GpsMapPreview = memo(GpsMapPreviewInner, (prev, next) => {
  return (
    prev.coordinate.latitude === next.coordinate.latitude &&
    prev.coordinate.longitude === next.coordinate.longitude &&
    prev.coordinate.capturedAt === next.coordinate.capturedAt &&
    prev.interactive === next.interactive &&
    prev.height === next.height
  );
});
