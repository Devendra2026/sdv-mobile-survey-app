import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface SkeletonProps {
  className?: string;
  height?: number;
}

function Skeleton({ className = 'rounded-md bg-line-subtle', height }: SkeletonProps) {
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.45, { duration: 700 })),
      -1,
      false,
    );
  }, [opacity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View className={className} style={[height != null ? { height } : undefined, pulseStyle]} />;
}

function SurveyCardSkeleton() {
  return (
    <View className="rounded-xl border border-line-subtle bg-surface-light dark:bg-surface-dark p-4 mb-2">
      <View className="flex-row items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <View className="flex-1 gap-2">
          <Skeleton className="h-4 w-3/4 rounded" height={16} />
          <Skeleton className="h-3 w-1/2 rounded" height={12} />
        </View>
      </View>
      <Skeleton className="h-3 w-full rounded mt-3" height={12} />
    </View>
  );
}

export function DashboardSkeleton() {
  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <Skeleton className="flex-1 h-20 rounded-xl" height={80} />
        <Skeleton className="flex-1 h-20 rounded-xl" height={80} />
      </View>
      <Skeleton className="h-32 rounded-xl" height={128} />
      <Skeleton className="h-24 rounded-xl" height={96} />
    </View>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <SurveyCardSkeleton key={`skeleton-${i}`} />
      ))}
    </View>
  );
}
