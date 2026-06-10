import React, { useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { RegistrationScreen } from './src/screens/RegistrationScreen';
import { MessageMatchScreen } from './src/screens/MessageMatchScreen';
import { VoiceRoomsScreen } from './src/screens/VoiceRoomsScreen';
import { VideoNearbyScreen } from './src/screens/VideoNearbyScreen';
import { AppText } from './src/components/AppText';
import { PressableScale } from './src/components/PressableScale';
import { colors } from './src/theme';
import type { ActiveTab, UserProfile } from './src/types';

const tabs: Array<{ key: ActiveTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'message', label: 'Message', icon: 'chatbubbles-outline' },
  { key: 'rooms', label: 'Rooms', icon: 'mic-outline' },
  { key: 'video', label: 'Video', icon: 'videocam-outline' }
];

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('message');

  const activeScreen = useMemo(() => {
    if (!profile) {
      return <RegistrationScreen onComplete={setProfile} />;
    }

    if (activeTab === 'message') {
      return <MessageMatchScreen profile={profile} />;
    }

    if (activeTab === 'rooms') {
      return <VoiceRoomsScreen profile={profile} />;
    }

    return <VideoNearbyScreen profile={profile} />;
  }, [activeTab, profile]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.shell}>{activeScreen}</View>
      {profile ? (
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
                  color={isActive ? colors.ink : colors.muted}
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
    backgroundColor: colors.background
  },
  shell: {
    flex: 1
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface
  },
  tabButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  tabButtonActive: {
    backgroundColor: colors.accentSoft
  },
  tabLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '700'
  },
  tabLabelActive: {
    color: colors.ink
  }
});
