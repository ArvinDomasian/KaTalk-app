import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, Linking, Modal, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { PressableScale } from '../components/PressableScale';
import {
  createProfilePost,
  profilePostErrorMessage,
  subscribeProfilePosts,
  uploadProfileAvatar,
  uploadProfilePostPhoto,
  uploadProfileVoiceClip
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
const emojiOptions = ['😊', '😂', '😍', '🥰', '😎', '😭', '🔥', '✨', '❤️', '👍'];

export function ProfileScreen({ profile, onLogout, onProfileUpdate }: Props) {
  const [postText, setPostText] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [postComposerVisible, setPostComposerVisible] = useState(false);
  const [postVisibility, setPostVisibility] = useState<ProfilePost['visibility']>('public');
  const [selectedEmoji, setSelectedEmoji] = useState('');
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [musicComposerVisible, setMusicComposerVisible] = useState(false);
  const [musicUrl, setMusicUrl] = useState('');
  const [musicTitle, setMusicTitle] = useState('');
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
  const voiceRecorderRef = useRef<any>(null);
  const voiceStreamRef = useRef<any>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

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

  useEffect(() => () => {
    stopVoiceStream();
  }, []);

  async function publishPost() {
    setIsPosting(true);
    setStatus(null);

    try {
      const createdPost = await createProfilePost(profile, postText, {
        photoUrl: photoUrl.trim() || undefined,
        emoji: selectedEmoji || undefined,
        voiceUrl: voiceUrl || undefined,
        musicUrl: musicUrl.trim() || undefined,
        musicTitle: musicTitle.trim() || undefined,
        visibility: postVisibility
      });
      setPosts((current) =>
        current.some((post) => post.id === createdPost.id) ? current : [createdPost, ...current]
      );
      setPostText('');
      setPhotoUrl('');
      setSelectedEmoji('');
      setVoiceUrl('');
      setMusicUrl('');
      setMusicTitle('');
      setPostVisibility('public');
      setEmojiPickerVisible(false);
      setMusicComposerVisible(false);
      setStatus(
        createdPost.visibility === 'public'
          ? 'Posted publicly on the wall.'
          : 'Posted privately to your wall.'
      );
      setPostComposerVisible(false);
    } catch (error) {
      const message = profilePostErrorMessage(error);
      setStatus(message);
      Alert.alert('Post not sent', message);
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
    setPostVisibility('public');
    setPostComposerVisible(true);
  }

  function closePostComposer() {
    if (isPosting) {
      return;
    }

    setPostComposerVisible(false);
    setStatus(null);
  }

  function addTextToPost(text: string) {
    setPostText((current) => {
      if (!current.trim()) {
        return text;
      }

      return `${current}${current.endsWith(' ') ? '' : ' '}${text}`;
    });
  }

  function togglePostVisibility() {
    setPostVisibility((current) => {
      const next = current === 'public' ? 'private' : 'public';
      setStatus(
        next === 'public'
          ? 'This post will be visible on the public wall.'
          : 'This post will be private to your wall.'
      );
      return next;
    });
  }

  function togglePostLocation() {
    setStatus((current) =>
      current === 'Location added to this post.' ? 'Location removed from this post.' : 'Location added to this post.'
    );
  }

  function stopVoiceStream() {
    const stream = voiceStreamRef.current;

    stream?.getTracks?.().forEach((track: { stop?: () => void }) => track.stop?.());
    voiceStreamRef.current = null;
  }

  async function toggleVoiceRecording() {
    if (isRecordingVoice) {
      voiceRecorderRef.current?.stop?.();
      return;
    }

    if (Platform.OS !== 'web') {
      setStatus('Voice messages on phone builds need the Expo audio package before recording can turn on.');
      return;
    }

    const mediaDevices = (globalThis as any).navigator?.mediaDevices;
    const MediaRecorderApi = (globalThis as any).MediaRecorder;

    if (!mediaDevices?.getUserMedia || !MediaRecorderApi) {
      setStatus('Voice recording is not available in this browser.');
      return;
    }

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorderApi(stream);

      voiceChunksRef.current = [];
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;

      recorder.ondataavailable = (event: { data?: Blob }) => {
        if (event.data?.size) {
          voiceChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecordingVoice(false);
        setIsPosting(true);
        setStatus('Saving voice message...');

        try {
          const voiceBlob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const nextVoiceUrl = await uploadProfileVoiceClip(profile.id, voiceBlob);

          setVoiceUrl(nextVoiceUrl);
          setStatus('Voice message attached.');
        } catch (error) {
          setStatus(profilePostErrorMessage(error));
        } finally {
          setIsPosting(false);
          stopVoiceStream();
          voiceRecorderRef.current = null;
          voiceChunksRef.current = [];
        }
      };

      recorder.start();
      setVoiceUrl('');
      setIsRecordingVoice(true);
      setStatus('Recording voice message. Tap the microphone again to stop.');
    } catch {
      setIsRecordingVoice(false);
      stopVoiceStream();
      setStatus('Microphone permission was not allowed.');
    }
  }

  function selectEmoji(emoji: string) {
    setSelectedEmoji(emoji);
    setEmojiPickerVisible(false);
    setStatus('Emoji attached to this post.');
  }

  function saveMusicAttachment() {
    if (!musicUrl.trim()) {
      setStatus('Paste a Spotify or music clip link first.');
      return;
    }

    setMusicComposerVisible(false);
    setStatus('Music attached to this post.');
  }

  function handleComposerTool(tool: 'emoji' | 'voice' | 'image' | 'options' | 'music' | 'hashtag') {
    if (tool === 'emoji') {
      setEmojiPickerVisible((current) => !current);
      setMusicComposerVisible(false);
      return;
    }

    if (tool === 'voice') {
      void toggleVoiceRecording();
      return;
    }

    if (tool === 'image') {
      setStatus('Tap the picture square to add a photo.');
      return;
    }

    if (tool === 'options') {
      togglePostLocation();
      return;
    }

    if (tool === 'music') {
      setMusicComposerVisible((current) => !current);
      setEmojiPickerVisible(false);
      return;
    }

    addTextToPost('#');
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
        visibility={postVisibility}
        selectedEmoji={selectedEmoji}
        emojiPickerVisible={emojiPickerVisible}
        voiceUrl={voiceUrl}
        isRecordingVoice={isRecordingVoice}
        musicComposerVisible={musicComposerVisible}
        musicUrl={musicUrl}
        musicTitle={musicTitle}
        onTextChange={setPostText}
        onPhotoSelected={handleWebPhoto}
        onClose={closePostComposer}
        onPublish={publishPost}
        onToggleVisibility={togglePostVisibility}
        onToggleLocation={togglePostLocation}
        onEmojiSelected={selectEmoji}
        onMusicUrlChange={setMusicUrl}
        onMusicTitleChange={setMusicTitle}
        onSaveMusic={saveMusicAttachment}
        onToolPress={handleComposerTool}
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

function openExternalUrl(url: string) {
  if (!url.trim()) {
    return;
  }

  Linking.openURL(url.trim()).catch(() => {
    Alert.alert('Music link', url.trim());
  });
}

function PostComposerModal({
  visible,
  postText,
  photoUrl,
  status,
  isPosting,
  visibility,
  selectedEmoji,
  emojiPickerVisible,
  voiceUrl,
  isRecordingVoice,
  musicComposerVisible,
  musicUrl,
  musicTitle,
  onTextChange,
  onPhotoSelected,
  onClose,
  onPublish,
  onToggleVisibility,
  onToggleLocation,
  onEmojiSelected,
  onMusicUrlChange,
  onMusicTitleChange,
  onSaveMusic,
  onToolPress
}: {
  visible: boolean;
  postText: string;
  photoUrl: string;
  status: string | null;
  isPosting: boolean;
  visibility: ProfilePost['visibility'];
  selectedEmoji: string;
  emojiPickerVisible: boolean;
  voiceUrl: string;
  isRecordingVoice: boolean;
  musicComposerVisible: boolean;
  musicUrl: string;
  musicTitle: string;
  onTextChange: (value: string) => void;
  onPhotoSelected: (file: Blob) => void;
  onClose: () => void;
  onPublish: () => void;
  onToggleVisibility: () => void;
  onToggleLocation: () => void;
  onEmojiSelected: (emoji: string) => void;
  onMusicUrlChange: (value: string) => void;
  onMusicTitleChange: (value: string) => void;
  onSaveMusic: () => void;
  onToolPress: (tool: 'emoji' | 'voice' | 'image' | 'options' | 'music' | 'hashtag') => void;
}) {
  const canPublish = Boolean(postText.trim() || photoUrl.trim() || selectedEmoji || voiceUrl || musicUrl.trim()) && !isPosting;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.postComposerScreen}>
        <View style={styles.postComposerTopBar}>
          <PressableScale
            accessibilityRole="button"
            onPress={onClose}
            disabled={isPosting}
            style={styles.postComposerCloseIcon}
          >
            <Ionicons name="close-outline" size={31} color={colors.ink} />
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            onPress={onPublish}
            disabled={!canPublish}
            style={[styles.postComposerSendButton, !canPublish && styles.postComposerSendButtonDisabled]}
          >
            <AppText style={[styles.postComposerSendText, !canPublish && styles.postComposerSendTextDisabled]}>
              {isPosting ? 'Sending...' : 'Send'}
            </AppText>
          </PressableScale>
        </View>

        <View style={styles.postComposerBody}>
          <PostImageTile
            photoUrl={photoUrl.trim()}
            disabled={isPosting}
            onPhotoSelected={onPhotoSelected}
          />
          <TextInput
            value={postText}
            onChangeText={onTextChange}
            placeholder="What's on your mind?"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={1000}
            style={styles.wallPostInput}
          />
          {emojiPickerVisible ? (
            <EmojiDock selectedEmoji={selectedEmoji} onEmojiSelected={onEmojiSelected} />
          ) : null}
          {selectedEmoji ? (
            <View style={styles.composerAttachmentRow}>
              <AppText style={styles.composerEmojiPreview}>{selectedEmoji}</AppText>
              <AppText style={styles.composerAttachmentText}>Emoji attached</AppText>
            </View>
          ) : null}
          {isRecordingVoice ? (
            <View style={[styles.composerAttachmentRow, styles.recordingAttachment]}>
              <Ionicons name="radio-button-on" size={18} color={colors.danger} />
              <AppText style={styles.composerAttachmentText}>Recording voice message...</AppText>
            </View>
          ) : null}
          {voiceUrl ? <VoiceAttachment voiceUrl={voiceUrl} label="Voice message attached" /> : null}
          {musicComposerVisible ? (
            <MusicComposerPanel
              musicUrl={musicUrl}
              musicTitle={musicTitle}
              onMusicUrlChange={onMusicUrlChange}
              onMusicTitleChange={onMusicTitleChange}
              onSaveMusic={onSaveMusic}
            />
          ) : null}
          {musicUrl.trim() && !musicComposerVisible ? (
            <MusicAttachment musicUrl={musicUrl} musicTitle={musicTitle} />
          ) : null}
          {status ? <AppText style={styles.statusText}>{status}</AppText> : null}
        </View>

        <View style={styles.postComposerFooter}>
          <View style={styles.postComposerFooterTop}>
            <PressableScale accessibilityRole="button" onPress={onToggleLocation} style={styles.locationPill}>
              <Ionicons name="location" size={16} color="#8B6AF2" />
              <AppText style={styles.locationPillText}>Add location</AppText>
            </PressableScale>
            <AppText style={styles.characterCount}>{postText.length}/1000</AppText>
          </View>

          <View style={styles.postToolBar}>
            <ComposerToolButton icon="happy-outline" onPress={() => onToolPress('emoji')} />
            <ComposerToolButton
              icon={isRecordingVoice ? 'stop-circle-outline' : 'mic-circle-outline'}
              active={isRecordingVoice}
              onPress={() => onToolPress('voice')}
            />
            <ComposerPhotoToolButton
              disabled={isPosting}
              onPhotoSelected={onPhotoSelected}
              onUnavailable={() => onToolPress('image')}
            />
            <ComposerToolButton icon="options-outline" onPress={() => onToolPress('options')} />
            <ComposerToolButton
              icon="musical-notes-outline"
              active={musicComposerVisible || Boolean(musicUrl.trim())}
              onPress={() => onToolPress('music')}
            />
            <PressableScale accessibilityRole="button" onPress={() => onToolPress('hashtag')} style={styles.hashToolButton}>
              <AppText style={styles.hashTool}>#</AppText>
            </PressableScale>
            <PressableScale accessibilityRole="button" onPress={onToggleVisibility} style={styles.publicTool}>
              <Ionicons
                name={visibility === 'public' ? 'earth-outline' : 'lock-closed-outline'}
                size={15}
                color={colors.ink}
              />
              <AppText style={styles.publicToolText}>
                {visibility === 'public' ? 'Public' : 'Private'}
              </AppText>
              <Ionicons name="chevron-forward" size={17} color={colors.ink} />
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EmojiDock({
  selectedEmoji,
  onEmojiSelected
}: {
  selectedEmoji: string;
  onEmojiSelected: (emoji: string) => void;
}) {
  return (
    <View style={styles.emojiDock}>
      {emojiOptions.map((emoji) => (
        <PressableScale
          key={emoji}
          accessibilityRole="button"
          onPress={() => onEmojiSelected(emoji)}
          style={[styles.emojiOption, selectedEmoji === emoji && styles.emojiOptionSelected]}
        >
          <AppText style={styles.emojiOptionText}>{emoji}</AppText>
        </PressableScale>
      ))}
    </View>
  );
}

function MusicComposerPanel({
  musicUrl,
  musicTitle,
  onMusicUrlChange,
  onMusicTitleChange,
  onSaveMusic
}: {
  musicUrl: string;
  musicTitle: string;
  onMusicUrlChange: (value: string) => void;
  onMusicTitleChange: (value: string) => void;
  onSaveMusic: () => void;
}) {
  return (
    <View style={styles.musicComposerPanel}>
      <View style={styles.musicPanelTitleRow}>
        <Ionicons name="musical-notes-outline" size={17} color="#8B6AF2" />
        <AppText style={styles.musicPanelTitle}>Music clip</AppText>
      </View>
      <TextInput
        value={musicUrl}
        onChangeText={onMusicUrlChange}
        placeholder="Paste Spotify or music link"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={styles.musicInput}
      />
      <TextInput
        value={musicTitle}
        onChangeText={onMusicTitleChange}
        placeholder="Song title, artist, or mood"
        placeholderTextColor={colors.muted}
        style={styles.musicInput}
      />
      <PressableScale accessibilityRole="button" onPress={onSaveMusic} style={styles.musicSaveButton}>
        <AppText style={styles.musicSaveText}>Attach music</AppText>
      </PressableScale>
    </View>
  );
}

function VoiceAttachment({ voiceUrl, label }: { voiceUrl: string; label: string }) {
  return (
    <View style={styles.composerAttachmentRow}>
      <Ionicons name="mic-outline" size={18} color="#8B6AF2" />
      <View style={styles.attachmentCopy}>
        <AppText style={styles.composerAttachmentText}>{label}</AppText>
        {Platform.OS === 'web'
          ? React.createElement('audio', {
              controls: true,
              src: voiceUrl,
              style: {
                width: '100%',
                height: 32,
                marginTop: 6
              }
            })
          : (
            <AppText style={styles.attachmentMeta}>Voice playback appears in web preview for now.</AppText>
          )}
      </View>
    </View>
  );
}

function MusicAttachment({
  musicUrl,
  musicTitle
}: {
  musicUrl: string;
  musicTitle?: string;
}) {
  const label = musicTitle?.trim() || 'Music clip';

  return (
    <PressableScale accessibilityRole="button" onPress={() => openExternalUrl(musicUrl)} style={styles.musicAttachment}>
      <View style={styles.musicAttachmentIcon}>
        <Ionicons name="musical-notes" size={18} color={colors.onAccent} />
      </View>
      <View style={styles.attachmentCopy}>
        <AppText style={styles.musicAttachmentTitle}>{label}</AppText>
        <AppText style={styles.attachmentMeta}>{musicUrl.trim()}</AppText>
      </View>
      <Ionicons name="open-outline" size={17} color={colors.muted} />
    </PressableScale>
  );
}

function ComposerToolButton({
  icon,
  active = false,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.composerToolButton, active && styles.composerToolButtonActive]}
    >
      <Ionicons name={icon} size={25} color={active ? colors.onAccent : colors.ink} />
    </PressableScale>
  );
}

function ComposerPhotoToolButton({
  disabled,
  onPhotoSelected,
  onUnavailable
}: {
  disabled: boolean;
  onPhotoSelected: (file: Blob) => void;
  onUnavailable: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={Platform.OS === 'web' ? undefined : onUnavailable}
      style={styles.composerToolButton}
    >
      <Ionicons name="image-outline" size={26} color={colors.ink} />
      {Platform.OS === 'web'
        ? React.createElement('input', {
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
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer'
            }
          })
        : null}
    </PressableScale>
  );
}

function PostImageTile({
  photoUrl,
  disabled,
  onPhotoSelected
}: {
  photoUrl: string;
  disabled: boolean;
  onPhotoSelected: (file: Blob) => void;
}) {
  return (
    <View style={styles.postImageTile}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.postImageTilePreview} />
      ) : (
        <Ionicons name="add-outline" size={38} color={colors.muted} />
      )}
      {Platform.OS === 'web'
        ? React.createElement('input', {
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
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer'
            }
          })
        : null}
    </View>
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
        <View style={styles.postVisibilityBadge}>
          <Ionicons
            name={post.visibility === 'public' ? 'earth-outline' : 'lock-closed-outline'}
            size={13}
            color={post.visibility === 'public' ? colors.accent : colors.muted}
          />
          <AppText style={styles.postVisibilityText}>
            {post.visibility === 'public' ? 'Public' : 'Private'}
          </AppText>
        </View>
        <PressableScale
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              post.visibility === 'public' ? 'Public post' : 'Private post',
              post.visibility === 'public'
                ? 'This post is visible on the member profile.'
                : 'This post is private to this account.'
            )
          }
          style={styles.postMenu}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
        </PressableScale>
      </View>
      {post.emoji ? (
        <View style={styles.postEmojiBlock}>
          <AppText style={styles.postEmojiText}>{post.emoji}</AppText>
        </View>
      ) : null}
      {post.body ? <AppText style={styles.postBody}>{post.body}</AppText> : null}
      {post.photoUrl ? <Image source={{ uri: post.photoUrl }} style={styles.postImage} /> : null}
      {post.voiceUrl ? <VoiceAttachment voiceUrl={post.voiceUrl} label="Voice message" /> : null}
      {post.musicUrl ? <MusicAttachment musicUrl={post.musicUrl} musicTitle={post.musicTitle} /> : null}
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
  postComposerScreen: {
    flex: 1,
    backgroundColor: colors.surface
  },
  postComposerTopBar: {
    minHeight: 70,
    paddingTop: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface
  },
  postComposerCloseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  postComposerSendButton: {
    minWidth: 72,
    minHeight: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B6AF2'
  },
  postComposerSendButtonDisabled: {
    backgroundColor: colors.surfaceMuted
  },
  postComposerSendText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '900'
  },
  postComposerSendTextDisabled: {
    color: colors.muted,
  },
  postComposerBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: colors.surface
  },
  postImageTile: {
    width: 82,
    height: 82,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted
  },
  postImageTilePreview: {
    width: '100%',
    height: '100%'
  },
  wallPostInput: {
    minHeight: 150,
    marginTop: 18,
    paddingVertical: 0,
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '400',
    textAlignVertical: 'top'
  },
  emojiDock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10
  },
  emojiOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  emojiOptionSelected: {
    backgroundColor: '#EDE8FF'
  },
  emojiOptionText: {
    fontSize: 20,
    lineHeight: 24
  },
  composerAttachmentRow: {
    minHeight: 48,
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceMuted
  },
  recordingAttachment: {
    backgroundColor: colors.dangerSoft
  },
  composerEmojiPreview: {
    fontSize: 24,
    lineHeight: 28
  },
  composerAttachmentText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900'
  },
  attachmentCopy: {
    flex: 1,
    minWidth: 0
  },
  attachmentMeta: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700'
  },
  musicComposerPanel: {
    marginTop: 10,
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted
  },
  musicPanelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  musicPanelTitle: {
    fontSize: 12,
    fontWeight: '900'
  },
  musicInput: {
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: 10,
    color: colors.ink,
    fontSize: 12,
    backgroundColor: colors.surface,
    fontWeight: '700'
  },
  musicSaveButton: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B6AF2'
  },
  musicSaveText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '900'
  },
  musicAttachment: {
    minHeight: 56,
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceMuted
  },
  musicAttachmentIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B6AF2'
  },
  musicAttachmentTitle: {
    fontSize: 12,
    fontWeight: '900'
  },
  postComposerFooter: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
    backgroundColor: colors.surface
  },
  postComposerFooterTop: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  locationPill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#D8CEF9',
    backgroundColor: colors.surface
  },
  locationPillText: {
    color: '#8B6AF2',
    fontSize: 13,
    fontWeight: '900'
  },
  characterCount: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900'
  },
  postToolBar: {
    minHeight: 54,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15
  },
  composerToolButton: {
    width: 30,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden'
  },
  composerToolButtonActive: {
    width: 36,
    borderRadius: 18,
    backgroundColor: '#8B6AF2'
  },
  hashToolButton: {
    width: 30,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  hashTool: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '400'
  },
  publicTool: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingLeft: 4
  },
  publicToolText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900'
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
  postVisibilityBadge: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceMuted
  },
  postVisibilityText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900'
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
  postEmojiBlock: {
    alignSelf: 'flex-start',
    minWidth: 50,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  postEmojiText: {
    fontSize: 30,
    lineHeight: 34
  },
  postImage: {
    width: '100%',
    height: 230,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted
  }
});
