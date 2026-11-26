import React from 'react';
import { LanguagePicker, Screen } from '../../components';
import { SettingsMenu } from './SettingsMenu';
import { useApp } from '../../hooks';

// The settings hub (mobile) — reached directly as the Profile tab's own root (founder feedback
// 24 Oct 2026: "unnecessary back button"), so no `onBack` here, same as the other 4 tabs. The
// desktop settings master-detail (`Settings.web.tsx`) renders the same `SettingsMenu` in its left
// column, and its own hub pane has never had a back arrow either.
//
// No email line here (dropped 27 Oct 2026, founder feedback: it already shows one tap away on
// `AccountScreen`, right under "Account" — showing it again here read as odd, not useful).
export function SettingsScreen() {
  const app = useApp();
  return (
    <Screen title="Settings">
      <LanguagePicker onError={app.toast} />
      <SettingsMenu />
    </Screen>
  );
}
