import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { RegistrationScreen } from './src/screens/RegistrationScreen';
import { MessageMatchScreen } from './src/screens/MessageMatchScreen';
import { VoiceRoomsScreen } from './src/screens/VoiceRoomsScreen';
import { VideoNearbyScreen } from './src/screens/VideoNearbyScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { RewardsScreen } from './src/screens/RewardsScreen';
import { AdminDashboardScreen } from './src/screens/AdminDashboardScreen';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { AppText } from './src/components/AppText';
import { PressableScale } from './src/components/PressableScale';
import { subscribeAdminAccess } from './src/services/adminService';
import { signOutCurrentUser } from './src/services/authService';
import { saveUserProfile } from './src/services/profileService';
import {
  clearStoredProfile,
  loadStoredProfile,
  loadStoredThemeMode,
  saveStoredProfile,
  saveStoredThemeMode
} from './src/services/profileStorage';
import { colors } from './src/theme';
import type { ActiveTab, ThemeMode, UserProfile } from './src/types';

type TabIconName = 'home' | 'search' | 'trophy' | 'chat' | 'profile';

const tabs: Array<{ key: ActiveTab; label: string; icon: TabIconName }> = [
  { key: 'message', label: 'Home', icon: 'home' },
  { key: 'video', label: 'Discover', icon: 'search' },
  { key: 'rewards', label: 'Rewards', icon: 'trophy' },
  { key: 'rooms', label: 'Messages', icon: 'chat' },
  { key: 'profile', label: 'Profile', icon: 'profile' }
];

export default function App() {
  useFonts({
    'Poppins-Regular': require('./assets/fonts/Poppins-Regular.ttf'),
    'Poppins-Medium': require('./assets/fonts/Poppins-Medium.ttf'),
    'Poppins-Bold': require('./assets/fonts/Poppins-Bold.ttf')
  });
  const [profile, setProfile] = useState<UserProfile | null>(() => loadStoredProfile());
  const [isEnteringApp, setIsEnteringApp] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('message');
  const [isMessageChatting, setIsMessageChatting] = useState(false);
  const [isVideoCalling, setIsVideoCalling] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminDashboardVisible, setAdminDashboardVisible] = useState(false);
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadStoredThemeMode());
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const darkMode = themeMode === 'dark';

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!profile) {
      setIsAdmin(false);
      setAdminDashboardVisible(false);
      return undefined;
    }

    return subscribeAdminAccess(setIsAdmin);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile) {
      return undefined;
    }

    void saveUserProfile(profile);
    const syncTimer = setTimeout(() => {
      void saveUserProfile(profile);
    }, 1500);

    return () => clearTimeout(syncTimer);
  }, [
    profile?.id,
    profile?.nickname,
    profile?.avatarUrl,
    profile?.dateOfBirth,
    profile?.gender,
    profile?.preference,
    profile?.ageRange,
    profile?.interests?.join(','),
    profile?.comfort
  ]);

  function completeRegistration(nextProfile: UserProfile) {
    saveStoredProfile(nextProfile);
    void saveUserProfile(nextProfile);
    setIsEnteringApp(true);
    setActiveTab('message');
    setIsMessageChatting(false);
    setIsVideoCalling(false);

    transitionTimerRef.current = setTimeout(() => {
      setProfile(nextProfile);
      setIsEnteringApp(false);
    }, 450);
  }

  async function logOut() {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    setIsLoggingOut(true);
    setIsEnteringApp(false);
    setIsMessageChatting(false);
    setIsVideoCalling(false);
    setIsAdmin(false);
    setAdminDashboardVisible(false);
    clearStoredProfile();

    await Promise.all([
      signOutCurrentUser().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1100))
    ]);

    setProfile(null);
    setActiveTab('message');
    setIsLoggingOut(false);
  }

  function updateProfile(nextProfile: UserProfile) {
    setProfile(nextProfile);
    saveStoredProfile(nextProfile);
    void saveUserProfile(nextProfile);
  }

  function updateThemeMode(nextDarkMode: boolean) {
    const nextThemeMode: ThemeMode = nextDarkMode ? 'dark' : 'light';

    setThemeMode(nextThemeMode);
    saveStoredThemeMode(nextThemeMode);
  }

  function openQuickTab(nextTab: ActiveTab) {
    setQuickAddVisible(false);
    setActiveTab(nextTab);
  }

  const activeScreen = useMemo(() => {
    if (isLoggingOut) {
      return (
        <LoadingScreen
          title="You're now logging out"
          subtitle="Clearing this account so another one can sign in."
          steps={[
            { icon: 'log-out-outline', label: 'Signing out' },
            { icon: 'lock-closed-outline', label: 'Clearing saved session' },
            { icon: 'person-circle-outline', label: 'Returning to login' }
          ]}
        />
      );
    }

    if (isEnteringApp) {
      return <LoadingScreen />;
    }

    if (!profile) {
      return <RegistrationScreen onComplete={completeRegistration} />;
    }

    if (adminDashboardVisible) {
      return (
        <AdminDashboardScreen
          darkMode={darkMode}
          onClose={() => setAdminDashboardVisible(false)}
        />
      );
    }

    if (activeTab === 'message') {
      return (
        <MessageMatchScreen
          profile={profile}
          darkMode={darkMode}
          onChattingStateChange={setIsMessageChatting}
          onProfileUpdate={updateProfile}
        />
      );
    }

    if (activeTab === 'rooms') {
      return (
        <VoiceRoomsScreen
          profile={profile}
          darkMode={darkMode}
          onOpenMessageMatch={() => setActiveTab('message')}
        />
      );
    }

    if (activeTab === 'video') {
      return (
        <VideoNearbyScreen
          profile={profile}
          darkMode={darkMode}
          onProfileUpdate={updateProfile}
          onCallStateChange={setIsVideoCalling}
        />
      );
    }

    if (activeTab === 'rewards') {
      return (
        <RewardsScreen
          profile={profile}
          darkMode={darkMode}
          onProfileUpdate={updateProfile}
          onOpenPremium={() => setActiveTab('profile')}
        />
      );
    }

    return (
      <ProfileScreen
        profile={profile}
        darkMode={darkMode}
        onDarkModeChange={updateThemeMode}
        isAdmin={isAdmin}
        onOpenAdminDashboard={() => setAdminDashboardVisible(true)}
        onLogout={logOut}
        onProfileUpdate={updateProfile}
      />
    );
  }, [activeTab, adminDashboardVisible, darkMode, isAdmin, isEnteringApp, isLoggingOut, profile]);

  useEffect(() => {
    if (activeTab !== 'message') {
      setIsMessageChatting(false);
    }
  }, [activeTab]);

  const shouldShowTabs = Boolean(
    profile && !isEnteringApp && !isLoggingOut && !isMessageChatting && !isVideoCalling
      && !adminDashboardVisible
  );
  const shouldShowCreateButton = shouldShowTabs && activeTab !== 'profile';

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, darkMode && styles.rootDark]}>
      <StatusBar style="light" />
      <View style={[styles.shell, shouldShowTabs && styles.shellWithTabs]}>
        {activeScreen}
      </View>
      {shouldShowTabs ? (
        <>
          {shouldShowCreateButton ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Create"
              style={styles.floatingCreateButton}
              onPress={() => setQuickAddVisible(true)}
            >
              <AppText style={styles.floatingCreateGlyph}>+</AppText>
            </PressableScale>
          ) : null}
          <View style={[styles.tabBar, darkMode && styles.tabBarDark]}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const glyphColor = isActive ? colors.accent : colors.muted;

              return (
                <PressableScale
                  key={tab.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <View style={[styles.tabMark, isActive && styles.tabMarkActive]}>
                    <AppTabGlyph name={tab.icon} color={glyphColor} />
                  </View>
                  <AppText style={[
                    styles.tabLabel,
                    darkMode && styles.tabLabelDark,
                    isActive && styles.tabLabelActive
                  ]}>
                    {tab.label}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
          <QuickAddModal
            visible={quickAddVisible && shouldShowCreateButton}
            darkMode={darkMode}
            onClose={() => setQuickAddVisible(false)}
            onCreatePost={() => openQuickTab('profile')}
            onAddStory={() => openQuickTab('message')}
            onFindChat={() => openQuickTab('message')}
          />
        </>
      ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AppTabGlyph({ name, color }: { name: TabIconName; color: string }) {
  if (name === 'home') {
    return (
      <View style={styles.homeGlyph}>
        <View style={[styles.homeRoof, { borderBottomColor: color }]} />
        <View style={[styles.homeBody, { borderColor: color }]}>
          <View style={[styles.homeDoor, { backgroundColor: color }]} />
        </View>
      </View>
    );
  }

  if (name === 'search') {
    return (
      <View style={styles.glyphBox}>
        <View style={[styles.searchLens, { borderColor: color }]} />
        <View style={[styles.searchHandle, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'trophy') {
    return (
      <View style={styles.trophyGlyph}>
        <View style={[styles.trophyHandleLeft, { borderColor: color }]} />
        <View style={[styles.trophyHandleRight, { borderColor: color }]} />
        <View style={[styles.trophyCup, { backgroundColor: color }]} />
        <View style={[styles.trophyStem, { backgroundColor: color }]} />
        <View style={[styles.trophyBase, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'chat') {
    return (
      <View style={styles.glyphBox}>
        <View style={[styles.messageGlyph, { borderColor: color }]}>
          <View style={[styles.messageGlyphTail, { borderTopColor: color }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.glyphBox}>
      <View style={[styles.profileHead, { backgroundColor: color }]} />
      <View style={[styles.profileBody, { borderColor: color }]} />
    </View>
  );
}

function QuickAddModal({
  visible,
  darkMode,
  onClose,
  onCreatePost,
  onAddStory,
  onFindChat
}: {
  visible: boolean;
  darkMode: boolean;
  onClose: () => void;
  onCreatePost: () => void;
  onAddStory: () => void;
  onFindChat: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.quickAddOverlay}>
        <PressableScale accessibilityRole="button" style={styles.quickAddBackdrop} onPress={onClose} />
        <View style={[styles.quickAddSheet, darkMode && styles.quickAddSheetDark]}>
          <View style={styles.quickAddHandle} />
          <AppText style={styles.quickAddTitle}>Create</AppText>
          <PressableScale style={styles.quickAddOption} onPress={onCreatePost}>
            <View style={styles.quickAddIcon}>
              <AppText style={styles.quickAddIconText}>+</AppText>
            </View>
            <View style={styles.quickAddCopy}>
              <AppText style={styles.quickAddOptionTitle}>Create post</AppText>
              <AppText style={styles.quickAddOptionMeta}>Go to Profile and post on your wall.</AppText>
            </View>
          </PressableScale>
          <PressableScale style={styles.quickAddOption} onPress={onAddStory}>
            <View style={styles.quickAddIcon}>
              <AppText style={styles.quickAddIconText}>24</AppText>
            </View>
            <View style={styles.quickAddCopy}>
              <AppText style={styles.quickAddOptionTitle}>Add story</AppText>
              <AppText style={styles.quickAddOptionMeta}>Open Home stories for a 24-hour update.</AppText>
            </View>
          </PressableScale>
          <PressableScale style={styles.quickAddOption} onPress={onFindChat}>
            <View style={styles.quickAddIcon}>
              <AppText style={styles.quickAddIconText}>?</AppText>
            </View>
            <View style={styles.quickAddCopy}>
              <AppText style={styles.quickAddOptionTitle}>Find chat</AppText>
              <AppText style={styles.quickAddOptionMeta}>Jump back to the real match screen.</AppText>
            </View>
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative'
  },
  rootDark: {
    backgroundColor: colors.background
  },
  shell: {
    flex: 1
  },
  shellWithTabs: {
    paddingBottom: 104
  },
  floatingCreateButton: {
    position: 'absolute',
    left: '50%',
    bottom: 86,
    width: 56,
    height: 56,
    marginLeft: -28,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: colors.accent,
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 9,
    zIndex: 20
  },
  floatingCreateGlyph: {
    color: colors.onAccent,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '700'
  },
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.surface,
    backgroundColor: '#0F1018',
    shadowColor: colors.accent,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  tabBarDark: {
    borderColor: colors.surface,
    backgroundColor: '#0F1018',
    shadowColor: '#000000',
    shadowOpacity: 0.34
  },
  tabButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255, 107, 157, 0.10)'
  },
  tabMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabMarkActive: {
    backgroundColor: 'rgba(255, 107, 157, 0.16)'
  },
  glyphBox: {
    width: 24,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeGlyph: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  homeRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -2
  },
  homeBody: {
    width: 16,
    height: 13,
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    alignItems: 'center',
    justifyContent: 'flex-end'
  },
  homeDoor: {
    width: 4,
    height: 6,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2
  },
  searchLens: {
    width: 13,
    height: 13,
    borderWidth: 2,
    borderRadius: 7,
    marginTop: -2,
    marginLeft: -2
  },
  searchHandle: {
    width: 8,
    height: 2,
    borderRadius: 1,
    marginTop: -1,
    marginLeft: 9,
    transform: [{ rotate: '45deg' }]
  },
  trophyGlyph: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative'
  },
  trophyCup: {
    width: 15,
    height: 11,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    zIndex: 2
  },
  trophyHandleLeft: {
    position: 'absolute',
    top: 4,
    left: 2,
    width: 7,
    height: 8,
    borderWidth: 2,
    borderRightWidth: 0,
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5
  },
  trophyHandleRight: {
    position: 'absolute',
    top: 4,
    right: 2,
    width: 7,
    height: 8,
    borderWidth: 2,
    borderLeftWidth: 0,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5
  },
  trophyStem: {
    width: 4,
    height: 4,
    marginTop: -1
  },
  trophyBase: {
    width: 14,
    height: 3,
    borderRadius: 2
  },
  messageGlyph: {
    width: 18,
    height: 13,
    borderWidth: 2,
    borderRadius: 6
  },
  messageGlyphTail: {
    position: 'absolute',
    left: 4,
    bottom: -6,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderRightWidth: 6,
    borderRightColor: 'transparent'
  },
  profileHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 1
  },
  profileBody: {
    width: 16,
    height: 8,
    borderWidth: 2,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomWidth: 0
  },
  tabLabel: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '700',
    letterSpacing: 0
  },
  tabLabelDark: {
    color: colors.muted
  },
  tabLabelActive: {
    color: colors.accent
  },
  quickAddOverlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  quickAddBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.48)'
  },
  quickAddSheet: {
    marginHorizontal: 18,
    marginBottom: 112,
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 157, 0.22)',
    backgroundColor: '#15131D',
    shadowColor: colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10
  },
  quickAddSheetDark: {
    backgroundColor: '#15131D'
  },
  quickAddHandle: {
    alignSelf: 'center',
    width: 46,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
    marginBottom: 12
  },
  quickAddTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 12
  },
  quickAddOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 10
  },
  quickAddIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  quickAddIconText: {
    color: colors.onAccent,
    fontSize: 18,
    fontWeight: '800'
  },
  quickAddCopy: {
    flex: 1
  },
  quickAddOptionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800'
  },
  quickAddOptionMeta: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2
  }
});
