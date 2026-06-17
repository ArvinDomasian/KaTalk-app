import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors } from '../theme';

type Props = {
  title: string;
  subtitle: string;
};

export function ScreenHeader({ title, subtitle }: Props) {
  return (
    <View style={styles.header}>
      <AppText style={styles.brand}>KaTalk</AppText>
      <AppText style={styles.title}>{title}</AppText>
      <AppText style={styles.subtitle}>{subtitle}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.background
  },
  brand: {
    color: colors.accent,
    fontWeight: '900',
    marginBottom: 6
  },
  title: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900'
  },
  subtitle: {
    marginTop: 6,
    color: colors.muted
  }
});
