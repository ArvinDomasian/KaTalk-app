import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors } from '../theme';

type Props = {
  name: string;
  photoUrl?: string;
  color?: string;
  size?: number;
  borderColor?: string;
};

export function MemberAvatar({
  name,
  photoUrl,
  color = colors.accent,
  size = 48,
  borderColor
}: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || 'K';
  const frameStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderColor: borderColor ?? color
  };

  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={[styles.avatarImage, frameStyle]} />;
  }

  return (
    <View style={[styles.avatarFallback, frameStyle, { backgroundColor: color }]}>
      <AppText style={[styles.avatarInitial, { fontSize: Math.max(14, size * 0.42) }]}>
        {initial}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarImage: {
    borderWidth: 1
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  avatarInitial: {
    color: colors.onAccent,
    fontWeight: '900'
  }
});
