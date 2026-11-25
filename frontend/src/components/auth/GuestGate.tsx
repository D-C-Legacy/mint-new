import React from 'react';
import { EmptyState, Screen } from '../ui';
import { useAuth } from '../../hooks';

// Shown in place of a tab's real content when a signed-out visitor taps a tab that genuinely
// needs an account (Sell, Inbox, Profile) or an action that does (watching live, bidding).
// Browsing itself (Discover) never shows this — see AuthProvider's `openAuthSheet` doc comment.
export function GuestGate({ title, detail }: { title: string; detail: string }) {
  const auth = useAuth();
  return (
    <Screen title={title}>
      <EmptyState
        title="Sign in to continue"
        detail={detail}
        label="Sign in"
        icon="log-in-outline"
        onPress={auth.openAuthSheet}
      />
    </Screen>
  );
}
