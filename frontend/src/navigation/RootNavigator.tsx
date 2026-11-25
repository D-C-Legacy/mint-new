import React from 'react';
import { View, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../hooks';
import { colors } from '../theme';
import { NotificationDeepLinkHandler } from '../NotificationDeepLinkHandler';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { AccountPendingDeletionScreen } from '../screens/personal/AccountPendingDeletionScreen';
// Founder feedback (22 Oct 2026): the onboarding carousel + Welcome chooser screens were still
// showing in the TestFlight build. RootNavigator.web.tsx already settled this (15 Oct 2026 feedback)
// by treating "onboarding" the same as "unauthenticated" and going straight to sign-in — this file
// now does the same, so the app matches web exactly instead of drifting back to the old flow.
//
// Apple review guideline 5.1.1(v): an app must not force account creation just to browse. A
// signed-out visitor ('unauthenticated' or 'onboarding') gets the real MainTabNavigator, same as
// an authenticated one — Discover's catalog/live-list is already a public, unguarded read on the
// backend (PublicCatalogController, StreamsController's GET routes). The sign-in flow becomes an
// overlay (`auth.authSheetOpen`) that any gated tab or action can open with `auth.openAuthSheet()`
// instead of being the only thing a signed-out visitor can see.
export function RootNavigator() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const showingAuthSheet = auth.state !== 'authenticated' && auth.authSheetOpen;
  React.useEffect(() => {
    if (auth.state === 'authenticated' || auth.state === 'loading' || !auth.authSheetOpen) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (auth.page === 'sign-in') {
        auth.closeAuthSheet();
        return true;
      }
      auth.setPage(auth.page === 'verification' ? 'sign-up' : 'sign-in');
      return true;
    });
    return () => listener.remove();
  }, [auth.state, auth.page, auth.authSheetOpen]);
  if (auth.state === 'loading') return <><NotificationDeepLinkHandler /><SplashScreen /></>;
  // Apple App Store guideline 5.1.1(v) account-deletion feature: a pending deletion gates the
  // whole app shell, same "lock immediately" treatment as a suspended account would need.
  if (auth.state === 'authenticated' && auth.user?.deletionScheduledAt) {
    return <AccountPendingDeletionScreen />;
  }
  return (
    <>
      <NotificationDeepLinkHandler />
      <MainTabNavigator />
      {showingAuthSheet ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.softCanvas,
            alignItems: 'center',
          }}
        >
          <StatusBar style="dark" />
          <View
            style={{
              flex: 1,
              width: '100%',
              maxWidth: 480,
              backgroundColor: colors.canvas,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            }}
          >
            <AuthNavigator />
          </View>
        </View>
      ) : null}
    </>
  );
}
