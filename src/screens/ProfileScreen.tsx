import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, Modal, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { PressableScale } from '../components/PressableScale';
import {
  createProfilePost,
  profilePostErrorMessage,
  subscribeProfilePosts,
  uploadProfileAvatar,
  uploadProfilePostPhoto
} from '../services/profilePostService';
import { colors } from '../theme';
import type { ProfilePost, UserProfile } from '../types';

type Props = {
  profile: UserProfile;
  onLogout: () => void;
  onProfileUpdate: (profile: UserProfile) => void;
};

type NotificationSettings = {
  inAppMessages: boolean;
  showNotifications: boolean;
  sound: boolean;
  vibrate: boolean;
  partyInvites: boolean;
};

const webBlurBackdropStyle = Platform.OS === 'web' ? ({ backdropFilter: 'blur(8px)' } as any) : null;
const interestSuggestions = [
  'Coffee',
  'Movies',
  'Music',
  'Gaming',
  'Books',
  'Gym',
  'Food trips',
  'Art',
  'Photography',
  'Anime',
  'Travel',
  'Cooking',
  'Tech',
  'Deep talks',
  'Quiet nights'
];

export function ProfileScreen({ profile, onLogout, onProfileUpdate }: Props) {
  const [postText, setPostText] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [postComposerVisible, setPostComposerVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<'main' | 'edit' | 'avatar' | 'notifications'>('main');
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [editName, setEditName] = useState(profile.nickname);
  const [editBirthday, setEditBirthday] = useState(profile.dateOfBirth);
  const [editInterests, setEditInterests] = useState(profile.interests.join(', '));
  const [avatarDraftUrl, setAvatarDraftUrl] = useState(profile.avatarUrl ?? '');
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings>({
    inAppMessages: true,
    showNotifications: true,
    sound: true,
    vibrate: true,
    partyInvites: true
  });
  const settingsProgress = useRef(new Animated.Value(0)).current;
  const settingsTranslateX = settingsProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [320, 0]
  });

  useEffect(() => {
    return subscribeProfilePosts(
      profile.id,
      setPosts,
      (message) => setStatus(message)
    );
  }, [profile.id]);

  useEffect(() => {
    setEditName(profile.nickname);
    setEditBirthday(profile.dateOfBirth);
    setEditInterests(profile.interests.join(', '));
    setAvatarDraftUrl(profile.avatarUrl ?? '');
  }, [profile]);

  async function publishPost() {
    setIsPosting(true);
    setStatus(null);

    try {
      await createProfilePost(profile, postText, photoUrl.trim() || undefined);
      setPostText('');
      setPhotoUrl('');
      setStatus('Posted publicly on your profile.');
      setPostComposerVisible(false);
    } catch (error) {
      setStatus(profilePostErrorMessage(error));
    } finally {
      setIsPosting(false);
    }
  }

  async function handleWebPhoto(file: Blob) {
    setIsPosting(true);
    setStatus('Uploading photo...');

    try {
      const nextPhotoUrl = await uploadProfilePostPhoto(profile.id, file);
      setPhotoUrl(nextPhotoUrl);
      setStatus('Photo ready. Add text if you want, then tap Post.');
    } catch (error) {
      setStatus(profilePostErrorMessage(error));
    } finally {
      setIsPosting(false);
    }
  }

  function openSettings() {
    setLogoutConfirmVisible(false);
    setSettingsPanel('main');
    setSettingsStatus(null);
    setSettingsVisible(true);
    Animated.timing(settingsProgress, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true
    }).start();
  }

  function closeSettings() {
    Animated.timing(settingsProgress, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true
    }).start(() => {
      setSettingsVisible(false);
      setLogoutConfirmVisible(false);
      setSettingsPanel('main');
    });
  }

  function saveProfileEdits() {
    const nextInterests = editInterests
      .split(',')
      .map((interest) => interest.trim())
      .filter(Boolean)
      .slice(0, 12);

    if (editName.trim().length < 2) {
      setSettingsStatus('Name must be at least 2 characters.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(editBirthday.trim())) {
      setSettingsStatus('Birthday must use YYYY-MM-DD format.');
      return;
    }

    if (nextInterests.length < 1) {
      setSettingsStatus('Add at least one interest.');
      return;
    }

    onProfileUpdate({
      ...profile,
      nickname: editName.trim(),
      dateOfBirth: editBirthday.trim(),
      interests: nextInterests
    });
    setSettingsStatus('Profile updated.');
    setSettingsPanel('main');
  }

  function saveAvatar(nextAvatarUrl = avatarDraftUrl) {
    const cleanAvatarUrl = nextAvatarUrl.trim();

    if (!cleanAvatarUrl) {
      setSettingsStatus('Paste or upload an avatar first.');
      return;
    }

    onProfileUpdate({
      ...profile,
      avatarUrl: cleanAvatarUrl
    });
    setAvatarDraftUrl(cleanAvatarUrl);
    setSettingsStatus('Avatar updated.');
    setSettingsPanel('main');
  }

  async function handleAvatarUpload(file: Blob) {
    setSettingsStatus('Uploading avatar...');

    try {
      const nextAvatarUrl = await uploadProfileAvatar(profile.id, file);
      saveAvatar(nextAvatarUrl);
    } catch (error) {
      setSettingsStatus(profilePostErrorMessage(error));
    }
  }

  function toggleNotification(key: keyof NotificationSettings) {
    setNotifications((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }

  function openPostComposer() {
    setStatus(null);
    setPostComposerVisible(true);
  }

  function closePostComposer() {
    if (isPosting) {
      return;
    }

    setPostComposerVisible(false);
    setStatus(null);
  }

  return (
    <View style={[styles.root, darkMode && styles.rootDark]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <AppText style={styles.screenTitle}>Profile</AppText>
          <PressableScale
            accessibilityRole="button"
            onPress={settingsVisible ? closeSettings : openSettings}
            style={styles.profileIconBadge}
          >
            <Ionicons name={settingsVisible ? 'close-outline' : 'settings-outline'} size={25} color={colors.ink} />
          </PressableScale>
        </View>

        <View style={styles.profileHero}>
          <View style={styles.avatarCircle}>
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person-circle-outline" size={82} color={colors.accent} />
            )}
          </View>
          <View style={styles.profileCopy}>
            <AppText style={styles.profileName}>{profile.nickname}</AppText>
            <AppText style={styles.profileMeta}>
              {profile.gender} - Looking for {profile.preference}
            </AppText>
            <View style={styles.interestRow}>
              {profile.interests.slice(0, 4).map((interest) => (
                <View key={interest} style={styles.interestChip}>
                  <AppText style={styles.interestText}>{interest}</AppText>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.publicNote}>
          <Ionicons name="earth-outline" size={18} color={colors.accent} />
          <AppText style={styles.publicNoteText}>
            Posts here are public on your profile, so other KaTalk members can see them when they open your profile.
          </AppText>
        </View>

        <View style={styles.feedHeader}>
          <AppText style={styles.sectionTitle}>Public posts</AppText>
          <AppText style={styles.feedCount}>{posts.length}</AppText>
        </View>

        {posts.length > 0 ? (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="reader-outline" size={24} color={colors.muted} />
            <AppText style={styles.emptyText}>No public posts yet.</AppText>
          </View>
        )}
      </ScrollView>
      {!settingsVisible ? (
        <PressableScale accessibilityRole="button" onPress={openPostComposer} style={styles.createPostFab}>
          <CreatePostIcon />
        </PressableScale>
      ) : null}
      <PostComposerModal
        visible={postComposerVisible}
        postText={postText}
        photoUrl={photoUrl}
        status={status}
        isPosting={isPosting}
        onTextChange={setPostText}
        onPhotoUrlChange={setPhotoUrl}
        onPhotoSelected={handleWebPhoto}
        onClose={closePostComposer}
        onPublish={publishPost}
      />
      {settingsVisible ? (
        <View style={styles.settingsOverlay} pointerEvents="box-none">
          <PressableScale
            accessibilityRole="button"
            onPress={closeSettings}
            style={[styles.settingsBackdrop, webBlurBackdropStyle]}
          />
          <Animated.View
            style={[
              styles.settingsDrawer,
              darkMode && styles.settingsDrawerDark,
              {
                transform: [{ translateX: settingsTranslateX }]
              }
            ]}
          >
            <View style={styles.drawerHandle} />
            <View style={styles.settingsHeader}>
              {settingsPanel === 'main' ? (
                <Ionicons name="settings-outline" size={20} color={colors.accent} />
              ) : (
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => {
                    setSettingsPanel('main');
                    setSettingsStatus(null);
                  }}
                  style={styles.backPanelButton}
                >
                  <Ionicons name="chevron-back" size={18} color={darkMode ? colors.onAccent : colors.ink} />
                </PressableScale>
              )}
              <AppText style={[styles.sectionTitle, darkMode && styles.drawerTitleDark]}>
                {settingsPanel === 'main'
                  ? 'Settings'
                  : settingsPanel === 'edit'
                    ? 'Edit Profile'
                    : settingsPanel === 'avatar'
                      ? 'Avatar'
                      : 'Notifications'}
              </AppText>
              <PressableScale
                accessibilityRole="button"
                onPress={closeSettings}
                style={[styles.closeDrawerButton, darkMode && styles.closeDrawerButtonDark]}
              >
                <Ionicons name="close-outline" size={20} color={darkMode ? colors.onAccent : colors.ink} />
              </PressableScale>
            </View>
            {settingsStatus ? (
              <AppText style={[styles.settingsStatusText, darkMode && styles.drawerMutedText]}>
                {settingsStatus}
              </AppText>
            ) : null}
            {settingsPanel === 'main' ? (
              <SettingsMainPanel
                darkMode={darkMode}
                profile={profile}
                onDarkModeChange={setDarkMode}
                onOpenEdit={() => setSettingsPanel('edit')}
                onOpenAvatar={() => setSettingsPanel('avatar')}
                onOpenNotifications={() => setSettingsPanel('notifications')}
                logoutConfirmVisible={logoutConfirmVisible}
                onStartLogout={() => setLogoutConfirmVisible(true)}
                onCancelLogout={() => setLogoutConfirmVisible(false)}
                onLogout={onLogout}
              />
            ) : null}
            {settingsPanel === 'edit' ? (
              <EditProfilePanel
                editName={editName}
                editBirthday={editBirthday}
                editInterests={editInterests}
                onNameChange={setEditName}
                onBirthdayChange={setEditBirthday}
                onInterestsChange={setEditInterests}
                onSave={saveProfileEdits}
              />
            ) : null}
            {settingsPanel === 'avatar' ? (
              <AvatarPanel
                avatarUrl={avatarDraftUrl}
                onAvatarUrlChange={setAvatarDraftUrl}
                onSave={() => saveAvatar()}
                onUpload={handleAvatarUpload}
              />
            ) : null}
            {settingsPanel === 'notifications' ? (
              <NotificationsPanel notifications={notifications} onToggle={toggleNotification} />
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

function CreatePostIcon() {
  return (
    <View style={styles.createPostIcon}>
      <Ionicons name="add" size={34} color={colors.onAccent} style={styles.createPostPlus} />
      <Ionicons name="leaf" size={38} color={colors.onAccent} style={styles.createPostQuill} />
    </View>
  );
}

function PostComposerModal({
  visible,
  postText,
  photoUrl,
  status,
  isPosting,
  onTextChange,
  onPhotoUrlChange,
  onPhotoSelected,
  onClose,
  onPublish
}: {
  visible: boolean;
  postText: string;
  photoUrl: string;
  status: string | null;
  isPosting: boolean;
  onTextChange: (value: string) => void;
  onPhotoUrlChange: (value: string) => void;
  onPhotoSelected: (file: Blob) => void;
  onClose: () => void;
  onPublish: () => void;
}) {
  const canPublish = Boolean(postText.trim() || photoUrl.trim()) && !isPosting;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.postComposerOverlay}>
        <PressableScale accessibilityRole="button" onPress={onClose} style={styles.postComposerBackdrop} />
        <View style={styles.postComposerSheet}>
          <View style={styles.postComposerHeader}>
            <CreatePostIcon />
            <View style={styles.postComposerTitleBlock}>
              <AppText style={styles.postComposerTitle}>Create post</AppText>
              <AppText style={styles.postComposerMeta}>Post a picture or update onto your wall.</AppText>
            </View>
            <PressableScale accessibilityRole="button" onPress={onClose} style={styles.postComposerClose}>
              <Ionicons name="close-outline" size={20} color={colors.ink} />
            </PressableScale>
          </View>

          <TextInput
            value={postText}
            onChangeText={onTextChange}
            placeholder="Share anything you want people to know about you"
            placeholderTextColor={colors.muted}
            multiline
            style={styles.postInput}
          />
          <TextInput
            value={photoUrl}
            onChangeText={onPhotoUrlChange}
            placeholder="Photo URL, or upload from web below"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={styles.photoInput}
          />
          <WebPhotoPicker disabled={isPosting} onPhotoSelected={onPhotoSelected} />
          {photoUrl.trim() ? <Image source={{ uri: photoUrl.trim() }} style={styles.previewImage} /> : null}
          {status ? <AppText style={styles.statusText}>{status}</AppText> : null}

          <View style={styles.postComposerActions}>
            <PressableScale
              accessibilityRole="button"
              onPress={onClose}
              disabled={isPosting}
              style={styles.cancelPostButton}
            >
              <AppText style={styles.cancelPostText}>Cancel</AppText>
            </PressableScale>
            <PrimaryButton
              label={isPosting ? 'Posting...' : 'Post'}
              icon="add-circle-outline"
              disabled={!canPublish}
              onPress={onPublish}
              style={styles.publishPostButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SettingsMainPanel({
  darkMode,
  profile,
  onDarkModeChange,
  onOpenEdit,
  onOpenAvatar,
  onOpenNotifications,
  logoutConfirmVisible,
  onStartLogout,
  onCancelLogout,
  onLogout
}: {
  darkMode: boolean;
  profile: UserProfile;
  onDarkModeChange: (value: boolean) => void;
  onOpenEdit: () => void;
  onOpenAvatar: () => void;
  onOpenNotifications: () => void;
  logoutConfirmVisible: boolean;
  onStartLogout: () => void;
  onCancelLogout: () => void;
  onLogout: () => void;
}) {
  return (
    <ScrollView
      style={styles.settingsPanelScroller}
      contentContainerStyle={styles.settingsPanelContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.settingsSection}>
        <AppText style={[styles.settingsSectionLabel, darkMode && styles.drawerMutedText]}>Mode</AppText>
        <SwitchSettingRow
          icon={darkMode ? 'moon-outline' : 'sunny-outline'}
          title={darkMode ? 'Dark mode' : 'Light mode'}
          meta="Switch the profile area between light and dark."
          value={darkMode}
          onValueChange={onDarkModeChange}
        />
      </View>

      <View style={styles.settingsSection}>
        <AppText style={[styles.settingsSectionLabel, darkMode && styles.drawerMutedText]}>Profile</AppText>
        <SettingsOption
          icon="create-outline"
          title="Edit profile"
          meta="Name, birthday, and interests"
          onPress={onOpenEdit}
        />
        <SettingsOption
          icon="image-outline"
          title="Avatar"
          meta="Change your profile picture"
          onPress={onOpenAvatar}
        />
        <SettingsOption
          icon="notifications-outline"
          title="Notifications"
          meta="Messages, sound, vibration, invites"
          onPress={onOpenNotifications}
        />
      </View>

      <View style={styles.settingsSection}>
        <AppText style={[styles.settingsSectionLabel, darkMode && styles.drawerMutedText]}>Account</AppText>
        <View style={styles.settingRow}>
          <View style={styles.settingTextBlock}>
            <AppText style={styles.settingTitle}>Signed in as</AppText>
            <AppText style={styles.settingMeta}>{profile.authContact || profile.nickname}</AppText>
          </View>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
        </View>
      </View>

      {logoutConfirmVisible ? (
        <View style={styles.logoutConfirmBox}>
          <AppText style={styles.logoutConfirmTitle}>Log out?</AppText>
          <AppText style={styles.logoutConfirmCopy}>
            This clears the saved session on this device so another account can sign in.
          </AppText>
          <View style={styles.logoutConfirmActions}>
            <PressableScale accessibilityRole="button" onPress={onCancelLogout} style={styles.cancelLogoutButton}>
              <AppText style={styles.cancelLogoutText}>Cancel</AppText>
            </PressableScale>
            <PressableScale accessibilityRole="button" onPress={onLogout} style={styles.confirmLogoutButton}>
              <AppText style={styles.confirmLogoutText}>Log out</AppText>
            </PressableScale>
          </View>
        </View>
      ) : (
        <PressableScale accessibilityRole="button" onPress={onStartLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <AppText style={styles.logoutText}>Log out</AppText>
        </PressableScale>
      )}
    </ScrollView>
  );
}

function EditProfilePanel({
  editName,
  editBirthday,
  editInterests,
  onNameChange,
  onBirthdayChange,
  onInterestsChange,
  onSave
}: {
  editName: string;
  editBirthday: string;
  editInterests: string;
  onNameChange: (value: string) => void;
  onBirthdayChange: (value: string) => void;
  onInterestsChange: (value: string) => void;
  onSave: () => void;
}) {
  function addInterest(interest: string) {
    const current = editInterests
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (current.some((item) => item.toLowerCase() === interest.toLowerCase())) {
      return;
    }

    onInterestsChange([...current, interest].join(', '));
  }

  return (
    <ScrollView
      style={styles.settingsPanelScroller}
      contentContainerStyle={styles.settingsPanelContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.settingsSection}>
        <AppText style={styles.settingsSectionLabel}>Basics</AppText>
        <TextInput
          value={editName}
          onChangeText={onNameChange}
          placeholder="Display name"
          placeholderTextColor={colors.muted}
          style={styles.settingsInput}
        />
        <TextInput
          value={editBirthday}
          onChangeText={onBirthdayChange}
          placeholder="Birthday, YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          keyboardType="numbers-and-punctuation"
          style={styles.settingsInput}
        />
      </View>

      <View style={styles.settingsSection}>
        <AppText style={styles.settingsSectionLabel}>Interests</AppText>
        <TextInput
          value={editInterests}
          onChangeText={onInterestsChange}
          placeholder="Coffee, Music, Deep talks"
          placeholderTextColor={colors.muted}
          multiline
          style={[styles.settingsInput, styles.settingsTextArea]}
        />
        <View style={styles.suggestionWrap}>
          {interestSuggestions.map((interest) => (
            <PressableScale
              key={interest}
              accessibilityRole="button"
              onPress={() => addInterest(interest)}
              style={styles.suggestionChip}
            >
              <AppText style={styles.suggestionText}>{interest}</AppText>
            </PressableScale>
          ))}
        </View>
      </View>

      <PrimaryButton label="Save profile" icon="save-outline" onPress={onSave} />
    </ScrollView>
  );
}

function AvatarPanel({
  avatarUrl,
  onAvatarUrlChange,
  onSave,
  onUpload
}: {
  avatarUrl: string;
  onAvatarUrlChange: (value: string) => void;
  onSave: () => void;
  onUpload: (file: Blob) => void;
}) {
  const cleanAvatarUrl = avatarUrl.trim();

  return (
    <ScrollView
      style={styles.settingsPanelScroller}
      contentContainerStyle={styles.settingsPanelContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.avatarPreview}>
        {cleanAvatarUrl ? (
          <Image source={{ uri: cleanAvatarUrl }} style={styles.avatarPreviewImage} />
        ) : (
          <Ionicons name="person-circle-outline" size={82} color={colors.accent} />
        )}
      </View>
      <TextInput
        value={avatarUrl}
        onChangeText={onAvatarUrlChange}
        placeholder="Paste avatar photo URL"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={styles.settingsInput}
      />
      <WebPhotoPicker disabled={false} onPhotoSelected={onUpload} />
      <PrimaryButton label="Save avatar" icon="image-outline" onPress={onSave} />
    </ScrollView>
  );
}

function NotificationsPanel({
  notifications,
  onToggle
}: {
  notifications: NotificationSettings;
  onToggle: (key: keyof NotificationSettings) => void;
}) {
  return (
    <ScrollView
      style={styles.settingsPanelScroller}
      contentContainerStyle={styles.settingsPanelContent}
      showsVerticalScrollIndicator={false}
    >
      <SwitchSettingRow
        icon="chatbubble-ellipses-outline"
        title="In-app messages"
        meta="Saved-match and profile message alerts"
        value={notifications.inAppMessages}
        onValueChange={() => onToggle('inAppMessages')}
      />
      <SwitchSettingRow
        icon="notifications-outline"
        title="Show notifications"
        meta="Allow visible alerts from KaTalk"
        value={notifications.showNotifications}
        onValueChange={() => onToggle('showNotifications')}
      />
      <SwitchSettingRow
        icon="volume-high-outline"
        title="Sound"
        meta="Play sound for new alerts"
        value={notifications.sound}
        onValueChange={() => onToggle('sound')}
      />
      <SwitchSettingRow
        icon="phone-portrait-outline"
        title="Vibrate"
        meta="Use phone vibration for alerts"
        value={notifications.vibrate}
        onValueChange={() => onToggle('vibrate')}
      />
      <SwitchSettingRow
        icon="people-outline"
        title="Receive party invitations"
        meta="Allow group room and event invitations"
        value={notifications.partyInvites}
        onValueChange={() => onToggle('partyInvites')}
      />
    </ScrollView>
  );
}

function SettingsOption({
  icon,
  title,
  meta,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <PressableScale accessibilityRole="button" onPress={onPress} style={styles.settingsOption}>
      <View style={styles.optionIcon}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.optionTextBlock}>
        <AppText style={styles.optionTitle}>{title}</AppText>
        <AppText style={styles.optionMeta}>{meta}</AppText>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </PressableScale>
  );
}

function SwitchSettingRow({
  icon,
  title,
  meta,
  value,
  onValueChange
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  meta: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.optionIcon}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <View style={styles.settingTextBlock}>
        <AppText style={styles.settingTitle}>{title}</AppText>
        <AppText style={styles.settingMeta}>{meta}</AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.line, true: colors.accentSoft }}
        thumbColor={value ? colors.accent : colors.surface}
      />
    </View>
  );
}

function WebPhotoPicker({
  disabled,
  onPhotoSelected
}: {
  disabled: boolean;
  onPhotoSelected: (file: Blob) => void;
}) {
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.nativeUploadNote}>
        <Ionicons name="phone-portrait-outline" size={16} color={colors.muted} />
        <AppText style={styles.nativeUploadText}>
          Mobile gallery upload needs Expo Image Picker. For now, paste a photo URL.
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.webUploadBox}>
      {React.createElement('input', {
        type: 'file',
        accept: 'image/*',
        disabled,
        onChange: (event: { target?: { files?: ArrayLike<Blob> | null; value?: string } }) => {
          const file = event.target?.files?.[0];

          if (!file) {
            return;
          }

          onPhotoSelected(file);

          if (event.target) {
            event.target.value = '';
          }
        },
        style: {
          width: '100%',
          fontSize: 13,
          fontWeight: 700,
          color: colors.ink
        }
      })}
    </View>
  );
}

function PostCard({ post }: { post: ProfilePost }) {
  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.postAvatar}>
          <Ionicons name="person" size={16} color={colors.onAccent} />
        </View>
        <View style={styles.postAuthorBlock}>
          <AppText style={styles.postAuthor}>{post.authorNickname}</AppText>
          <AppText style={styles.postTime}>{post.createdAt.toLocaleDateString()}</AppText>
        </View>
        <PressableScale
          accessibilityRole="button"
          onPress={() => Alert.alert('Public post', 'This post is visible on the member profile.')}
          style={styles.postMenu}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
        </PressableScale>
      </View>
      {post.body ? <AppText style={styles.postBody}>{post.body}</AppText> : null}
      {post.photoUrl ? <Image source={{ uri: post.photoUrl }} style={styles.postImage} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    position: 'relative'
  },
  rootDark: {
    backgroundColor: '#121418'
  },
  content: {
    padding: 16,
    paddingBottom: 112,
    gap: 14
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  screenTitle: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900'
  },
  profileIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  settingsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  settingsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: 'rgba(16, 17, 20, 0.28)'
  },
  settingsDrawer: {
    zIndex: 1,
    width: '56%',
    minWidth: 230,
    maxWidth: 340,
    height: '100%',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 24,
    borderTopLeftRadius: 26,
    borderBottomLeftRadius: 26,
    borderLeftWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    shadowColor: '#101114',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: -8, height: 0 },
    elevation: 12
  },
  settingsDrawerDark: {
    borderColor: '#2A2E38',
    backgroundColor: '#151820'
  },
  drawerHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 2
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  drawerTitleDark: {
    color: colors.onAccent
  },
  drawerMutedText: {
    color: '#BBC1CC'
  },
  backPanelButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)'
  },
  closeDrawerButton: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  closeDrawerButtonDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)'
  },
  settingsStatusText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  settingsPanelScroller: {
    flex: 1
  },
  settingsPanelContent: {
    gap: 12,
    paddingBottom: 10
  },
  settingsSection: {
    gap: 8
  },
  settingsSectionLabel: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 0,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  settingRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted
  },
  settingTextBlock: {
    flex: 1
  },
  settingTitle: {
    fontWeight: '900'
  },
  settingMeta: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  settingsOption: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted
  },
  optionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft
  },
  optionTextBlock: {
    flex: 1
  },
  optionTitle: {
    fontWeight: '900'
  },
  optionMeta: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700'
  },
  settingsInput: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.surfaceMuted,
    fontWeight: '800'
  },
  settingsTextArea: {
    minHeight: 88,
    textAlignVertical: 'top'
  },
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  suggestionChip: {
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.accentSoft
  },
  suggestionText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900'
  },
  avatarPreview: {
    width: 118,
    height: 118,
    borderRadius: 59,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.accentSoft
  },
  avatarPreviewImage: {
    width: '100%',
    height: '100%'
  },
  logoutButton: {
    minHeight: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.dangerSoft
  },
  logoutText: {
    color: colors.danger,
    fontWeight: '900'
  },
  logoutConfirmBox: {
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.dangerSoft
  },
  logoutConfirmTitle: {
    color: colors.danger,
    fontWeight: '900'
  },
  logoutConfirmCopy: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  logoutConfirmActions: {
    flexDirection: 'row',
    gap: 8
  },
  cancelLogoutButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  cancelLogoutText: {
    fontWeight: '900'
  },
  confirmLogoutButton: {
    flex: 1.2,
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger
  },
  confirmLogoutText: {
    color: colors.onAccent,
    fontWeight: '900',
    textAlign: 'center'
  },
  profileHero: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.accentSoft
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  profileCopy: {
    flex: 1,
    gap: 6
  },
  profileName: {
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900'
  },
  profileMeta: {
    color: colors.muted,
    fontWeight: '700'
  },
  interestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2
  },
  interestChip: {
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: colors.surfaceMuted
  },
  interestText: {
    fontSize: 11,
    fontWeight: '800'
  },
  publicNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.accentSoft
  },
  publicNoteText: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800'
  },
  composer: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface
  },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900'
  },
  postInput: {
    minHeight: 96,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    color: colors.ink,
    backgroundColor: colors.surfaceMuted,
    fontWeight: '700'
  },
  photoInput: {
    minHeight: 46,
    borderRadius: 23,
    paddingHorizontal: 14,
    color: colors.ink,
    backgroundColor: colors.surfaceMuted,
    fontWeight: '700'
  },
  webUploadBox: {
    minHeight: 44,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background
  },
  nativeUploadNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted
  },
  nativeUploadText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  previewImage: {
    width: '100%',
    height: 190,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted
  },
  statusText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  createPostFab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    zIndex: 8
  },
  createPostIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B6AF2',
    shadowColor: '#8B6AF2',
    shadowOpacity: 0.38,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5
  },
  createPostPlus: {
    position: 'absolute',
    left: 13,
    top: 14
  },
  createPostQuill: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    transform: [{ rotate: '-32deg' }]
  },
  postComposerOverlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  postComposerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 17, 20, 0.42)'
  },
  postComposerSheet: {
    gap: 10,
    padding: 16,
    paddingBottom: 22,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.line
  },
  postComposerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  postComposerTitleBlock: {
    flex: 1
  },
  postComposerTitle: {
    fontSize: 18,
    fontWeight: '900'
  },
  postComposerMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  postComposerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  postComposerActions: {
    flexDirection: 'row',
    gap: 10
  },
  cancelPostButton: {
    flex: 0.8,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  cancelPostText: {
    fontWeight: '900'
  },
  publishPostButton: {
    flex: 1.2
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  feedCount: {
    minWidth: 26,
    textAlign: 'center',
    borderRadius: 13,
    overflow: 'hidden',
    paddingVertical: 4,
    color: colors.onAccent,
    backgroundColor: colors.accent,
    fontWeight: '900'
  },
  emptyState: {
    minHeight: 92,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surfaceMuted
  },
  emptyText: {
    color: colors.muted,
    fontWeight: '800'
  },
  postCard: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  postAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  postAuthorBlock: {
    flex: 1
  },
  postAuthor: {
    fontWeight: '900'
  },
  postTime: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700'
  },
  postMenu: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  postBody: {
    lineHeight: 20,
    fontWeight: '700'
  },
  postImage: {
    width: '100%',
    height: 230,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted
  }
});
