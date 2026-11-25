import React from 'react';
import { View, Switch, Pressable } from 'react-native';
import { AppText, Button, Screen, s } from '../../components';
import { useApp } from '../../hooks';
import { usePreferences } from '../../hooks/usePreferences';
import { colors, spacing } from '../../theme';

export function PreferencesScreen({ inline = false }: { inline?: boolean } = {}) {
  const app = useApp();
  const prefs = usePreferences();

  const notifLabels = {
    live: 'Sellers going live',
    bids: 'Bid and auction updates',
    orders: 'Order updates',
    messages: 'Messages',
  } as const;

  const privacyLabels = {
    publicProfile: 'Public profile',
    showActivity: 'Show bidding activity',
    onlineStatus: 'Show online status',
  } as const;

  const saveLanguage = async (language: 'en' | 'es') => {
    const saved = await prefs.updateLanguage(language);
    if (!saved) app.toast("Couldn't save that change. Try again.");
  };

  return (
    <Screen title="Preferences" onBack={inline ? undefined : app.back}>
      <AppText muted>Choose what you want to hear about.</AppText>
      <AppText bold style={{ marginTop: spacing.xl }}>App language</AppText>
      <View style={[s.row, { gap: spacing.md, paddingVertical: spacing.md }]}>
        {([['en', 'English'], ['es', 'Español']] as const).map(([language, label]) => (
          <Pressable
            key={language}
            accessibilityRole="button"
            accessibilityState={{ selected: prefs.language === language, disabled: !prefs.ready }}
            disabled={!prefs.ready}
            onPress={() => void saveLanguage(language)}
            style={{ opacity: prefs.language === language ? 1 : 0.65, paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}
          >
            <AppText bold={prefs.language === language}>{label}</AppText>
          </Pressable>
        ))}
      </View>
      {prefs.loadFailed ? (
        <>
          <AppText muted>Couldn't load your preferences.</AppText>
          <Button secondary label="Try again" onPress={prefs.reload} />
        </>
      ) : null}
      {(Object.keys(notifLabels) as (keyof typeof notifLabels)[]).map((key) => (
        <View key={key} style={[s.row, { paddingVertical: spacing.xl }]}>
          <AppText bold>{notifLabels[key]}</AppText>
          <Switch
            accessibilityLabel={notifLabels[key]}
            value={prefs.notifications[key]}
            disabled={!prefs.ready}
            trackColor={{ false: colors.line, true: colors.brand }}
            onValueChange={async (value) => {
              const saved = await prefs.updateNotifications({ [key]: value });
              if (!saved) app.toast("Couldn't save that change. Try again.");
            }}
          />
        </View>
      ))}

      <AppText muted style={{ marginTop: spacing.md }}>Your space, your choices.</AppText>
      {(Object.keys(privacyLabels) as (keyof typeof privacyLabels)[]).map((key) => (
        <View key={key} style={[s.row, { paddingVertical: spacing.xl }]}>
          <AppText bold>{privacyLabels[key]}</AppText>
          <Switch
            accessibilityLabel={privacyLabels[key]}
            value={prefs.privacy[key]}
            disabled={!prefs.ready}
            trackColor={{ false: colors.line, true: colors.brand }}
            onValueChange={async (value) => {
              const saved = await prefs.updatePrivacy({ [key]: value });
              if (!saved) app.toast("Couldn't save that change. Try again.");
            }}
          />
        </View>
      ))}
    </Screen>
  );
}
