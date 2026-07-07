import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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

type TabIconName = 'message' | 'rooms' | 'video' | 'rewards' | 'profile';

const tabs: Array<{ key: ActiveTab; label: string; icon: TabIconName }> = [
  { key: 'video', label: 'Discover', icon: 'video' },
  { key: 'message', label: 'AI Match', icon: 'message' },
  { key: 'rooms', label: 'Rooms', icon: 'rooms' },
  { key: 'rewards', label: 'Rewards', icon: 'rewards' },
  { key: 'profile', label: 'Profile', icon: 'profile' }
];

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(() => loadStoredProfile());
  const [isEnteringApp, setIsEnteringApp] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('message');
  const [isMessageChatting, setIsMessageChatting] = useState(false);
  const [isVideoCalling, setIsVideoCalling] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminDashboardVisible, setAdminDashboardVisible] = useState(false);
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
    }, 1400);
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
      return <VoiceRoomsScreen profile={profile} darkMode={darkMode} />;
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

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, darkMode && styles.rootDark]}>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      <View style={[styles.shell, shouldShowTabs && styles.shellWithTabs]}>
        {activeScreen}
      </View>
      {shouldShowTabs ? (
        <View style={[styles.tabBar, darkMode && styles.tabBarDark]}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const inactiveColor = darkMode ? '#AEB5C2' : colors.muted;

            return (
              <PressableScale
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <View style={[styles.tabMark, isActive && styles.tabMarkActive]}>
                  <AppTabGlyph name={tab.icon} color={isActive ? colors.onAccent : inactiveColor} />
                </View>
                <AppText style={[styles.tabLabel, darkMode && styles.tabLabelDark, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </AppText>
              </PressableScale>
            );
          })}
        </View>
      ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AppTabGlyph({ name, color }: { name: TabIconName; color: string }) {
  if (name === 'message') {
    return (
      <View style={styles.glyphBox}>
        <View style={[styles.messageGlyph, { borderColor: color }]}>
          <View style={[styles.messageGlyphTail, { borderTopColor: color }]} />
        </View>
      </View>
    );
  }

  if (name === 'rooms') {
    return (
      <View style={styles.glyphBox}>
        <View style={[styles.micHead, { borderColor: color }]} />
        <View style={[styles.micStem, { backgroundColor: color }]} />
        <View style={[styles.micBase, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'video') {
    return (
      <View style={styles.videoGlyph}>
        <View style={[styles.videoBody, { borderColor: color }]} />
        <View style={[styles.videoTail, { borderLeftColor: color }]} />
      </View>
    );
  }

  if (name === 'rewards') {
    return (
      <View style={styles.glyphBox}>
        <View style={[styles.trophyCup, { borderColor: color }]} />
        <View style={[styles.trophyStem, { backgroundColor: color }]} />
        <View style={[styles.trophyBase, { backgroundColor: color }]} />
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
    paddingBottom: 92
  },
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    shadowColor: '#F238A6',
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  tabBarDark: {
    borderColor: '#31223D',
    backgroundColor: '#10111C',
    shadowColor: '#000000',
    shadowOpacity: 0.34
  },
  tabButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3
  },
  tabButtonActive: {
    backgroundColor: colors.accent
  },
  tabMark: {
    width: 24,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabMarkActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)'
  },
  glyphBox: {
    width: 22,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center'
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
  micHead: {
    width: 10,
    height: 14,
    borderWidth: 2,
    borderRadius: 6
  },
  micStem: {
    width: 2,
    height: 5,
    borderRadius: 1,
    marginTop: -1
  },
  micBase: {
    width: 12,
    height: 2,
    borderRadius: 1
  },
  videoGlyph: {
    width: 24,
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoBody: {
    width: 15,
    height: 12,
    borderWidth: 2,
    borderRadius: 4
  },
  videoTail: {
    width: 0,
    height: 0,
    marginLeft: 2,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent'
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
  trophyCup: {
    width: 15,
    height: 11,
    borderWidth: 2,
    borderTopWidth: 3,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7
  },
  trophyStem: {
    width: 3,
    height: 5,
    borderRadius: 2
  },
  trophyBase: {
    width: 13,
    height: 2,
    borderRadius: 1
  },
  tabLabel: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '700'
  },
  tabLabelDark: {
    color: '#AEB5C2'
  },
  tabLabelActive: {
    color: colors.onAccent
  }
});
