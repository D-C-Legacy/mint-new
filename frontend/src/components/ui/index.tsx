import * as tokens from '../../theme';
import { spacing, radii, typography } from '../../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  TextInput,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors as c } from '../../theme';
import type { Product } from '../../data';
import { PreferencesContext } from '../../providers/PreferencesProvider';
import { translateText } from '../../i18n';
export type IconName = React.ComponentProps<typeof Ionicons>['name'];

function localizeNode(node: React.ReactNode, language: import('../../types/preferences').AppLanguage): React.ReactNode {
  if (typeof node === 'string') return translateText(node, language);
  if (Array.isArray(node)) return node.map((child, index) => <React.Fragment key={index}>{localizeNode(child, language)}</React.Fragment>);
  if (React.isValidElement<{ children?: React.ReactNode }>(node) && node.props.children !== undefined) {
    return React.cloneElement(node, undefined, localizeNode(node.props.children, language));
  }
  return node;
}
export function Icon({
  name,
  size = 22,
  color = c.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function AppText({
  children,
  muted = false,
  size = 15,
  bold = false,
  white = false,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  size?: number;
  bold?: boolean;
  white?: boolean;
  style?: StyleProp<import('react-native').TextStyle>;
  numberOfLines?: number;
}) {
  const preferences = React.useContext(PreferencesContext);
  const language = preferences?.language ?? 'en';
  const localizedChildren = localizeNode(children, language);
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: size,
          ...tokens.textMetrics(size),
          color: white ? tokens.colors.canvas : muted ? c.textSecondary : c.text,
          // Headings (20px and up) use bold; smaller emphasis uses semibold.
          fontFamily: bold
            ? size >= 20
              ? tokens.fontFamilies.bold
              : tokens.fontFamilies.semibold
            : tokens.fontFamilies.regular,
        },
        style,
      ]}
    >
      {localizedChildren}
    </Text>
  );
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  loading = false,
  icon,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const preferences = React.useContext(PreferencesContext);
  const localizedLabel = translateText(label, preferences?.language ?? 'en');
  const light = secondary || variant === 'secondary' || variant === 'ghost';
  const blocked = disabled || loading;
  // Disabled buttons fall back to a muted grey fill, so their text/icon must switch to
  // textSecondary too, not stay brand/white — otherwise the label reads as full-strength
  // and the icon (white on light grey) nearly disappears.
  const contentColor = disabled ? c.textSecondary : light ? c.brand : tokens.colors.canvas;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={localizedLabel}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: disabled
            ? c.line
            : variant === 'ghost'
              ? 'transparent'
              : light
                ? c.softCanvas
                : variant === 'danger'
                  ? c.live
                  : c.brand,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : icon ? (
        <Icon name={icon} color={contentColor} />
      ) : null}
      <AppText bold muted={disabled} white={!light && !disabled}>
        {localizedLabel}
      </AppText>
    </Pressable>
  );
}

export function LanguagePicker({ onError }: { onError?: (message: string) => void }) {
  const preferences = React.useContext(PreferencesContext);
  if (!preferences) return null;
  const options = [
    ['en', 'English'],
    ['es', 'Español'],
    ['fr', 'Français'],
    ['pt', 'Português'],
    ['ar', 'العربية'],
    ['hi', 'हिन्दी'],
    ['zh', '中文'],
    ['sw', 'Kiswahili'],
    ['af', 'Afrikaans'],
    ['zu', 'isiZulu'],
    ['xh', 'isiXhosa'],
    ['st', 'Sesotho'],
    ['tn', 'Setswana'],
    ['nso', 'Sepedi'],
  ] as const;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText bold>App language</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
        {options.map(([language, label]) => (
          <Pressable
            key={language}
            accessibilityRole="button"
            accessibilityState={{ selected: preferences.language === language, disabled: !preferences.ready }}
            disabled={!preferences.ready}
            onPress={async () => {
              if (!(await preferences.updateLanguage(language))) onError?.("Couldn't save that change. Try again.");
            }}
            style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, opacity: preferences.language === language ? 1 : 0.65 }}
          >
            <AppText bold={preferences.language === language}>{label}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function IconButton({
  name,
  onPress,
  label,
  color = c.text,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.iconButton, { opacity: pressed ? 0.75 : 1 }]}
    >
      <Icon name={name} color={color} />
    </Pressable>
  );
}
export function Photo({
  uri,
  style,
}: {
  uri: string;
  style?: StyleProp<import('react-native').ImageStyle>;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <View style={[s.photoFallback, style]}>
      <Icon name="image-outline" size={36} color={c.textSecondary} />
    </View>
  ) : (
    <Image
      source={{ uri }}
      style={[{ backgroundColor: tokens.colors.imagePlaceholder }, style]}
      onError={() => setFailed(true)}
      accessibilityLabel="Product photography"
    />
  );
}
export function Avatar({ uri, size = 44 }: { uri: string; size?: number }) {
  return <Photo uri={uri} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}
export function Badge({ label, color = c.brand }: { label: string; color?: string }) {
  return (
    <View style={[s.badge, { backgroundColor: color + '18' }]}>
      <AppText size={11} bold style={{ color }}>
        {label}
      </AppText>
    </View>
  );
}
export function LiveBadge() {
  return (
    <View style={[s.badge, { backgroundColor: c.live }]}>
      <AppText white size={11} bold style={{ letterSpacing: 0.8 }}>
        LIVE
      </AppText>
    </View>
  );
}
// An icon in a soft brand-tinted circle — no box, no card. Shared by hero moments (auth screens)
// and empty states so the one visual idea stays in one place instead of drifting across copies.
export function IconMark({
  name,
  size = 96,
  iconSize,
  color = c.brand,
}: {
  name: IconName;
  size?: number;
  iconSize?: number;
  color?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.pill,
        backgroundColor: tokens.colors.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={iconSize ?? Math.round(size * 0.42)} color={color} />
    </View>
  );
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={[s.row, { marginTop: 28, marginBottom: 14 }]}>
      <AppText size={22} bold>
        {title}
      </AppText>
      {action && (
        <Pressable accessibilityRole="button" onPress={onPress}>
          <AppText size={13} style={{ color: c.brand }}>
            {action} ›
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
export function Chips({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: tokens.spacing.sm,
        paddingVertical: tokens.spacing.sm,
      }}
    >
      {items.map((item) => (
        <Pressable
          key={item}
          accessibilityRole="button"
          accessibilityState={{ selected: value === item }}
          onPress={() => onChange(item)}
          style={({ pressed }) => [
            s.chip,
            {
              backgroundColor: value === item ? c.brand : c.softCanvas,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <AppText size={13} bold={value === item} white={value === item}>
            {item}
          </AppText>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  multiline = false,
  secure = false,
  error,
  disabled = false,
  maxLength,
  autoCapitalize,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  multiline?: boolean;
  secure?: boolean;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const preferences = React.useContext(PreferencesContext);
  const language = preferences?.language ?? 'en';
  const localizedLabel = label ? translateText(label, language) : undefined;
  const localizedPlaceholder = placeholder ? translateText(placeholder, language) : undefined;
  const localizedError = error ? translateText(error, language) : undefined;
  const password = secure || !!label?.toLowerCase().includes('password');
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
      {label && (
        <AppText size={typography.meta} bold>
          {label}
        </AppText>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.softCanvas,
          borderRadius: radii.button,
          borderWidth: 1,
          borderColor: error ? c.live : focused ? c.brand : 'transparent',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <TextInput
          accessibilityLabel={localizedLabel || localizedPlaceholder}
          accessibilityState={{ disabled }}
          editable={!disabled}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={localizedPlaceholder}
          placeholderTextColor={c.textSecondary}
          keyboardType={keyboardType}
          autoCapitalize={
            autoCapitalize ?? (keyboardType === 'email-address' || password ? 'none' : 'sentences')
          }
          secureTextEntry={password && !visible}
          maxLength={maxLength}
          multiline={multiline}
          style={[
            s.input,
            { flex: 1, backgroundColor: 'transparent' },
            multiline && { height: 100, textAlignVertical: 'top' },
          ]}
        />
        {password && (
          <IconButton
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            label={visible ? 'Hide password' : 'Show password'}
            onPress={() => setVisible((v) => !v)}
          />
        )}
      </View>
        {localizedError && (
        <Text accessibilityRole="alert" style={{ color: c.live, fontSize: typography.meta }}>
          {localizedError}
        </Text>
      )}
    </View>
  );
}
export function SearchBar({
  value,
  onChange,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
}) {
  const preferences = React.useContext(PreferencesContext);
  const language = preferences?.language ?? 'en';
  const searchLabel = translateText('Search shows, sellers or products', language);
  const clearLabel = translateText('Clear search', language);
  return (
    <View
      style={[
        s.row,
        {
          gap: 8,
          marginVertical: tokens.spacing.md,
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: 9,
          borderRadius: tokens.radii.pill,
          borderWidth: 1,
          borderColor: c.line,
        },
      ]}
    >
      <Icon name="search-outline" size={18} color={c.text} />
      <TextInput
        accessibilityLabel={searchLabel}
        placeholder={searchLabel}
        placeholderTextColor={c.textSecondary}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        style={{ flex: 1, fontSize: 13, color: c.text, paddingVertical: 0 }}
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={10}
          onPress={() => onChange('')}
        >
          <Icon name="close" size={16} color={c.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}
export function Screen({
  title,
  children,
  onBack,
  right,
}: {
  // Optional for a screen whose own content (e.g. a tab switcher) already serves as the heading —
  // a separate title above it would just be a second, possibly contradictory, label for the same
  // thing (Inbox screen, founder feedback 3 Nov 2026: the bottom tab already says "Notifications",
  // a big "Inbox" title above the Notifications/Messages switcher read as a mismatch).
  title?: string;
  children: React.ReactNode;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {(title || onBack || right) && (
        <View
          style={[
            s.row,
            {
              paddingHorizontal: tokens.spacing.xl,
              paddingTop: tokens.spacing.md,
              paddingBottom: tokens.spacing.xs,
              gap: 10,
            },
          ]}
        >
          {onBack && <IconButton name="arrow-back" label="Back" onPress={onBack} />}
          {title ? (
            <AppText size={onBack ? 24 : 32} bold style={{ flex: 1 }}>
              {title}
            </AppText>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {right}
        </View>
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: tokens.spacing.xl,
          paddingTop: tokens.spacing.sm,
          paddingBottom: tokens.spacing.section,
        }}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Sheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.scrim}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={{ flex: 1 }} accessibilityLabel="Close sheet" onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={s.handle} />
          <View style={[s.row, { marginBottom: tokens.spacing.xl }]}>
            <AppText size={24} bold>
              {title}
            </AppText>
            <IconButton name="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: tokens.spacing.md }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function MenuRow({
  title,
  detail,
  icon = 'chevron-forward',
  onPress,
}: {
  title: string;
  detail?: string;
  icon?: IconName;
  onPress: () => void;
}) {
  const preferences = React.useContext(PreferencesContext);
  const localizedTitle = translateText(title, preferences?.language ?? 'en');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={localizedTitle}
      onPress={onPress}
      style={[
        s.row,
        {
          paddingVertical: 17,
          borderBottomWidth: 1,
          borderColor: c.line,
          gap: tokens.spacing.md,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <AppText bold>{title}</AppText>
        {detail && (
          <AppText size={13} muted style={{ marginTop: tokens.spacing.xs }}>
            {detail}
          </AppText>
        )}
      </View>
      <Icon name={icon} size={20} color={c.textSecondary} />
    </Pressable>
  );
}
export function EmptyState({
  title,
  detail,
  onPress,
  label = 'Explore finds',
  icon = 'sparkles-outline',
}: {
  title: string;
  detail: string;
  onPress?: () => void;
  label?: string;
  /** Defaults to the generic "explore" sparkle — pass one that matches what's actually missing
   *  (bell for no notifications, chat bubble for no messages, etc.) rather than reusing the
   *  default everywhere; the same icon for every empty state reads as templated. */
  icon?: IconName;
}) {
  return (
    <View
      style={{
        paddingVertical: tokens.spacing.hero,
        alignItems: 'center',
        gap: tokens.spacing.md,
      }}
    >
      <View
        style={{
          backgroundColor: tokens.colors.brandSoft,
          padding: tokens.spacing.xxl,
          borderRadius: 40,
        }}
      >
        <Icon name={icon} size={32} color={c.brand} />
      </View>
      <AppText size={22} bold>
        {title}
      </AppText>
      <AppText muted style={{ textAlign: 'center', maxWidth: 280 }}>
        {detail}
      </AppText>
      {onPress && <Button label={label} onPress={onPress} />}
    </View>
  );
}
export function Skeleton() {
  return (
    <View accessibilityLabel="Loading content" style={{ gap: 14 }}>
      <ActivityIndicator color={c.brand} />
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            height: 100,
            backgroundColor: tokens.colors.skeleton,
            borderRadius: tokens.radii.card,
          }}
        />
      ))}
    </View>
  );
}
export const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    minHeight: 52,
    borderRadius: tokens.radii.button,
    paddingHorizontal: tokens.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  iconButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 11,
    borderRadius: tokens.radii.pill,
  },
  input: {
    backgroundColor: c.softCanvas,
    borderRadius: tokens.radii.md,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 15,
    fontSize: tokens.typography.body,
    color: c.text,
    minHeight: 50,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radii.pill,
    alignSelf: 'flex-start',
  },
  scrim: {
    flex: 1,
    backgroundColor: tokens.colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.colors.canvas,
    borderTopLeftRadius: tokens.radii.sheet,
    borderTopRightRadius: tokens.radii.sheet,
    padding: tokens.spacing.xl,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: tokens.colors.mutedLine,
    borderRadius: 4,
    alignSelf: 'center',
    marginBottom: tokens.spacing.lg,
  },
  photoFallback: {
    backgroundColor: tokens.colors.imagePlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: c.softCanvas,
    padding: tokens.spacing.xl,
    borderRadius: tokens.radii.card,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gap: { gap: tokens.spacing.md },
});
