import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { colors } from '../theme';

export function AppText({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.text, style]} />;
}

const styles = StyleSheet.create({
  text: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21
  }
});
