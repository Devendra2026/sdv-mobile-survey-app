import { AppCard, SectionLabel } from '@/components';
import type { GpsCaptureInput } from '@/convex/lib/gpsValidation';
import { formatGpsDisplay, formatGpsFull } from '@/utils/formatGps';
import { isExpoGo } from '@/utils/gpsPolicy';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

type GpsDebugPanelProps = {
  gps: GpsCaptureInput;
  label?: string;
};

/** Dev-client GIS audit panel — hidden in Expo Go and release builds. */
export function GpsDebugPanel({ gps, label = 'GIS debug' }: GpsDebugPanelProps) {
  const [open, setOpen] = useState(false);

  if (!__DEV__ || isExpoGo()) return null;

  return (
    <View className="mt-3">
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button">
        <View className="flex-row items-center gap-2 px-1">
          <Ionicons name="bug-outline" size={16} color="#64748B" />
          <Text className="text-caption text-ink-tertiary-light">{label} (dev)</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color="#64748B" />
        </View>
      </Pressable>
      {open ? (
        <AppCard padded className="mt-2 bg-page-light">
          <SectionLabel>Submission coordinate</SectionLabel>
          <Text className="text-caption font-mono text-ink-primary-light">{formatGpsFull(gps)}</Text>
          <Text className="text-caption text-ink-tertiary-light mt-1">Display: {formatGpsDisplay(gps)}</Text>
          <View className="mt-3 gap-1">
            <Text className="text-caption text-ink-secondary-light">Accuracy: ±{gps.accuracyMeters} m</Text>
            <Text className="text-caption text-ink-secondary-light">
              Timestamp: {new Date(gps.capturedAt).toISOString()}
            </Text>
            <Text className="text-caption text-ink-secondary-light">Provider: {gps.provider ?? 'device'}</Text>
            <Text className="text-caption text-ink-secondary-light">Mock: {gps.isMockLocation ? 'yes' : 'no'}</Text>
          </View>
        </AppCard>
      ) : null}
    </View>
  );
}
