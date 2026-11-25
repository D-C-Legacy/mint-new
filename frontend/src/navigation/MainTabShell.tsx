import * as tokens from '../theme';
import { RouteNavigator } from './RouteNavigator';
import { useMarketplaceState } from '../hooks/useMarketplaceState';

import { ROUTES } from '../constants/routes';
import { TABS } from '../constants/routes';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppContext } from '../context';
import { AnimatedStackView } from './AnimatedStackView';
import type { Route } from '../hooks/useNavigation';

import { colors as c } from '../theme';
import { AppText } from '../components';
import { Live } from '../Live';
import { Discover } from '../Marketplace';
import { SellHub } from '../Seller';
import { Inbox, Settings } from '../Personal';
import { GuestGate } from '../components/auth/GuestGate';
import { useAuth } from '../hooks';
import { useNavigation } from '../hooks/useNavigation';
import { useNotifications } from '../hooks/useNotifications';
import { useMessaging } from '../hooks/useMessaging';
const tabs = TABS;

// The app's own mobile-shaped layout — bottom tab bar, phone-frame width. This is the single
// source of truth for that layout: the native entry point (`MainTabNavigator.tsx`) re-exports it
// unchanged, and the web entry point (`MainTabNavigator.web.tsx`) renders it too at phone-width
// viewports, so "web on a phone browser looks like the app" never drifts from what the app
// actually looks like. Only `MainTabNavigator.web.tsx` has a second, desktop-only layout.
export function MainTabShell() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const { tab, setTab, routes, setRoutes, back, navigate, selectStream, stream } = useNavigation();
  const market = useMarketplaceState();
  const auth = useAuth();
  const isGuest = auth.state !== 'authenticated';
  const { unreadCount: unreadNotifications } = useNotifications();
  const { unreadCount: unreadMessages } = useMessaging();
  const [notice, setNotice] = useState('');
  const route = routes[routes.length - 1];
  const dark = tab === ROUTES.LIVE && !route && !isGuest;
  // A signed-out visitor can browse Discover, but Live opens straight into a video feed that
  // needs a viewer token (auth-gated on the backend) — land them on Discover instead of a tab
  // that immediately asks them to sign in. Runs once: by the time this shell mounts, RootNavigator
  // has already settled `auth.state` past 'loading'.
  const defaultedGuestTab = useRef(false);
  useEffect(() => {
    if (defaultedGuestTab.current) return;
    defaultedGuestTab.current = true;
    if (isGuest && tab === ROUTES.LIVE) setTab(ROUTES.DISCOVER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // On a live, the bottom bar slides away after 40 seconds on one stream. Leaving the tab, or
  // moving to another stream, brings it back.
  const [navVisible, setNavVisible] = useState(true);
  const navSlide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setNavVisible(true);
  }, [tab, route]);
  useEffect(() => {
    Animated.timing(navSlide, {
      toValue: navVisible ? 0 : 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [navVisible]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(t);
  }, [notice]);
  const context = { navigate, back, toast: setNotice, selectStream, ...market };
  function renderTabRoot() {
    switch (tab) {
      case ROUTES.LIVE:
        return isGuest ? (
          <GuestGate title="Live" detail="Sign in to watch live shows and bid in real time." />
        ) : (
          <Live streamId={stream} navVisible={navVisible} onNavVisibility={setNavVisible} />
        );
      case ROUTES.DISCOVER:
        return <Discover />;
      case ROUTES.SELL:
        return isGuest ? (
          <GuestGate title="Sell" detail="Sign in to list items and go live." />
        ) : (
          <SellHub />
        );
      case ROUTES.INBOX:
        return isGuest ? (
          <GuestGate title="Inbox" detail="Sign in to see your messages and notifications." />
        ) : (
          <Inbox />
        );
      case ROUTES.PROFILE:
        // Founder feedback (24 Oct 2026): the old "Your corner" page and its gear icon both led
        // here anyway, so the profile icon now opens settings directly instead of a stop in
        // between.
        return isGuest ? (
          <GuestGate title="Profile" detail="Sign in to view and manage your account." />
        ) : (
          <Settings name={ROUTES.SETTINGS} />
        );
    }
  }
  const routeKey = (r: Route, depth: number) => `${r.name}:${depth}`;
  const tabRootKey = `tab:${tab}`;
  const topEntry = route
    ? { key: routeKey(route, routes.length), node: <RouteNavigator route={route} /> }
    : { key: tabRootKey, node: renderTabRoot() };
  const parentRoute = routes.length >= 2 ? routes[routes.length - 2] : undefined;
  const belowEntry = parentRoute
    ? { key: routeKey(parentRoute, routes.length - 1), node: <RouteNavigator route={parentRoute} /> }
    : routes.length === 1
      ? { key: tabRootKey, node: renderTabRoot() }
      : null;
  // Switching tabs (bottom bar) always empties `routes`, same as a native tab bar swap — that's an
  // outright content swap, not a push, so it must never slide like one.
  const prevTab = useRef(tab);
  const tabJustChanged = prevTab.current !== tab;
  useEffect(() => {
    prevTab.current = tab;
  }, [tab]);
  return (
    <AppContext.Provider value={context}>
      <View style={styles.desktop}>
        <View
          style={[
            styles.app,
            {
              paddingTop: insets.top,
              backgroundColor: dark ? c.ink : c.canvas,
            },
            // The 960px cap + boxed shadow is a phone-frame preview for a desktop browser window
            // narrowed below the mobile breakpoint — on a real phone (window already <=960 tall,
            // true for virtually every real device) this must not apply at all, or it caps the
            // live app's real height short of the actual screen and leaves dead space below it
            // (founder-reported, 26-27 Oct 2026: "show the full stream, no gap from the bottom").
            Platform.OS === 'web' && windowHeight > 960
              ? { maxHeight: 960, overflow: 'hidden' as const, boxShadow: '0 10px 70px #00000012' }
              : null,
          ]}
        >
          <StatusBar style={dark ? 'light' : 'dark'} />
          <View style={{ flex: 1, paddingBottom: dark ? 0 : 64 + Math.max(insets.bottom, 10) }}>
            <AnimatedStackView
              top={topEntry}
              below={belowEntry}
              instant={tabJustChanged}
              backgroundColor={dark ? c.ink : c.canvas}
              onInteractiveBack={back}
            />
          </View>
          <Animated.View
            style={[
              styles.nav,
              {
                paddingBottom: Math.max(insets.bottom, 10),
                backgroundColor: dark ? 'transparent' : c.canvas,
                borderTopColor: dark ? 'transparent' : c.line,
                transform: [
                  {
                    translateY: navSlide.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 140],
                    }),
                  },
                ],
              },
            ]}
          >
            {tabs.map((t) => (
              <Pressable
                key={t.name}
                accessibilityRole="tab"
                accessibilityLabel={t.name}
                accessibilityState={{ selected: tab === t.name }}
                onPress={() => {
                  setTab(t.name);
                  setRoutes([]);
                }}
                style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Ionicons
                  name={tab === t.name ? t.selected : t.icon}
                  color={dark ? '#FFFFFF' : tab === t.name ? c.brand : c.textSecondary}
                  size={22}
                />
                <AppText
                  size={10}
                  style={{
                    color: dark ? '#FFFFFF' : tab === t.name ? c.brand : c.textSecondary,
                  }}
                >
                  {t.label}
                </AppText>
                {t.name === ROUTES.INBOX && (unreadMessages > 0 || unreadNotifications > 0) && (
                  <View style={styles.dot} />
                )}
              </Pressable>
            ))}
          </Animated.View>
          {notice !== '' && (
            <Pressable
              accessibilityRole="alert"
              onPress={() => setNotice('')}
              style={[styles.toast, { bottom: 85 + insets.bottom }]}
            >
              <AppText white size={13}>
                {notice}
              </AppText>
            </Pressable>
          )}
        </View>
      </View>
    </AppContext.Provider>
  );
}
const styles = StyleSheet.create({
  iconRing: {
    width: 36,
    height: 32,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktop: {
    flex: 1,
    backgroundColor: tokens.colors.desktop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  app: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
  },
  nav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    gap: tokens.spacing.xs,
  },
  dot: {
    position: 'absolute',
    top: 0,
    right: '30%',
    width: 5,
    height: 5,
    backgroundColor: c.live,
    borderRadius: 5,
  },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: tokens.colors.toast,
    borderRadius: tokens.radii.button,
    padding: 18,
    elevation: 8,
  },
});
