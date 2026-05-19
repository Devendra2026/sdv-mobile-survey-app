/**
 * UI primitives — all referenced components live here in one module.
 *
 * Bundled rather than scattered because every component is small and they
 * share styling tokens; one file keeps colour/spacing consistency easy
 * to audit. Components are pure (no hooks beyond local state) so they
 * can render anywhere in the tree.
 */
import { GPS_TARGET_ACCURACY_METERS } from '@/convex/gpsAccuracy';
import { formatSqmDisplay, parseAreaInput, sqftFromSqm, sqmFromSqft } from '@/utils/area';
import { formatSurveyParcelLabel } from '@/utils/format';
import { optionLabel } from '@/utils/services';
import { androidRipple, horizontalScrollProps } from '@/utils/ui-layout';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type IconName = keyof typeof Ionicons.glyphMap;
type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONE_BG: Record<Tone, string> = {
  neutral: 'bg-page-light dark:bg-page-dark',
  brand: 'bg-brand-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
  info: 'bg-info-soft',
};
const TONE_FG: Record<Tone, string> = {
  neutral: 'text-ink-secondary-light dark:text-ink-secondary-dark',
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};
const TONE_ICON_HEX: Record<Tone, string> = {
  neutral: '#6B7280',
  brand: '#003B8E',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  info: '#2563EB',
};

/* ═══════════════════════════════════════════════════════════════════════════
 * AppButton
 * ═══════════════════════════════════════════════════════════════════════════ */

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface AppButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  iconLeft?: IconName;
  iconRight?: IconName;
  className?: string;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  fullWidth,
  iconLeft,
  iconRight,
  className,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const baseHeights: Record<ButtonSize, string> = {
    sm: 'h-9 px-4',
    md: 'h-[44px] px-5',
    lg: 'h-[52px] px-6',
  };
  const variantClass: Record<ButtonVariant, string> = {
    primary: 'bg-brand active:bg-brand/90',
    outline: 'border border-line-default bg-transparent active:bg-page-light dark:active:bg-page-dark',
    ghost: 'bg-transparent active:bg-page-light dark:active:bg-page-dark',
    danger: 'bg-danger active:bg-danger/90',
  };
  const textColor: Record<ButtonVariant, string> = {
    primary: 'text-white',
    outline: 'text-ink-primary-light dark:text-ink-primary-dark',
    ghost: 'text-brand',
    danger: 'text-white',
  };
  const iconColor: Record<ButtonVariant, string> = {
    primary: '#FFFFFF',
    outline: '#0B1220',
    ghost: '#003B8E',
    danger: '#FFFFFF',
  };

  const ripple =
    variant === 'primary' || variant === 'danger'
      ? androidRipple('rgba(255,255,255,0.25)')
      : androidRipple('rgba(0, 59, 142, 0.12)');

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      android_ripple={isDisabled ? undefined : ripple}
      className={[
        'flex-row items-center justify-center rounded-md',
        baseHeights[size],
        variantClass[variant],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-50' : '',
        className ?? '',
      ].join(' ')}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor[variant]} />
      ) : (
        <>
          {iconLeft ? (
            <Ionicons name={iconLeft} size={18} color={iconColor[variant]} style={{ marginRight: 8 }} />
          ) : null}
          <Text className={`text-[14px] font-medium ${textColor[variant]}`}>{label}</Text>
          {iconRight ? (
            <Ionicons name={iconRight} size={18} color={iconColor[variant]} style={{ marginLeft: 8 }} />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * AppInput
 * ═══════════════════════════════════════════════════════════════════════════ */

interface AppInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  required?: boolean;
  helperText?: string;
  errorText?: string;
  iconLeft?: IconName;
  iconRight?: IconName;
  onPressRightIcon?: () => void;
  containerClassName?: string;
}

export function AppInput({
  label,
  required,
  helperText,
  errorText,
  iconLeft,
  iconRight,
  onPressRightIcon,
  containerClassName,
  ...rest
}: AppInputProps) {
  const [focused, setFocused] = useState(false);
  const border = errorText ? 'border-danger' : focused ? 'border-brand' : 'border-line-default';
  return (
    <View className={containerClassName}>
      {label ? (
        <Text className="text-label uppercase tracking-wider font-medium text-ink-secondary-light dark:text-ink-secondary-dark mb-1.5">
          {label} {required ? <Text className="text-danger">*</Text> : null}
        </Text>
      ) : null}
      <View
        className={`flex-row items-center rounded-md border bg-surface-light dark:bg-surface-dark ${border}`}
        style={{ minHeight: 48 }}
      >
        {iconLeft ? (
          <View className="pl-3 pr-1">
            <Ionicons name={iconLeft} size={18} color="#6B7280" />
          </View>
        ) : null}
        <TextInput
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor="#9AA3AF"
          style={{
            flex: 1,
            paddingHorizontal: iconLeft ? 6 : 12,
            paddingVertical: Platform.OS === 'ios' ? 12 : 10,
            fontSize: 15,
            color: '#0B1220',
            ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' as const } : {}),
          }}
        />
        {iconRight ? (
          <Pressable onPress={onPressRightIcon} hitSlop={6} className="pr-3 pl-1">
            <Ionicons name={iconRight} size={18} color="#6B7280" />
          </Pressable>
        ) : null}
      </View>
      {errorText ? (
        <Text className="text-helper text-danger mt-1">{errorText}</Text>
      ) : helperText ? (
        <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1">{helperText}</Text>
      ) : null}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * AppDropdown
 * ═══════════════════════════════════════════════════════════════════════════ */

interface DropdownOption {
  value: string;
  label: string;
}
interface AppDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Visible field label above the control (not shown inside the box). */
  label?: string;
  required?: boolean;
  placeholder?: string;
  /** Bottom-sheet title when there is no field `label`; ignored if `label` is set. */
  modalTitle?: string;
  disabled?: boolean;
}

export function AppDropdown({
  value,
  options = [],
  onChange,
  label,
  required,
  placeholder = 'Tap to choose',
  modalTitle,
  disabled,
}: AppDropdownProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const safeOptions = options ?? [];
  const selected = safeOptions.find((o) => o.value === value);
  const displayLabel = selected?.label ?? (value.trim() ? optionLabel(value, safeOptions) : undefined);
  const sheetTitle = modalTitle ?? label ?? placeholder ?? 'Select';
  const listMaxHeight = useMemo(() => Math.min(420, Math.max(220, safeOptions.length * 52)), [safeOptions.length]);
  const sheetBottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 12);

  return (
    <View>
      {label ? (
        <Text className="text-label uppercase tracking-wider font-medium text-ink-secondary-light dark:text-ink-secondary-dark mb-1.5">
          {label} {required ? <Text className="text-danger">*</Text> : null}
        </Text>
      ) : null}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        android_ripple={disabled ? undefined : androidRipple('rgba(0, 59, 142, 0.1)')}
        className={`flex-row items-center rounded-md border border-line-default bg-surface-light dark:bg-surface-dark px-3 ${disabled ? 'opacity-60' : ''}`}
        style={{ minHeight: 48 }}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}, ${displayLabel ?? 'not selected'}` : displayLabel}
      >
        <Text
          className={`flex-1 text-body leading-5 ${displayLabel ? 'text-ink-primary-light dark:text-ink-primary-dark' : 'text-ink-disabled-light'}`}
          numberOfLines={2}
        >
          {displayLabel ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#6B7280" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent={Platform.OS === 'android'}
      >
        <View className="flex-1 justify-end">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="bg-black/40"
          />
          <View
            className="bg-surface-light dark:bg-surface-dark rounded-t-3xl border-t border-line-subtle"
            style={{ maxHeight: '78%', paddingBottom: sheetBottomPad }}
          >
            <View className="items-center pt-2 pb-1">
              <View className="w-9 h-1 rounded-full bg-line-default" />
            </View>
            {sheetTitle ? (
              <Text className="text-h3 font-medium text-ink-primary-light dark:text-ink-primary-dark px-5 pb-2 pt-1">
                {sheetTitle}
              </Text>
            ) : (
              <View className="h-2" />
            )}
            <FlatList
              data={safeOptions}
              keyExtractor={(o) => o.value}
              style={{ maxHeight: listMaxHeight }}
              contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 4 }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              overScrollMode="always"
              initialNumToRender={14}
              maxToRenderPerBatch={20}
              windowSize={8}
              renderItem={({ item: o }) => {
                const active = o.value === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    android_ripple={androidRipple('rgba(0, 59, 142, 0.1)')}
                    className={`flex-row items-center justify-between rounded-md px-3 py-2.5 ${active ? 'bg-brand-soft' : ''}`}
                    style={{ minHeight: 48 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      className={`flex-1 pr-2 text-body leading-5 ${active ? 'text-brand font-medium' : 'text-ink-primary-light dark:text-ink-primary-dark'}`}
                    >
                      {o.label}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={18} color="#003B8E" /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * AppCard, SectionLabel, ListRow
 * ═══════════════════════════════════════════════════════════════════════════ */

interface AppCardProps extends ViewProps {
  padded?: boolean;
  className?: string;
}
export function AppCard({ children, padded = true, className, ...rest }: AppCardProps) {
  return (
    <View
      {...rest}
      className={[
        'bg-surface-light dark:bg-surface-dark rounded-xl border border-line-subtle',
        padded ? 'p-3.5' : '',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="text-label uppercase tracking-wider font-medium text-ink-secondary-light dark:text-ink-secondary-dark mb-2 mt-1">
      {children}
    </Text>
  );
}

interface ListRowProps {
  icon?: IconName;
  iconTone?: Tone;
  title: string;
  subtitle?: string;
  rightText?: string;
  showChevron?: boolean;
  onPress?: () => void;
}
export function ListRow({
  icon,
  iconTone = 'neutral',
  title,
  subtitle,
  rightText,
  showChevron = true,
  onPress,
}: ListRowProps) {
  const content = (
    <View className="flex-row items-center px-3.5 py-3">
      {icon ? (
        <View className={`w-9 h-9 rounded-full items-center justify-center ${TONE_BG[iconTone]}`}>
          <Ionicons name={icon} size={18} color={TONE_ICON_HEX[iconTone]} />
        </View>
      ) : null}
      <View className="flex-1 ml-3">
        <Text className="text-[13px] font-medium text-ink-primary-light dark:text-ink-primary-dark">{title}</Text>
        {subtitle ? (
          <Text className="text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mt-0.5" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightText ? (
        <Text className="text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mr-1">{rightText}</Text>
      ) : null}
      {showChevron && onPress ? <Ionicons name="chevron-forward" size={18} color="#9AA3AF" /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} className="active:bg-page-light dark:active:bg-page-dark">
      {content}
    </Pressable>
  ) : (
    content
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Tag, Banner, Avatar, PulseDot, Spinner, EmptyState, Toast, KpiCard, StatusBadge
 * ═══════════════════════════════════════════════════════════════════════════ */

interface TagProps {
  label: string;
  tone?: Tone;
  icon?: IconName;
}
export function Tag({ label, tone = 'neutral', icon }: TagProps) {
  return (
    <View className={`flex-row items-center px-2 py-1 rounded-full self-start ${TONE_BG[tone]}`}>
      {icon ? <Ionicons name={icon} size={12} color={TONE_ICON_HEX[tone]} style={{ marginRight: 4 }} /> : null}
      <Text className={`text-[11px] font-medium ${TONE_FG[tone]}`}>{label}</Text>
    </View>
  );
}

interface BannerProps {
  tone: Tone;
  title: string;
  message?: string;
  icon?: IconName;
  className?: string;
}
export function Banner({ tone, title, message, icon, className }: BannerProps) {
  return (
    <View className={`rounded-lg p-3 ${TONE_BG[tone]} ${className ?? ''}`}>
      <View className="flex-row items-start">
        {icon ? <Ionicons name={icon} size={18} color={TONE_ICON_HEX[tone]} style={{ marginRight: 8 }} /> : null}
        <View className="flex-1">
          <Text className={`text-[13px] font-medium ${TONE_FG[tone]}`}>{title}</Text>
          {message ? <Text className={`text-caption ${TONE_FG[tone]} opacity-90 mt-0.5`}>{message}</Text> : null}
        </View>
      </View>
    </View>
  );
}

interface AvatarProps {
  name: string;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  url?: string;
}
export function Avatar({ name, tone = 'brand', size = 'md', url }: AvatarProps) {
  const dims = { sm: 28, md: 36, lg: 48, xl: 64 }[size];
  const fs = { sm: 11, md: 13, lg: 16, xl: 22 }[size];
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View className={`rounded-full items-center justify-center ${TONE_BG[tone]}`} style={{ width: dims, height: dims }}>
      <Text className={`font-medium ${TONE_FG[tone]}`} style={{ fontSize: fs }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

export function PulseDot({ tone = 'success' }: { tone?: Tone }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  const color = TONE_ICON_HEX[tone];
  return (
    <View className="w-2 h-2 items-center justify-center">
      <Animated.View
        style={{
          position: 'absolute',
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          opacity: 0.4,
          transform: [{ scale }],
        }}
      />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center py-10">
      <ActivityIndicator size="large" color="#003B8E" />
      {label ? (
        <Text className="mt-3 text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark">{label}</Text>
      ) : null}
    </View>
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}
export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <View className="items-center justify-center py-12 px-6">
      <View className="w-16 h-16 rounded-full bg-brand-soft items-center justify-center mb-3">
        <Ionicons name={icon} size={28} color="#003B8E" />
      </View>
      <Text className="text-h3 font-medium text-ink-primary-light dark:text-ink-primary-dark text-center">{title}</Text>
      {message ? (
        <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1 text-center max-w-[280px]">
          {message}
        </Text>
      ) : null}
      {action ? (
        <View className="mt-4">
          <AppButton label={action.label} onPress={action.onPress} variant="outline" />
        </View>
      ) : null}
    </View>
  );
}

/** Auto-dismissing toast notification. Mount once near the screen root. */
interface ToastProps {
  visible: boolean;
  title: string;
  message?: string;
  tone?: Tone;
  onHide: () => void;
  duration?: number;
}
export function Toast({ visible, title, message, tone = 'success', onHide, duration = 2400 }: ToastProps) {
  const translateY = useRef(new Animated.Value(80)).current;
  useEffect(() => {
    if (!visible) return;
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    const t = setTimeout(() => {
      Animated.timing(translateY, { toValue: 80, duration: 200, useNativeDriver: true }).start(() => onHide());
    }, duration);
    return () => clearTimeout(t);
  }, [visible, translateY, duration, onHide]);
  if (!visible) return null;
  return (
    <Animated.View style={{ position: 'absolute', bottom: 28, left: 14, right: 14, transform: [{ translateY }] }}>
      <View className={`rounded-md p-3 flex-row items-start ${TONE_BG[tone]}`}>
        <Ionicons
          name={tone === 'success' ? 'checkmark-circle' : tone === 'danger' ? 'alert-circle' : 'information-circle'}
          size={18}
          color={TONE_ICON_HEX[tone]}
        />
        <View className="flex-1 ml-2">
          <Text className={`text-[13px] font-medium ${TONE_FG[tone]}`}>{title}</Text>
          {message ? <Text className={`text-caption mt-0.5 ${TONE_FG[tone]} opacity-90`}>{message}</Text> : null}
        </View>
      </View>
    </Animated.View>
  );
}

interface KpiCardProps {
  label: string;
  value: string | number;
  tone?: Tone;
  icon?: IconName;
  onPress?: () => void;
}
export function KpiCard({ label, value, tone = 'brand', icon, onPress }: KpiCardProps) {
  const C = onPress ? Pressable : View;
  return (
    <C onPress={onPress} className="flex-1">
      <View className="bg-surface-light dark:bg-surface-dark rounded-xl border border-line-subtle p-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-label uppercase tracking-wider font-medium text-ink-tertiary-light">{label}</Text>
          {icon ? (
            <View className={`w-7 h-7 rounded-full items-center justify-center ${TONE_BG[tone]}`}>
              <Ionicons name={icon} size={14} color={TONE_ICON_HEX[tone]} />
            </View>
          ) : null}
        </View>
        <Text className="text-h1 font-medium text-ink-primary-light dark:text-ink-primary-dark mt-1.5">{value}</Text>
      </View>
    </C>
  );
}

interface StatusBadgeProps {
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'pending';
}
export function StatusBadge({ status }: StatusBadgeProps) {
  const map: Record<StatusBadgeProps['status'], { tone: Tone; label: string; icon: IconName }> = {
    draft: { tone: 'neutral', label: 'Draft', icon: 'create-outline' },
    submitted: { tone: 'info', label: 'Submitted', icon: 'cloud-upload-outline' },
    approved: { tone: 'success', label: 'Approved', icon: 'checkmark-circle' },
    rejected: { tone: 'danger', label: 'Rejected', icon: 'close-circle' },
    pending: { tone: 'warning', label: 'Pending', icon: 'time-outline' },
  };
  const m = map[status];
  return <Tag label={m.label} tone={m.tone} icon={m.icon} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * RadioGroup
 * ═══════════════════════════════════════════════════════════════════════════ */

interface RadioItem<T extends string> {
  value: T;
  label: string;
  helper?: string;
}
interface RadioGroupProps<T extends string> {
  items: RadioItem<T>[];
  value: T;
  onChange: (v: T) => void;
}
export function RadioGroup<T extends string>({ items, value, onChange }: RadioGroupProps<T>) {
  return (
    <View>
      {items.map((it, idx) => {
        const active = it.value === value;
        return (
          <Pressable
            key={it.value}
            onPress={() => onChange(it.value)}
            className={`flex-row items-start p-3 rounded-md border ${active ? 'border-brand bg-brand-soft' : 'border-line-default bg-surface-light dark:bg-surface-dark'} ${idx > 0 ? 'mt-2' : ''}`}
          >
            <View
              className={`w-5 h-5 rounded-full border-2 items-center justify-center mt-0.5 ${active ? 'border-brand' : 'border-line-default'}`}
            >
              {active ? <View className="w-2.5 h-2.5 rounded-full bg-brand" /> : null}
            </View>
            <View className="flex-1 ml-3">
              <Text
                className={`text-[14px] font-medium ${active ? 'text-brand' : 'text-ink-primary-light dark:text-ink-primary-dark'}`}
              >
                {it.label}
              </Text>
              {it.helper ? (
                <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-0.5">
                  {it.helper}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SurveyCard — list item used on surveys list + dashboard
 * ═══════════════════════════════════════════════════════════════════════════ */

interface SurveyCardProps {
  parcelNo: string;
  unitNo: string;
  ownerName: string;
  wardNo: string;
  status: StatusBadgeProps['status'];
  qcStatus?: 'pending' | 'approved' | 'rejected';
  updatedAt: number;
  onPress: () => void;
}
export function SurveyCard({
  parcelNo,
  unitNo,
  ownerName,
  wardNo,
  status,
  qcStatus,
  updatedAt,
  onPress,
}: SurveyCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="p-3.5 bg-surface-light dark:bg-surface-dark rounded-xl border border-line-subtle active:opacity-90"
    >
      <View className="flex-row items-start">
        <View className="w-10 h-10 rounded-md bg-brand-soft items-center justify-center">
          <Ionicons name="home-outline" size={20} color="#003B8E" />
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-[13px] font-medium text-ink-primary-light dark:text-ink-primary-dark">
            {formatSurveyParcelLabel(parcelNo, unitNo)}
          </Text>
          <Text className="text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mt-0.5" numberOfLines={1}>
            {ownerName}
          </Text>
          <View className="flex-row gap-1.5 mt-2 items-center">
            <Tag label={`Ward ${wardNo}`} tone="neutral" icon="map-outline" />
            <StatusBadge status={status} />
            {qcStatus === 'rejected' ? <Tag label="QC: rejected" tone="danger" icon="alert" /> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#9AA3AF" />
      </View>
    </Pressable>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * StepIndicator — 8-step horizontal pill with completion state
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface StepIndicatorStep {
  key: string;
  label: string;
  short: string; // 1–2 char label for the dot
  completed: boolean;
}
interface StepIndicatorProps {
  steps: StepIndicatorStep[];
  activeKey: string;
  onSelect?: (key: string) => void;
}
export function StepIndicator({ steps, activeKey, onSelect }: StepIndicatorProps) {
  return (
    <ScrollView
      horizontal
      {...horizontalScrollProps}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 6 }}
    >
      {steps.map((s, i) => {
        const active = s.key === activeKey;
        const bg = active ? 'bg-brand' : s.completed ? 'bg-success' : 'bg-line-subtle';
        const fg = active || s.completed ? 'text-white' : 'text-ink-secondary-light';
        return (
          <Pressable
            key={s.key}
            onPress={() => onSelect?.(s.key)}
            disabled={!onSelect}
            className="flex-row items-center"
          >
            <View className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 ${bg}`}>
              {s.completed && !active ? (
                <Ionicons name="checkmark" size={11} color="#FFFFFF" />
              ) : (
                <Text className={`text-[10px] font-medium ${fg}`}>{i + 1}</Text>
              )}
              <Text className={`text-[11px] font-medium ${fg}`}>{s.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * WizardHeader — brand strip + step indicator
 * ═══════════════════════════════════════════════════════════════════════════ */

interface WizardHeaderProps {
  title: string;
  subtitle?: string;
  steps: StepIndicatorStep[];
  activeKey: string;
  onBack: () => void;
  onSelectStep?: (key: string) => void;
}
export function WizardHeader({ title, subtitle, steps, activeKey, onBack, onSelectStep }: WizardHeaderProps) {
  return (
    <View className="bg-brand">
      <View className="px-4 pt-2 pb-2.5 flex-row items-center">
        <Pressable onPress={onBack} hitSlop={8} className="w-9 h-9 items-center justify-center">
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>
        <View className="flex-1 ml-1">
          <Text className="text-helper text-white/70">New survey</Text>
          <Text className="text-h3 font-medium text-white">{title}</Text>
          {subtitle ? <Text className="text-caption text-white/75 mt-0.5">{subtitle}</Text> : null}
        </View>
      </View>
      <StepIndicator steps={steps} activeKey={activeKey} onSelect={onSelectStep} />
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * FloatingSaveBar — sticky bottom save & continue
 * ═══════════════════════════════════════════════════════════════════════════ */

interface FloatingSaveBarProps {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
}
export function FloatingSaveBar({
  onBack,
  onNext,
  nextLabel = 'Save & continue',
  nextDisabled,
  loading,
}: FloatingSaveBarProps) {
  return (
    <View className="border-t border-line-subtle bg-surface-light dark:bg-surface-dark px-3.5 pt-2.5 pb-5">
      <View className="flex-row gap-2">
        {onBack ? (
          <AppButton label="Back" variant="outline" iconLeft="chevron-back" onPress={onBack} className="flex-1" />
        ) : null}
        <AppButton
          label={nextLabel}
          onPress={onNext}
          iconRight="arrow-forward"
          disabled={nextDisabled}
          loading={loading}
          className={onBack ? 'flex-[1.5]' : 'flex-1'}
        />
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * NumberStepper — for floor counts, family size, etc.
 * ═══════════════════════════════════════════════════════════════════════════ */

interface NumberStepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}
export function NumberStepper({ value, onChange, min = 0, max = 99, step = 1, label }: NumberStepperProps) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <View>
      {label ? (
        <Text className="text-label uppercase tracking-wider font-medium text-ink-secondary-light dark:text-ink-secondary-dark mb-1.5">
          {label}
        </Text>
      ) : null}
      <View className="flex-row items-center bg-surface-light dark:bg-surface-dark rounded-md border border-line-default">
        <Pressable onPress={dec} disabled={value <= min} className="w-12 h-12 items-center justify-center">
          <Ionicons name="remove" size={20} color={value <= min ? '#9AA3AF' : '#003B8E'} />
        </Pressable>
        <View className="flex-1 items-center">
          <Text className="text-h2 font-medium text-ink-primary-light dark:text-ink-primary-dark">{value}</Text>
        </View>
        <Pressable onPress={inc} disabled={value >= max} className="w-12 h-12 items-center justify-center">
          <Ionicons name="add" size={20} color={value >= max ? '#9AA3AF' : '#003B8E'} />
        </Pressable>
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ChipSelector — single-select horizontal chips (alternative to dropdowns)
 * ═══════════════════════════════════════════════════════════════════════════ */

interface ChipSelectorProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  scroll?: boolean;
}
export function ChipSelector({ value, options, onChange, scroll = true }: ChipSelectorProps) {
  const content = options.map((o) => {
    const active = o.value === value;
    return (
      <Pressable
        key={o.value}
        onPress={() => onChange(o.value)}
        className={`px-3 py-1.5 rounded-full border ${active ? 'bg-brand border-brand' : 'bg-surface-light dark:bg-surface-dark border-line-default'}`}
      >
        <Text
          className={`text-[12px] font-medium ${active ? 'text-white' : 'text-ink-secondary-light dark:text-ink-secondary-dark'}`}
        >
          {o.label}
        </Text>
      </Pressable>
    );
  });
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {content}
      </ScrollView>
    );
  }
  return <View className="flex-row flex-wrap gap-1.5">{content}</View>;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GPSStatus — animated marker chip for the GPS step
 * ═══════════════════════════════════════════════════════════════════════════ */

interface GPSStatusProps {
  state: 'idle' | 'locating' | 'captured' | 'error';
  accuracy?: number;
}
export function GPSStatus({ state, accuracy }: GPSStatusProps) {
  const tone: Tone =
    state === 'captured'
      ? accuracy != null && accuracy > GPS_TARGET_ACCURACY_METERS
        ? 'warning'
        : 'success'
      : state === 'error'
        ? accuracy != null
          ? 'warning'
          : 'danger'
        : state === 'locating'
          ? 'brand'
          : 'neutral';
  const label =
    state === 'locating'
      ? accuracy != null
        ? `Sampling… ±${Math.round(accuracy)} m`
        : 'Sampling GPS…'
      : state === 'captured'
        ? `±${Math.round(accuracy ?? 0)} m accuracy`
        : state === 'error'
          ? accuracy != null
            ? `±${Math.round(accuracy)} m — retry`
            : 'GPS unavailable'
          : 'GPS not captured';
  const icon: IconName =
    state === 'captured'
      ? 'checkmark-circle'
      : state === 'error'
        ? 'alert-circle'
        : state === 'locating'
          ? 'compass'
          : 'location-outline';
  return <Tag label={label} tone={tone} icon={icon} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PhotoSlot — visual slot for photo capture (front/inside/side/document)
 * ═══════════════════════════════════════════════════════════════════════════ */

interface PhotoSlotProps {
  slot: 'front' | 'inside' | 'side' | 'document';
  required?: boolean;
  step?: number;
  subtitle?: string;
  previewUri?: string;
  captured?: boolean;
  onPick: () => void;
  onRemove?: () => void;
  uploading?: boolean;
}
/* ═══════════════════════════════════════════════════════════════════════════
 * AreaPairField — linked sq ft / sq m inputs
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface AreaPairFieldProps {
  label?: string;
  required?: boolean;
  sqft: number;
  onSqftChange: (sqft: number) => void;
  readOnly?: boolean;
  helperText?: string;
}

export function AreaPairField({ label, required, sqft, onSqftChange, readOnly, helperText }: AreaPairFieldProps) {
  const [sqftText, setSqftText] = useState(() => (sqft > 0 ? String(sqft) : ''));
  const [sqmText, setSqmText] = useState(() => (sqft > 0 ? formatSqmDisplay(sqmFromSqft(sqft)) : ''));
  const editingRef = useRef<'sqft' | 'sqm' | null>(null);

  useEffect(() => {
    if (editingRef.current) return;
    setSqftText(sqft > 0 ? String(sqft) : '');
    setSqmText(sqft > 0 ? formatSqmDisplay(sqmFromSqft(sqft)) : '');
  }, [sqft]);

  const applySqft = (nextSqft: number, sqftDisplay: string, sqmDisplay: string) => {
    onSqftChange(nextSqft);
    setSqftText(sqftDisplay);
    setSqmText(sqmDisplay);
  };

  const onSqftInput = (text: string) => {
    editingRef.current = 'sqft';
    setSqftText(text);
    if (!text.trim()) {
      applySqft(0, '', '');
      return;
    }
    const n = parseAreaInput(text);
    if (n != null) {
      applySqft(n, text, formatSqmDisplay(sqmFromSqft(n)));
    }
  };

  const onSqmInput = (text: string) => {
    editingRef.current = 'sqm';
    setSqmText(text);
    if (!text.trim()) {
      applySqft(0, '', '');
      return;
    }
    const sqm = parseAreaInput(text);
    if (sqm != null) {
      const nextSqft = sqftFromSqm(sqm);
      applySqft(nextSqft, nextSqft > 0 ? String(Math.round(nextSqft * 100) / 100) : '', formatSqmDisplay(sqm));
    }
  };

  const endEdit = () => {
    editingRef.current = null;
  };

  const inputClass =
    'flex-1 text-body leading-5 text-ink-primary-light dark:text-ink-primary-dark px-3 py-3 min-h-[48px]';
  const androidInputStyle =
    Platform.OS === 'android' ? ({ includeFontPadding: false, textAlignVertical: 'center' } as const) : undefined;
  const unitClass = 'text-[11px] leading-4 text-ink-tertiary-light text-center mt-1 px-0.5';
  const fieldShell = readOnly
    ? 'rounded-xl border border-line-subtle bg-page-light dark:bg-page-dark'
    : 'rounded-xl border border-line-default bg-surface-light dark:bg-surface-dark';

  return (
    <View>
      {label ? (
        <Text className="text-[14px] font-semibold text-ink-primary-light dark:text-ink-primary-dark mb-2">
          {label} {required ? <Text className="text-danger">*</Text> : null}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <View className="flex-1 min-w-0">
          <View className={`${fieldShell} overflow-hidden`}>
            <TextInput
              value={sqftText}
              onChangeText={onSqftInput}
              onBlur={endEdit}
              editable={!readOnly}
              keyboardType="decimal-pad"
              placeholder="Sq feet"
              placeholderTextColor="#9CA3AF"
              className={inputClass}
              style={androidInputStyle}
            />
          </View>
          <Text className={unitClass}>Sq feet</Text>
        </View>
        <View className="flex-1 min-w-0">
          <View className={`${fieldShell} overflow-hidden`}>
            <TextInput
              value={sqmText}
              onChangeText={onSqmInput}
              onBlur={endEdit}
              editable={!readOnly}
              keyboardType="decimal-pad"
              placeholder="Sq meter"
              placeholderTextColor="#9CA3AF"
              className={inputClass}
              style={androidInputStyle}
            />
          </View>
          <Text className={unitClass}>Sq meter</Text>
        </View>
      </View>
      {helperText ? <Text className="text-helper text-ink-tertiary-light mt-2 leading-5">{helperText}</Text> : null}
    </View>
  );
}

const PHOTO_SLOT_META: Record<PhotoSlotProps['slot'], { title: string; icon: IconName; hint: string }> = {
  front: {
    title: 'Front view',
    icon: 'home-outline',
    hint: 'Stand across the street — full façade visible',
  },
  side: {
    title: 'Side view',
    icon: 'swap-horizontal-outline',
    hint: 'Along the side boundary — length of the building',
  },
  inside: {
    title: 'Inside view',
    icon: 'enter-outline',
    hint: 'Interior of the property',
  },
  document: {
    title: 'Document',
    icon: 'document-text-outline',
    hint: 'Tax notice or ownership paper',
  },
};

export function PhotoSlot({
  slot,
  required,
  step,
  subtitle,
  previewUri,
  captured,
  onPick,
  onRemove,
  uploading,
}: PhotoSlotProps) {
  const meta = PHOTO_SLOT_META[slot];
  const has = !!previewUri || !!captured;
  const borderTone = has ? 'border-success/40' : required ? 'border-brand/25' : 'border-line-subtle';
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewUri]);

  return (
    <View
      className={`flex-1 min-w-[140px] rounded-xl border ${borderTone} bg-surface-light dark:bg-surface-dark overflow-hidden`}
    >
      <View className="px-3 pt-3 pb-2">
        <View className="flex-row items-start gap-2">
          <View className="w-9 h-9 rounded-full bg-brand-soft items-center justify-center">
            {step != null ? (
              <Text className="text-[13px] font-semibold text-brand">{step}</Text>
            ) : (
              <Ionicons name={meta.icon} size={18} color="#003B8E" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-[14px] font-semibold text-ink-primary-light dark:text-ink-primary-dark">
              {meta.title}
            </Text>
            <Text className="text-[11px] text-ink-tertiary-light mt-0.5 leading-4">{subtitle ?? meta.hint}</Text>
          </View>
        </View>
        <View className="flex-row flex-wrap gap-1.5 mt-2">
          {required ? <Tag label="Required" tone="brand" /> : null}
          {has ? <Tag label="Done" tone="success" icon="checkmark" /> : null}
        </View>
      </View>

      <Pressable onPress={onPick} disabled={uploading} className="mx-3 mb-3">
        <View className="h-36 rounded-lg overflow-hidden bg-page-light dark:bg-page-dark border border-dashed border-line-default">
          {uploading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#003B8E" />
              <Text className="text-caption text-ink-tertiary-light mt-2">Uploading…</Text>
            </View>
          ) : previewUri && !previewFailed ? (
            <>
              <Image
                source={{ uri: previewUri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                recyclingKey={previewUri}
                onError={() => setPreviewFailed(true)}
              />
              <View className="absolute inset-x-0 bottom-0 bg-black/45 py-1.5 items-center">
                <Text className="text-[11px] font-medium text-white">Tap to retake</Text>
              </View>
            </>
          ) : has ? (
            <View className="flex-1 items-center justify-center bg-brand-soft/40">
              <Ionicons name="checkmark-circle" size={40} color="#16A34A" />
              <Text className="text-helper text-ink-secondary-light mt-2 text-center px-3">Saved · tap to retake</Text>
            </View>
          ) : (
            <View className="flex-1 items-center justify-center px-3">
              <View className="w-12 h-12 rounded-full bg-brand-soft items-center justify-center mb-2">
                <Ionicons name="camera-outline" size={26} color="#003B8E" />
              </View>
              <Text className="text-helper text-brand font-medium text-center">Open camera</Text>
            </View>
          )}
        </View>
      </Pressable>

      {has && onRemove ? (
        <Pressable onPress={onRemove} className="pb-3 flex-row items-center justify-center gap-1">
          <Ionicons name="trash-outline" size={14} color="#DC2626" />
          <Text className="text-helper text-danger">Remove</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
