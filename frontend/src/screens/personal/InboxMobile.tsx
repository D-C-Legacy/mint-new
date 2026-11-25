import * as tokens from '../../theme';
import { ROUTES } from '../../constants/routes';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, EmptyState, Screen, s } from '../../components';
import { colors as c } from '../../theme';
import { useApp } from '../../context';
import { useInboxData } from '../../hooks/useInboxData';
import { ConversationRow, NotificationRow } from './InboxRows';

// The app's own Inbox. Reddit-style: a "Notifications" / "Messages" tab switcher up top, one list
// showing at a time — the founder's original spec, restored 3 Nov 2026 after the 28 Oct "stack both
// on one screen" attempt read as cluttered once he saw it live. `Inbox.web.tsx` only reuses this
// below its desktop breakpoint; at/above it, it keeps its own side-by-side two-column layout, which
// the founder is fine with (two columns already reads as "two separate things").
//
// `activityOnly` is still its own dedicated screen, just no longer reached from the Inbox tab —
// web's own notifications bell dropdown ("View all") pushes `ROUTES.ACTIVITY` directly from
// anywhere in the app. `showBack` keeps the back button only for that pushed case.
export function Inbox({
  activityOnly = false,
  showBack = true,
}: {
  activityOnly?: boolean;
  showBack?: boolean;
}) {
  const app = useApp();
  const {
    items,
    conversations,
    notifStatus,
    convoStatus,
    notifError,
    convoError,
    openNotification,
    markAllRead,
    deleteNotification,
  } = useInboxData();
  const [tab, setTab] = useState<'notifications' | 'messages'>('notifications');
  const unreadActivity = items.some((n) => n.readAt === null);
  const unreadMessages = conversations.some((c) => c.unread);
  const showNotifications = activityOnly || tab === 'notifications';

  return (
    <Screen
      title={activityOnly ? 'Activity' : undefined}
      onBack={activityOnly && showBack ? app.back : undefined}
      right={
        showNotifications && unreadActivity ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark all read"
            onPress={() => markAllRead()}
          >
            <AppText size={13} style={{ color: c.brand }}>
              Mark all read
            </AppText>
          </Pressable>
        ) : undefined
      }
    >
      {!activityOnly && (
        <View style={[s.row, { justifyContent: 'flex-start', marginBottom: tokens.spacing.md, gap: tokens.spacing.lg }]}>
          <TabButton
            label="Notifications"
            active={tab === 'notifications'}
            unread={unreadActivity}
            onPress={() => setTab('notifications')}
          />
          <TabButton
            label="Messages"
            active={tab === 'messages'}
            unread={unreadMessages}
            onPress={() => setTab('messages')}
          />
        </View>
      )}
      {showNotifications ? (
        notifStatus === 'loading' ? (
          <AppText muted>Loading…</AppText>
        ) : notifStatus === 'error' ? (
          <EmptyState icon="alert-circle-outline" title="Couldn't load activity" detail={notifError} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title="No activity yet"
            detail="Order and account updates show up here."
          />
        ) : (
          items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onPress={() => openNotification(item)}
              onDelete={() => deleteNotification(item)}
            />
          ))
        )
      ) : convoStatus === 'loading' ? (
        <AppText muted>Loading…</AppText>
      ) : convoStatus === 'error' ? (
        <EmptyState icon="alert-circle-outline" title="Couldn't load messages" detail={convoError} />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="chatbubble-outline"
          title="No messages yet"
          detail="Questions to sellers show up here."
        />
      ) : (
        conversations.map((convo) => (
          <ConversationRow
            key={convo.id}
            convo={convo}
            onPress={() => app.navigate(ROUTES.CONVERSATION, convo.sellerId)}
          />
        ))
      )}
    </Screen>
  );
}

function TabButton({
  label,
  active,
  unread,
  onPress,
}: {
  label: string;
  active: boolean;
  unread: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <View style={[s.row, { gap: 6, paddingBottom: tokens.spacing.sm, borderBottomWidth: 2, borderColor: active ? c.brand : 'transparent' }]}>
        <AppText bold={active} style={{ color: active ? c.text : c.textSecondary }}>
          {label}
        </AppText>
        {unread ? <View style={{ width: 7, height: 7, borderRadius: 7, backgroundColor: c.live }} /> : null}
      </View>
    </Pressable>
  );
}
