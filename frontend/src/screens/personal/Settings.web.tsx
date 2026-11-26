import * as tokens from "../../theme";
import React from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { AppText, Icon, LanguagePicker, type IconName } from "../../components";
import { colors as c, radii, spacing } from "../../theme";
import { ROUTES, type RouteName } from "../../constants/routes";
import { useApp, useAuth } from "../../hooks";
import { Settings as SettingsMobile } from "./SettingsMobile";

// Web only. Below DESKTOP_BREAKPOINT this is the exact same mobile settings router the app uses
// (`SettingsMobile`). At/above it, settings becomes a master-detail page, Seller-Portal-rail style
// (founder feedback 28-29 Oct 2026: the left-hand nav kept disappearing once you clicked into a
// section — it should stay put like the seller portal's left rail does, with the selected section's
// content filling the right column instead of taking over the whole page). Sub-screens render with
// `inline` so their own route back button is hidden — the rail is the navigation now, same pattern
// `PurchaseHistoryScreen`/`PrivacyScreen`/`HelpScreen`/`PayoutsScreen`/`ReviewsScreen` already used.
const DESKTOP_BREAKPOINT = 768;

const RAIL: { route: RouteName; label: string; icon: IconName }[] = [
  { route: ROUTES.ACCOUNT, label: 'Account', icon: 'person-outline' },
  { route: ROUTES.PAYMENTS, label: 'Payment Methods', icon: 'card-outline' },
  { route: ROUTES.PURCHASE_HISTORY, label: 'Purchase History', icon: 'receipt-outline' },
  { route: ROUTES.PREFERENCES, label: 'Preferences', icon: 'options-outline' },
  { route: ROUTES.HELP, label: 'Help & Support', icon: 'help-circle-outline' },
];

export function Settings({ name }: { name: string }) {
  const { width } = useWindowDimensions();
  if (width < DESKTOP_BREAKPOINT) return <SettingsMobile name={name} />;
  return <DesktopSettings name={name} />;
}

function DesktopSettings({ name }: { name: string }) {
  const app = useApp();
  const auth = useAuth();
  const isHub = name === ROUTES.SETTINGS;

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* Left rail — stays visible no matter which section is open, same as the seller portal's
          left rail (SellerPortal.web.tsx). */}
      <View
        style={{
          width: 230,
          borderRightWidth: 1,
          borderColor: c.line,
          padding: spacing.lg,
          gap: 2,
        }}
      >
        <AppText bold size={18} style={{ marginBottom: spacing.lg }}>
          Settings
        </AppText>
        {RAIL.map((item) => {
          const selected = item.route === name;
          return (
            <Pressable
              key={item.route}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => app.navigate(item.route)}
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingVertical: 10,
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.button,
                },
                selected && { backgroundColor: c.softCanvas },
              ]}
            >
              <Icon name={item.icon} size={18} color={selected ? c.brand : c.textSecondary} />
              <AppText size={14} bold={selected} style={{ color: selected ? c.text : c.textSecondary }}>
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log out"
          onPress={auth.logout}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingVertical: 10,
            paddingHorizontal: spacing.md,
            marginTop: spacing.lg,
          }}
        >
          <Icon name="log-out-outline" size={18} color={c.live} />
          <AppText size={14} bold style={{ color: c.live }}>
            Log out
          </AppText>
        </Pressable>
      </View>

      {/* Right pane — swaps on the fly, same screens the mobile app uses, just without their own
          back button (the rail is the navigation here). */}
      <ScrollView key={name} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {isHub ? (
          <View style={{ padding: tokens.spacing.xl }}>
            <LanguagePicker onError={app.toast} />
            <AppText muted>Choose a section from the left.</AppText>
          </View>
        ) : (
          <SettingsMobile name={name} inline />
        )}
      </ScrollView>
    </View>
  );
}
