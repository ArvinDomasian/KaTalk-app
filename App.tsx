import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { RegistrationScreen } from './src/screens/RegistrationScreen';
import { MessageMatchScreen } from './src/screens/MessageMatchScreen';
import { VoiceRoomsScreen } from './src/screens/VoiceRoomsScreen';
import { VideoNearbyScreen } from './src/screens/VideoNearbyScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { AppText } from './src/components/AppText';
import { PressableScale } from './src/components/PressableScale';
import { signOutCurrentUser } from './src/services/firebaseAuthService';
import { saveFirebaseUserProfile } from './src/services/firebaseProfileService';
import { clearStoredProfile, loadStoredProfile, saveStoredProfile } from './src/services/profileStorage';
import { colors } from './src/theme';
import type { ActiveTab, UserProfile } from './src/types';

const tabs: Array<{ key: ActiveTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'message', label: 'Message', icon: 'chatbubbles-outline' },
  { key: 'rooms', label: 'Rooms', icon: 'mic-outline' },
  { key: 'video', label: 'Video', icon: 'videocam-outline' },
  { key: 'profile', label: 'Profile', icon: 'person-circle-outline' }
];

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(() => loadStoredProfile());
  const [isEnteringApp, setIsEnteringApp] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('message');
  const [isMessageChatting, setIsMessageChatting] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  function completeRegistration(nextProfile: UserProfile) {
    saveStoredProfile(nextProfile);
    void saveFirebaseUserProfile(nextProfile);
    setIsEnteringApp(true);
    setActiveTab('message');
    setIsMessageChatting(false);

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
    void saveFirebaseUserProfile(nextProfile);
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

    if (activeTab === 'message') {
      return (
        <MessageMatchScreen
          profile={profile}
          onChattingStateChange={setIsMessageChatting}
        />
      );
    }

    if (activeTab === 'rooms') {
      return <VoiceRoomsScreen profile={profile} />;
    }

    if (activeTab === 'video') {
      return <VideoNearbyScreen profile={profile} />;
    }

    return <ProfileScreen profile={profile} onLogout={logOut} onProfileUpdate={updateProfile} />;
  }, [activeTab, isEnteringApp, isLoggingOut, profile]);

  useEffect(() => {
    if (activeTab !== 'message') {
      setIsMessageChatting(false);
    }
  }, [activeTab]);

  const shouldShowTabs = Boolean(profile && !isEnteringApp && !isLoggingOut && !isMessageChatting);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={[styles.shell, shouldShowTabs && styles.shellWithTabs]}>
        {activeScreen}
      </View>
      {shouldShowTabs ? (
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <PressableScale
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons
                  name={tab.icon}
                  size={22}
                  color={isActive ? colors.onAccent : colors.muted}
                />
                <AppText style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </AppText>
              </PressableScale>
            );
          })}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    position: 'relative'
  },
  shell: {
    flex: 1
  },
  shellWithTabs: {
    paddingBottom: 82
  },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    shadowColor: '#8FA5B5',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  tabButtonActive: {
    backgroundColor: colors.accent
  },
  tabLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '700'
  },
  tabLabelActive: {
    color: colors.onAccent
  }
});
