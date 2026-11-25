import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';

// The swipe-to-hide-chat gesture is reversible two ways: swipe back, or tap this. It fades in as
// `progress` climbs toward "hidden" so it never just pops into existence, and it only accepts
// taps once fully hidden (`pointerEvents`) so it can't steal touches meant for the chat/rail while
// those are still interactive mid-drag.
export function ChatRevealHandle({
  progress,
  hidden,
  onPress,
  style,
}: {
  progress: SharedValue<number>;
  hidden: boolean;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View pointerEvents={hidden ? 'auto' : 'none'} style={[styles.wrap, style, animatedStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show chat"
        onPress={onPress}
        style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Feather name="chevron-left" size={18} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
