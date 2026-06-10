import React, { PropsWithChildren } from 'react';
import { Pressable, PressableProps } from 'react-native';

export function PressableScale({ children, style, ...props }: PropsWithChildren<PressableProps>) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        typeof style === 'function' ? style({ pressed }) : style,
        pressed && { opacity: 0.72, transform: [{ scale: 0.99 }] }
      ]}
    >
      {children}
    </Pressable>
  );
}
