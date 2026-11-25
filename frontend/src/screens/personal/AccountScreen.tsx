import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  Icon,
  Screen,
  Section,
} from '../../components';
import { InitialsAvatar } from '../../components/live/InitialsAvatar';
import { AddressForm } from '../../components/commerce/AddressForm';
import { FollowingList } from '../marketplace/FollowingList';
import { useApp, useAuth, useForm } from '../../hooks';
import { useAsync } from '../../api/use-async';
import { describeApiError } from '../../api/describe-error';
import { ApiError } from '../../api';
import {
  updateProfile,
  requestAvatarUpload,
  requestEmailChange,
  confirmEmailChange,
  changePassword,
  requestAccountDeletion,
} from '../../api/identity';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
  type SavedAddress,
} from '../../api/addresses';
import { formatAddress } from '../../utils/format-address';
import { validEmail, validPassword, validPhone } from '../../utils/auth';
import { ROUTES } from '../../constants';
import { colors as c, spacing } from '../../theme';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function formatDeletionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// A plain inline-editable row — no boxed/pill field, no separate Save button. Tap the value to
// edit it in place; a checkmark commits (calling onSave), an X discards. Used for Account page
// fields (28-29 Oct 2026 founder feedback: the old boxed Field + bottom "Save changes" button
// read as "buttons/ovals" everywhere on the page) — not a shared component, since `Field` itself
// is reused well beyond Account (login, signup, checkout) and wasn't the target of that feedback.
function InlineField({
  label,
  value,
  placeholder,
  keyboardType,
  validate,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad';
  validate?: (trimmed: string) => string | null;
  onSave: (trimmed: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = async () => {
    const trimmed = draft.trim();
    const problem = validate?.(trimmed) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    if (trimmed === value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText size={13} muted style={{ marginBottom: spacing.xs }}>
        {label}
      </AppText>
      {editing ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <TextInput
            accessibilityLabel={label}
            autoFocus
            editable={!busy}
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              setError('');
            }}
            placeholder={placeholder}
            placeholderTextColor={c.textSecondary}
            keyboardType={keyboardType}
            onSubmitEditing={commit}
            style={{
              flex: 1,
              fontSize: 15,
              color: c.text,
              paddingVertical: spacing.xs,
              borderBottomWidth: 1,
              borderBottomColor: error ? c.live : c.brand,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Save ${label}`}
            onPress={commit}
            disabled={busy}
          >
            <Icon name="checkmark" size={22} color={c.brand} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={() => {
              setEditing(false);
              setDraft(value);
              setError('');
            }}
            disabled={busy}
          >
            <Icon name="close" size={22} color={c.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${label}`}
          onPress={() => setEditing(true)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppText size={15} muted={!value}>
            {value || placeholder || 'Not set'}
          </AppText>
          <Icon name="pencil-outline" size={16} color={c.textSecondary} />
        </Pressable>
      )}
      {error ? (
        <AppText size={13} style={{ color: c.live, marginTop: spacing.xs }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

// The app's own Account page (28 Oct 2026 — founder feedback: Account used to fan out into Edit
// profile / Your Activity / Addresses / Security, and Security itself fanned out further into
// Change password / Change email / Delete account — four levels deep. Same lesson already applied
// to Inbox (see InboxMobile.tsx's own comment): everything that was a destination is now a section
// or an inline-expanding row on this one page instead. Nothing under Account pushes to another
// screen anymore, except the rare "Verify your email" flow (shared with sign-up's own
// VerificationScreen, deliberately left alone rather than forking that shared component) and real
// content destinations a tap leads to (a followed seller's channel), which were never the
// complaint — only settings-on-settings navigation was.
export function AccountScreen({ inline = false }: { inline?: boolean } = {}) {
  const app = useApp();
  const auth = useAuth();

  // ---- Profile (always inline, no edit/view toggle — editing a name/phone is not disruptive
  // enough to warrant hiding the fields) ----
  const currentName = auth.user?.name ?? '';
  const currentPhone = auth.user?.phone ?? '';
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  async function pickAvatar() {
    setAvatarError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAvatarError('Allow photo access in Settings to choose a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    setAvatarBusy(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const mimeType = asset.mimeType || blob.type || 'image/jpeg';
      const sizeBytes = asset.fileSize ?? blob.size;

      if (!IMAGE_MIME_TYPES.includes(mimeType)) {
        setAvatarError('Choose a JPEG, PNG, WebP, or HEIC photo.');
        return;
      }
      if (sizeBytes > MAX_IMAGE_BYTES) {
        setAvatarError('That photo is over the 10 MB limit.');
        return;
      }

      const fileName = asset.fileName || `avatar.${EXTENSION_BY_MIME[mimeType] ?? 'jpg'}`;
      const slot = await requestAvatarUpload({ fileName, mimeType, sizeBytes });

      const put = await fetch(slot.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: blob,
      });
      if (!put.ok) {
        setAvatarError('Upload failed. Check your connection and try again.');
        return;
      }

      await updateProfile({ displayName: currentName.trim(), avatarKey: slot.storageKey });
      await auth.refreshUser();
      app.toast('Profile picture updated');
    } catch (err) {
      setAvatarError(describeApiError(err));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarError('');
    setAvatarBusy(true);
    try {
      await updateProfile({ displayName: currentName.trim(), avatarKey: null });
      await auth.refreshUser();
      app.toast('Profile picture removed');
    } catch (err) {
      setAvatarError(describeApiError(err));
    } finally {
      setAvatarBusy(false);
    }
  }

  // ---- Addresses (same inline add/edit toggle AddressesScreen always used, just without its own
  // Screen wrapper) ----
  const { state: addressState, reload: reloadAddresses } = useAsync(listAddresses, []);
  const [addressMode, setAddressMode] = useState<
    { kind: 'list' } | { kind: 'add' } | { kind: 'edit'; address: SavedAddress }
  >({ kind: 'list' });
  const [confirmDeleteAddress, setConfirmDeleteAddress] = useState<string | null>(null);
  const [busyAddressId, setBusyAddressId] = useState<string | null>(null);

  const runAddressAction = async (id: string, work: () => Promise<unknown>, done: string) => {
    setBusyAddressId(id);
    try {
      await work();
      app.toast(done);
      reloadAddresses();
    } catch (err) {
      app.toast(describeApiError(err));
    } finally {
      setBusyAddressId(null);
      setConfirmDeleteAddress(null);
    }
  };

  // ---- Security: change password ----
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const passwordForm = useForm({ current: '', password: '', confirm: '' }, (v) => ({
    ...(!v.current ? { current: 'Enter your current password.' } : {}),
    ...(!validPassword(v.password) ? { password: 'Use at least 8 characters.' } : {}),
    ...(v.password !== v.confirm ? { confirm: 'Passwords must match.' } : {}),
  }));
  const [passwordServerError, setPasswordServerError] = useState('');

  const submitChangePassword = async () => {
    if (!passwordForm.validate()) return;
    setPasswordBusy(true);
    setPasswordServerError('');
    try {
      await changePassword({
        currentPassword: passwordForm.values.current,
        newPassword: passwordForm.values.password,
      });
      app.toast('Password updated. Other devices were signed out.');
      setShowChangePassword(false);
    } catch (err) {
      setPasswordServerError(describeApiError(err));
    } finally {
      setPasswordBusy(false);
    }
  };

  // ---- Security: change email ----
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [emailStep, setEmailStep] = useState<'request' | 'confirm'>('request');
  const [pendingNewEmail, setPendingNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailToken, setEmailToken] = useState('');
  const [emailTokenError, setEmailTokenError] = useState('');
  const [emailServerError, setEmailServerError] = useState('');
  const emailForm = useForm({ password: '', email: '' }, (v) => ({
    ...(!v.password ? { password: 'Enter your current password.' } : {}),
    ...(!validEmail(v.email) ? { email: 'Enter a valid email address.' } : {}),
  }));

  const submitChangeEmailRequest = async () => {
    if (!emailForm.validate()) return;
    setEmailBusy(true);
    setEmailServerError('');
    try {
      await requestEmailChange({
        currentPassword: emailForm.values.password,
        newEmail: emailForm.values.email,
      });
      setPendingNewEmail(emailForm.values.email);
      setEmailStep('confirm');
    } catch (err) {
      setEmailServerError(describeApiError(err));
    } finally {
      setEmailBusy(false);
    }
  };

  const submitChangeEmailConfirm = async () => {
    if (!emailToken.trim()) {
      setEmailTokenError('Enter the code from your email.');
      return;
    }
    setEmailBusy(true);
    setEmailTokenError('');
    try {
      await confirmEmailChange(emailToken.trim());
      await auth.refreshUser();
      app.toast('Email updated. Other devices were signed out.');
      setShowChangeEmail(false);
      setEmailStep('request');
    } catch (err) {
      setEmailTokenError(describeApiError(err));
    } finally {
      setEmailBusy(false);
    }
  };

  // ---- Danger zone: delete account ----
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlockers, setDeleteBlockers] = useState<string[] | null>(null);

  const submitDeleteAccount = async () => {
    setDeleteError('');
    setDeleteBlockers(null);
    setDeleteBusy(true);
    try {
      const result = await requestAccountDeletion();
      auth.setNotice(
        `Account deletion scheduled for ${formatDeletionDate(result.scheduledFor)}. Sign in again before then to cancel.`,
      );
      await auth.logout();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ACCOUNT_DELETION_BLOCKED') {
        const reasons = (err.details as { reasons?: string[] } | null)?.reasons ?? [];
        setDeleteBlockers(reasons.length > 0 ? reasons : [describeApiError(err)]);
      } else {
        setDeleteError(describeApiError(err));
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const verified = auth.user?.emailVerified ?? false;

  return (
    <Screen title="Account" onBack={inline ? undefined : app.back}>
      {/* ---------- Profile ---------- */}
      <View style={{ alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
          onPress={pickAvatar}
          disabled={avatarBusy}
          style={{ opacity: avatarBusy ? 0.6 : 1 }}
        >
          {auth.user?.avatarUrl ? (
            <Avatar uri={auth.user.avatarUrl} size={88} />
          ) : (
            <InitialsAvatar name={currentName || '?'} size={88} />
          )}
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: c.brand,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: c.canvas,
            }}
          >
            <Icon name="camera-outline" size={16} color="#FFFFFF" />
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={pickAvatar} disabled={avatarBusy}>
          <AppText size={13} bold style={{ color: c.brand }}>
            {avatarBusy ? 'Uploading…' : 'Change photo'}
          </AppText>
        </Pressable>
        {auth.user?.avatarUrl && !avatarBusy && (
          <Pressable accessibilityRole="button" onPress={removeAvatar}>
            <AppText size={13} style={{ color: c.textSecondary }}>
              Remove photo
            </AppText>
          </Pressable>
        )}
        {avatarError ? (
          <AppText size={13} style={{ color: c.live, textAlign: 'center' }}>
            {avatarError}
          </AppText>
        ) : null}
      </View>

      <InlineField
        label="Full name"
        value={currentName}
        validate={(v) => (!v ? 'Enter your name.' : null)}
        onSave={async (v) => {
          await updateProfile({ displayName: v, phone: currentPhone === '' ? null : currentPhone });
          await auth.refreshUser();
          app.toast('Name updated');
        }}
      />
      <View style={{ marginBottom: spacing.lg }}>
        <AppText size={13} muted style={{ marginBottom: spacing.xs }}>
          Email
        </AppText>
        <AppText size={15}>{auth.user?.email ?? ''}</AppText>
      </View>
      <InlineField
        label="Phone number"
        value={currentPhone}
        placeholder="+1 555 123 4567"
        keyboardType="phone-pad"
        validate={(v) => (!validPhone(v) ? 'Enter a valid phone number.' : null)}
        onSave={async (v) => {
          await updateProfile({ displayName: currentName, phone: v === '' ? null : v });
          await auth.refreshUser();
          app.toast('Phone number updated');
        }}
      />

      {/* ---------- Activity ---------- */}
      <Section title="Activity" />
      <AppText bold style={{ marginBottom: spacing.sm }}>
        Following
      </AppText>
      <FollowingList />

      {/* ---------- Addresses ---------- */}
      <Section title="Addresses" />
      {addressMode.kind !== 'list' ? (
        <AddressForm
          initial={addressMode.kind === 'edit' ? addressMode.address : undefined}
          submitLabel={addressMode.kind === 'edit' ? 'Save changes' : 'Save address'}
          defaultToggleLabel={addressMode.kind === 'edit' ? undefined : 'Make this my default address'}
          onSubmit={async (fields, makeDefault) => {
            if (addressMode.kind === 'edit') await updateAddress(addressMode.address.id, fields);
            else await createAddress({ ...fields, isDefault: makeDefault });
            app.toast('Address saved');
            reloadAddresses();
            setAddressMode({ kind: 'list' });
          }}
          onCancel={() => setAddressMode({ kind: 'list' })}
        />
      ) : (
        <>
          {addressState.status === 'loading' ? <AppText muted>Loading…</AppText> : null}
          {addressState.status === 'error' ? (
            <EmptyState title="Couldn't load your addresses" detail={addressState.message} />
          ) : null}
          {addressState.status === 'ready' && addressState.data.length === 0 ? (
            <AppText muted>You haven't saved an address yet.</AppText>
          ) : null}
          {addressState.status === 'ready'
            ? addressState.data.map((address) => (
                <View
                  key={address.id}
                  style={{
                    gap: spacing.sm,
                    marginBottom: spacing.md,
                    padding: spacing.lg,
                    borderWidth: 1,
                    borderColor: address.isDefault ? c.brand : c.line,
                    borderRadius: 12,
                  }}
                >
                  <AppText bold>
                    {address.fullName}
                    {address.isDefault ? ' · Default' : ''}
                  </AppText>
                  <AppText muted>{formatAddress(address)}</AppText>
                  {confirmDeleteAddress === address.id ? (
                    <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs }}>
                      <AppText>Delete this address?</AppText>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busyAddressId === address.id}
                        onPress={() =>
                          runAddressAction(
                            address.id,
                            () => deleteAddress(address.id),
                            'Address deleted',
                          )
                        }
                      >
                        <AppText bold style={{ color: c.live }}>
                          {busyAddressId === address.id ? 'Deleting…' : 'Delete'}
                        </AppText>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setConfirmDeleteAddress(null)}
                      >
                        <AppText bold>Keep it</AppText>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs }}>
                      {address.isDefault ? null : (
                        <Pressable
                          accessibilityRole="button"
                          disabled={busyAddressId === address.id}
                          onPress={() =>
                            runAddressAction(
                              address.id,
                              () => updateAddress(address.id, { isDefault: true }),
                              'Default address updated',
                            )
                          }
                        >
                          <AppText bold style={{ color: c.brand }}>
                            {busyAddressId === address.id ? 'Updating…' : 'Make default'}
                          </AppText>
                        </Pressable>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setAddressMode({ kind: 'edit', address })}
                      >
                        <AppText bold style={{ color: c.brand }}>
                          Edit
                        </AppText>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setConfirmDeleteAddress(address.id)}
                      >
                        <AppText bold style={{ color: c.textSecondary }}>
                          Delete
                        </AppText>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            : null}
          {addressState.status === 'ready' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setAddressMode({ kind: 'add' })}
              style={{ marginTop: spacing.sm }}
            >
              <AppText bold style={{ color: c.brand }}>
                + Add address
              </AppText>
            </Pressable>
          ) : null}
        </>
      )}

      {/* ---------- Security ---------- */}
      <Section title="Security" />
      <AppText muted style={{ marginBottom: spacing.md }}>
        Keep your account yours.
      </AppText>

      {showChangePassword ? (
        <View style={{ marginBottom: spacing.lg }}>
          <AppText bold style={{ marginBottom: spacing.sm }}>
            Change password
          </AppText>
          <Field
            label="Current password"
            secure
            value={passwordForm.values.current}
            onChange={(v) => {
              passwordForm.setField('current', v);
              setPasswordServerError('');
            }}
            error={passwordForm.errors.current ?? passwordServerError}
          />
          <Field
            label="New password"
            secure
            value={passwordForm.values.password}
            onChange={(v) => passwordForm.setField('password', v)}
            error={passwordForm.errors.password}
          />
          <Field
            label="Confirm password"
            secure
            value={passwordForm.values.confirm}
            onChange={(v) => passwordForm.setField('confirm', v)}
            error={passwordForm.errors.confirm}
          />
          <Button label="Update password" loading={passwordBusy} onPress={submitChangePassword} />
          <Button secondary label="Cancel" disabled={passwordBusy} onPress={() => setShowChangePassword(false)} />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowChangePassword(true)}
          style={{ marginBottom: spacing.md }}
        >
          <AppText bold>Change password</AppText>
        </Pressable>
      )}

      {showChangeEmail ? (
        <View style={{ marginBottom: spacing.lg }}>
          {emailStep === 'confirm' ? (
            <>
              <AppText bold style={{ marginBottom: spacing.sm }}>
                Confirm your email
              </AppText>
              <AppText muted>{`We sent a code to ${pendingNewEmail}. Enter it below to finish.`}</AppText>
              <Field
                label="Confirmation code"
                value={emailToken}
                onChange={(v) => {
                  setEmailToken(v.trim());
                  setEmailTokenError('');
                }}
                autoCapitalize="none"
                error={emailTokenError}
              />
              <Button label="Confirm" loading={emailBusy} disabled={!emailToken} onPress={submitChangeEmailConfirm} />
              <Button secondary label="Back" disabled={emailBusy} onPress={() => setEmailStep('request')} />
            </>
          ) : (
            <>
              <AppText bold style={{ marginBottom: spacing.sm }}>
                Change email
              </AppText>
              <AppText muted>Your current email is {auth.user?.email}.</AppText>
              <Field
                label="Current password"
                secure
                value={emailForm.values.password}
                onChange={(v) => {
                  emailForm.setField('password', v);
                  setEmailServerError('');
                }}
                error={emailForm.errors.password}
              />
              <Field
                label="New email"
                value={emailForm.values.email}
                onChange={(v) => {
                  emailForm.setField('email', v);
                  setEmailServerError('');
                }}
                keyboardType="email-address"
                error={emailForm.errors.email ?? emailServerError}
              />
              <Button label="Send code" loading={emailBusy} onPress={submitChangeEmailRequest} />
              <Button secondary label="Cancel" disabled={emailBusy} onPress={() => setShowChangeEmail(false)} />
            </>
          )}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowChangeEmail(true)}
          style={{ marginBottom: spacing.md }}
        >
          <AppText bold>Change email</AppText>
          <AppText size={13} muted>
            {auth.user?.email}
          </AppText>
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (!verified) app.navigate(ROUTES.VERIFICATION);
        }}
        style={{ marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <View style={{ flex: 1 }}>
          <AppText bold>{verified ? 'Email verified' : 'Verify your email'}</AppText>
          <AppText size={13} muted>
            {auth.user?.email}
          </AppText>
        </View>
        <Badge label={verified ? 'VERIFIED' : 'NOT VERIFIED'} color={verified ? c.success : c.warning} />
      </Pressable>

      {/* ---------- Danger zone ---------- */}
      <Section title="Danger zone" />
      {showDeleteAccount ? (
        <View>
          <AppText bold size={16}>
            What happens when you delete your account
          </AppText>
          <AppText muted style={{ marginTop: spacing.sm }}>
            Your account is signed out everywhere immediately. It's permanently deleted 14 days
            from today — your email, phone, photo, and password are erased for good. Your past
            orders, payments, and reviews stay on record (required for receipts, taxes, and
            disputes), but with nothing identifying you left on them. You can cancel any time in
            the next 14 days by signing back in.
          </AppText>

          {deleteBlockers && (
            <View style={{ marginTop: spacing.lg }}>
              <AppText bold style={{ color: c.live }}>
                Resolve these first
              </AppText>
              {deleteBlockers.map((reason, i) => (
                <AppText key={i} style={{ color: c.live, marginTop: spacing.xs }}>
                  • {reason}
                </AppText>
              ))}
            </View>
          )}

          <Field
            label='Type "DELETE" to confirm'
            value={deleteConfirmText}
            onChange={setDeleteConfirmText}
            autoCapitalize="characters"
            error={deleteError}
          />
          <Button
            label="Delete my account"
            variant="danger"
            loading={deleteBusy}
            disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
            onPress={submitDeleteAccount}
          />
          <Button secondary label="Cancel" disabled={deleteBusy} onPress={() => setShowDeleteAccount(false)} />
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setShowDeleteAccount(true)}>
          <AppText bold style={{ color: c.live }}>
            Delete account
          </AppText>
        </Pressable>
      )}
    </Screen>
  );
}
