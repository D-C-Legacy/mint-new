import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';

export function ProductPanelRevealHandle({
  progress,
  hidden,
  onPress,
}: {
  progress: SharedValue<number>;
  hidden: boolean;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      pointerEvents={hidden ? 'auto' : 'none'}
      style={[styles.wrap, animatedStyle]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show featured product and purchase controls"
        onPress={onPress}
        style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Feather name="chevron-up" size={18} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
