import { Banner } from '@/components';
import { canRenderNativeMap, mapsPreviewUnavailableMessage } from '@/config/mapsEnv';
import type { GpsCaptureInput } from '@/convex/lib/gpsValidation';
import { formatGpsDisplay } from '@/utils/formatGps';
import { isExpoGo } from '@/utils/gpsPolicy';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

const REGION_DELTA = 0.0005;

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
  const { latitude, longitude, capturedAt } = coordinate;
  const region = useMemo(() => regionForCoordinate({ latitude, longitude }), [latitude, longitude]);
  const showMap = canRenderNativeMap();
  const useGoogleProvider = !isExpoGo() && Platform.OS === 'android';

  useEffect(() => {
    mapRef.current?.animateToRegion(region, 300);
  }, [region, capturedAt]);

  const openExternal = () => {
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    void Linking.openURL(url);
  };

  if (!showMap) {
    return (
      <View style={{ gap: 8 }}>
        <Banner
          tone="info"
          icon="map-outline"
          title="Map preview unavailable"
          message={mapsPreviewUnavailableMessage()}
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
            latitude,
            longitude,
          }}
          title="Survey GPS"
          description={new Date(capturedAt).toLocaleString()}
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
