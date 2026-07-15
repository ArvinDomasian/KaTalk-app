import React from 'react';
import { isLoaded } from 'expo-font';
import { Platform, Text, TextProps, StyleSheet, TextStyle } from 'react-native';
import { colors } from '../theme';

export function AppText({ style, ...props }: TextProps) {
  const flattenedStyle = StyleSheet.flatten(style) as TextStyle | undefined;

  return <Text {...props} style={[styles.text, style, { fontFamily: poppinsFamily(flattenedStyle?.fontWeight) }]} />;
}

function poppinsFamily(fontWeight: TextStyle['fontWeight'] | undefined) {
  const fallbackFamily = Platform.select({
    web: 'Poppins, Arial, sans-serif',
    ios: 'System',
    android: 'sans-serif'
  });

  if (Platform.OS !== 'web' && !isLoaded('Poppins-Regular')) {
    return fallbackFamily;
  }

  const weight =
    typeof fontWeight === 'number'
      ? fontWeight
      : typeof fontWeight === 'string' && /^\d+$/.test(fontWeight)
        ? Number(fontWeight)
        : fontWeight === 'bold'
          ? 700
          : 400;

  if (weight >= 700) {
    return 'Poppins-Bold';
  }

  if (weight >= 500) {
    return 'Poppins-Medium';
  }

  return 'Poppins-Regular';
}

const styles = StyleSheet.create({
  text: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0,
    fontWeight: '400'
  }
});
