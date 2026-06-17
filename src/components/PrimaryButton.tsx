import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { colors } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
};

export function PrimaryButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  style
}: Props) {
  return (
    <PressableScale
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        styles[variant],
        disabled && styles.disabled,
        style
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={variant === 'primary' ? colors.background : colors.ink}
        />
      ) : null}
      <AppText
        style={[
          styles.label,
          variant === 'primary' && styles.primaryLabel,
          disabled && styles.disabledLabel
        ]}
      >
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  primary: {
    backgroundColor: colors.accent
  },
  secondary: {
    backgroundColor: colors.surfaceMuted
  },
  danger: {
    backgroundColor: colors.dangerSoft
  },
  disabled: {
    backgroundColor: colors.surfaceMuted
  },
  label: {
    fontWeight: '800',
    color: colors.ink
  },
  primaryLabel: {
    color: colors.background
  },
  disabledLabel: {
    color: colors.muted
  }
});
