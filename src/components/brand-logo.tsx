import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, View, type ViewProps } from 'react-native';

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

export function BrandLogo({
  width = 200,
  animated = false,
  framed = false,
  className,
  accessibilityLabel = 'SDV Edutech',
}: BrandLogoProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.72, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, pulse]);

  const image = (
    <Image
      source={LOGO_SOURCE}
      style={{ width, height: width / LOGO_ASPECT }}
      contentFit="contain"
      accessibilityLabel={accessibilityLabel}
    />
  );

  const content = animated ? <Animated.View style={{ opacity: pulse }}>{image}</Animated.View> : image;

  if (!framed) {
    return <View className={className}>{content}</View>;
  }

  return (
    <View
      className={`items-center justify-center rounded-2xl bg-white px-4 py-3 shadow-sm ${className ?? ''}`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      {content}
    </View>
  );
}
