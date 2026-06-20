import { Image } from 'expo-image';
import { useEffect } from 'react';
import { View, type ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Trimmed SDV Edutech mark — regenerate via `node scripts/generate-logo-assets.mjs` */
const LOGO_SOURCE = require('../../assets/images/logo-display.png');

const LOGO_ASPECT = 2.1;

export type BrandLogoProps = {
  /** Render width in dp; height follows logo aspect ratio. */
  width?: number;
  /** Gentle opacity pulse for splash / loading states. */
  animated?: boolean;
  /** Extra white card + shadow (usually unnecessary — logo PNG already has a white field). */
  framed?: boolean;
  className?: string;
} & Pick<ViewProps, 'accessibilityLabel'>;

function BrandLogoImage({ width, accessibilityLabel }: { width: number; accessibilityLabel: string }) {
  return (
    <Image
      source={LOGO_SOURCE}
      style={{ width, height: width / LOGO_ASPECT }}
      contentFit="contain"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

function BrandLogoPulse({ width, accessibilityLabel }: { width: number; accessibilityLabel: string }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.72, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
  }, [opacity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={pulseStyle}>
      <BrandLogoImage width={width} accessibilityLabel={accessibilityLabel} />
    </Animated.View>
  );
}

export function BrandLogo({
  width = 200,
  animated = false,
  framed = false,
  className,
  accessibilityLabel = 'SDV Edutech',
}: BrandLogoProps) {
  const content = animated ? (
    <BrandLogoPulse width={width} accessibilityLabel={accessibilityLabel} />
  ) : (
    <BrandLogoImage width={width} accessibilityLabel={accessibilityLabel} />
  );

  if (!framed) {
    return <View className={className}>{content}</View>;
  }

  return (
    <View
      className={`items-center justify-center rounded-2xl bg-white px-4 py-3 shadow-sm ${className ?? ''}`}
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
    >
      {content}
    </View>
  );
}
