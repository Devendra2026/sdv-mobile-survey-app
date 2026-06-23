/**
 * UI primitives — all referenced components live here in one module.
 *
 * Bundled rather than scattered because every component is small and they
 * share styling tokens; one file keeps colour/spacing consistency easy
 * to audit. Components are pure (no hooks beyond local state) so they
 * can render anywhere in the tree.
 */
import { formatSqmDisplay, parseAreaInput, sqftFromSqm, sqmFromSqft } from '@/utils/area';
import { formatSurveyParcelLabel, timeAgo } from '@/utils/format';
import { androidRipple, horizontalScrollProps } from '@/utils/scroll-props';
import { optionLabel } from '@/utils/services';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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

const BUTTON_BASE_HEIGHTS: Record<ButtonSize, string> = {
  sm: 'h-9 px-4',
  md: 'h-[44px] px-5',
  lg: 'h-[52px] px-6',
};
const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-brand active:bg-brand/90',
  outline: 'border border-line-default bg-transparent active:bg-page-light dark:active:bg-page-dark',
  ghost: 'bg-transparent active:bg-page-light dark:active:bg-page-dark',
  danger: 'bg-danger active:bg-danger/90',
};
const BUTTON_TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: 'text-white',
  outline: 'text-ink-primary-light dark:text-ink-primary-dark',
  ghost: 'text-brand',
  danger: 'text-white',
};
const BUTTON_ICON_COLOR: Record<ButtonVariant, string> = {
  primary: '#FFFFFF',
  outline: '#0B1220',
  ghost: '#003B8E',
  danger: '#FFFFFF',
};

type SurveyStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'pending';
const STATUS_BADGE_MAP: Record<SurveyStatus, { tone: Tone; label: string; icon: IconName }> = {
  draft: { tone: 'neutral', label: 'Draft', icon: 'create-outline' },
  submitted: { tone: 'info', label: 'Submitted', icon: 'cloud-upload-outline' },
  approved: { tone: 'success', label: 'Approved', icon: 'checkmark-circle' },
  rejected: { tone: 'danger', label: 'Rejected', icon: 'close-circle' },
  pending: { tone: 'warning', label: 'Pending', icon: 'time-outline' },
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
        BUTTON_BASE_HEIGHTS[size],
        BUTTON_VARIANT_CLASS[variant],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-50' : '',
        className ?? '',
      ].join(' ')}
    >
      {loading ? (
        <ActivityIndicator size="small" color={BUTTON_ICON_COLOR[variant]} />
      ) : (
        <>
          {iconLeft ? (
            <Ionicons name={iconLeft} size={18} color={BUTTON_ICON_COLOR[variant]} style={{ marginRight: 8 }} />
          ) : null}
          <Text className={`text-[14px] font-medium ${BUTTON_TEXT_COLOR[variant]}`}>{label}</Text>
          {iconRight ? (
            <Ionicons name={iconRight} size={18} color={BUTTON_ICON_COLOR[variant]} style={{ marginLeft: 8 }} />
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
  helperText?: string;
  /** Bottom-sheet title when there is no field `label`; ignored if `label` is set. */
  modalTitle?: string;
  disabled?: boolean;
}

const EMPTY_DROPDOWN_OPTIONS: DropdownOption[] = [];
const DROPDOWN_ROW_STYLE = { minHeight: 48 } as const;

function DropdownOptionRow({
  option,
  active,
  onSelect,
}: {
  option: DropdownOption;
  active: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onSelect(option.value)}
      android_ripple={androidRipple('rgba(0, 59, 142, 0.1)')}
      className={`flex-row items-center justify-between rounded-md px-3 py-2.5 ${active ? 'bg-brand-soft' : ''}`}
      style={DROPDOWN_ROW_STYLE}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        className={`flex-1 pr-2 text-body leading-5 ${active ? 'text-brand font-medium' : 'text-ink-primary-light dark:text-ink-primary-dark'}`}
      >
        {option.label}
      </Text>
      {active ? <Ionicons name="checkmark" size={18} color="#003B8E" /> : null}
    </Pressable>
  );
}

export function AppDropdown({
  value,
  options = EMPTY_DROPDOWN_OPTIONS,
  onChange,
  label,
  required,
  placeholder = 'Tap to choose',
  helperText,
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

  const handleSelect = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  const renderItem = useCallback(
    ({ item }: { item: DropdownOption }) => (
      <DropdownOptionRow option={item} active={item.value === value} onSelect={handleSelect} />
    ),
    [value, handleSelect],
  );

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
      {helperText ? (
        <Text className="text-helper text-ink-tertiary-light dark:text-ink-tertiary-dark mt-1 leading-5">
          {helperText}
        </Text>
      ) : null}

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
              renderItem={renderItem}
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
    .flatMap((s) => (s[0] ? [s[0]] : []))
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
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(1.4, { duration: 800 }), withTiming(1, { duration: 800 })), -1);
  }, [scale]);
  const color = TONE_ICON_HEX[tone];
  const pulseStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color,
    opacity: 0.4,
    transform: [{ scale: scale.value }],
  }));
  return (
    <View className="w-2 h-2 items-center justify-center">
      <Animated.View style={pulseStyle} />
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
  const translateY = useSharedValue(80);
  useEffect(() => {
    if (!visible) return;
    translateY.value = withSpring(0, { damping: 8 });
    const t = setTimeout(() => {
      translateY.value = withTiming(80, { duration: 200 }, (finished) => {
        if (finished) runOnJS(onHide)();
      });
    }, duration);
    return () => clearTimeout(t);
  }, [visible, translateY, duration, onHide]);
  const toastStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    bottom: 28,
    left: 14,
    right: 14,
    transform: [{ translateY: translateY.value }],
  }));
  if (!visible) return null;
  return (
    <Animated.View style={toastStyle}>
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
  status: SurveyStatus;
}
export function StatusBadge({ status }: StatusBadgeProps) {
  const m = STATUS_BADGE_MAP[status];
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
  createdAt?: number;
  updatedAt: number;
  completionPct?: number;
  highlight?: 'recent' | 'none';
  onPress: () => void;
}

function draftTimestampLabel(createdAt: number | undefined, updatedAt: number): string {
  const updated = `Updated ${timeAgo(updatedAt)}`;
  if (createdAt != null && Math.abs(createdAt - updatedAt) > 60_000) {
    return `Created ${timeAgo(createdAt)} · ${updated}`;
  }
  return updated;
}

export const SurveyCard = memo(function SurveyCard({
  parcelNo,
  unitNo,
  ownerName,
  wardNo,
  status,
  qcStatus,
  createdAt,
  updatedAt,
  completionPct,
  highlight = 'none',
  onPress,
}: SurveyCardProps) {
  const isRecent = highlight === 'recent';
  return (
    <Pressable
      onPress={onPress}
      className={[
        'p-3.5 bg-surface-light dark:bg-surface-dark rounded-xl border active:opacity-90',
        isRecent ? 'border-brand border-l-4 shadow-md' : 'border-line-subtle shadow-sm',
      ].join(' ')}
    >
      <View className="flex-row items-start">
        <View className="w-10 h-10 rounded-lg bg-brand-soft items-center justify-center">
          <Ionicons name="home-outline" size={20} color="#003B8E" />
        </View>
        <View className="flex-1 ml-3 min-w-0">
          <View className="flex-row items-center gap-1.5 flex-wrap">
            <Text className="text-[13px] font-medium text-ink-primary-light dark:text-ink-primary-dark">
              {formatSurveyParcelLabel(parcelNo, unitNo)}
            </Text>
            {isRecent ? <Tag label="Most recent" tone="brand" icon="time-outline" /> : null}
          </View>
          <Text className="text-caption text-ink-tertiary-light dark:text-ink-tertiary-dark mt-0.5" numberOfLines={1}>
            {ownerName}
          </Text>
          <Text className="text-[11px] text-ink-tertiary-light dark:text-ink-tertiary-dark mt-0.5">
            {draftTimestampLabel(createdAt, updatedAt)}
          </Text>
          <View className="flex-row gap-1.5 mt-2 items-center flex-wrap">
            <Tag label={`Ward ${wardNo}`} tone="neutral" icon="map-outline" />
            <StatusBadge status={status} />
            {status === 'draft' && completionPct != null ? (
              <Tag
                label={`${completionPct}%`}
                tone={completionPct >= 100 ? 'success' : 'warning'}
                icon="pie-chart-outline"
              />
            ) : null}
            {qcStatus === 'rejected' ? <Tag label="QC: rejected" tone="danger" icon="alert" /> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#9AA3AF" />
      </View>
    </Pressable>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
 * StepIndicator — 8-step horizontal pill with completion state
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface StepIndicatorStep {
  key: string;
  label: string;
  short: string; // 1–2 char label for the dot
  completed: boolean;
  progress?: 'complete' | 'in_progress' | 'incomplete';
  reachable?: boolean;
}
interface StepIndicatorProps {
  steps: StepIndicatorStep[];
  activeKey: string;
  onSelect?: (key: string) => void;
}
export function StepIndicator({ steps, activeKey, onSelect }: StepIndicatorProps) {
  const renderItem = useCallback(
    ({ item: s, index: i }: { item: StepIndicatorStep; index: number }) => {
      const active = s.key === activeKey;
      const locked = s.reachable === false;
      const inProgress = !s.completed && s.progress === 'in_progress';
      const bg = active
        ? 'bg-brand'
        : s.completed
          ? 'bg-success'
          : inProgress
            ? 'bg-warning'
            : locked
              ? 'bg-line-subtle/60 opacity-50'
              : 'bg-line-subtle';
      const fg = active || s.completed ? 'text-white' : inProgress ? 'text-white' : 'text-ink-secondary-light';
      return (
        <Pressable
          onPress={() => !locked && onSelect?.(s.key)}
          disabled={!onSelect || locked}
          className="flex-row items-center"
        >
          <View className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 ${bg}`}>
            {locked ? (
              <Ionicons name="lock-closed" size={10} color="#9AA3AF" />
            ) : s.completed && !active ? (
              <Ionicons name="checkmark" size={11} color="#FFFFFF" />
            ) : inProgress ? (
              <View className="w-1.5 h-1.5 rounded-full bg-white" />
            ) : (
              <Text className={`text-[10px] font-medium ${fg}`}>{i + 1}</Text>
            )}
            <Text className={`text-[11px] font-medium ${fg}`}>{s.label}</Text>
          </View>
        </Pressable>
      );
    },
    [activeKey, onSelect],
  );

  return (
    <FlatList
      horizontal
      data={steps}
      keyExtractor={(s) => s.key}
      renderItem={renderItem}
      {...horizontalScrollProps}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 6 }}
    />
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
  /** Whether device location permission and services are ready. */
  locationAvailable?: boolean;
}
export function GPSStatus({ state, locationAvailable = true }: GPSStatusProps) {
  const tone: Tone =
    state === 'captured'
      ? 'success'
      : state === 'error' || !locationAvailable
        ? 'danger'
        : state === 'locating'
          ? 'brand'
          : locationAvailable
            ? 'success'
            : 'danger';
  const label =
    state === 'locating'
      ? 'Capturing…'
      : state === 'captured'
        ? 'Captured'
        : state === 'error' || !locationAvailable
          ? 'Unavailable'
          : locationAvailable
            ? 'Available'
            : 'Unavailable';
  const icon: IconName =
    state === 'captured'
      ? 'checkmark-circle'
      : state === 'error' || !locationAvailable
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
  const externalSqftText = sqft > 0 ? String(sqft) : '';
  const externalSqmText = sqft > 0 ? formatSqmDisplay(sqmFromSqft(sqft)) : '';
  const [editOverride, setEditOverride] = useState<{ sqft: string; sqm: string } | null>(null);
  const editingRef = useRef<'sqft' | 'sqm' | null>(null);

  const sqftText = editOverride?.sqft ?? externalSqftText;
  const sqmText = editOverride?.sqm ?? externalSqmText;

  const applySqft = (nextSqft: number, sqftDisplay: string, sqmDisplay: string) => {
    onSqftChange(nextSqft);
    setEditOverride({ sqft: sqftDisplay, sqm: sqmDisplay });
  };

  const onSqftInput = (text: string) => {
    editingRef.current = 'sqft';
    if (!text.trim()) {
      applySqft(0, '', '');
      return;
    }
    const n = parseAreaInput(text);
    if (n != null) {
      applySqft(n, text, formatSqmDisplay(sqmFromSqft(n)));
    } else {
      setEditOverride({ sqft: text, sqm: sqmText });
    }
  };

  const onSqmInput = (text: string) => {
    editingRef.current = 'sqm';
    if (!text.trim()) {
      applySqft(0, '', '');
      return;
    }
    const sqm = parseAreaInput(text);
    if (sqm != null) {
      const nextSqft = sqftFromSqm(sqm);
      applySqft(nextSqft, nextSqft > 0 ? String(Math.round(nextSqft * 100) / 100) : '', formatSqmDisplay(sqm));
    } else {
      setEditOverride({ sqft: sqftText, sqm: text });
    }
  };

  const endEdit = () => {
    editingRef.current = null;
    setEditOverride(null);
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
  const [failedPreviewUri, setFailedPreviewUri] = useState<string | null>(null);
  const previewFailed = failedPreviewUri === previewUri;

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
                onError={() => setFailedPreviewUri(previewUri ?? null)}
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
