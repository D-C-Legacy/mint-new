import { useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, withSpring, runOnJS, type SharedValue } from 'react-native-reanimated';

// Same snappy feel as AnimatedStackView's nav-pop spring, reused here on purpose for a consistent
// "house" motion language rather than a one-off tuning.
const SPRING_CONFIG = { damping: 34, stiffness: 320, mass: 1 };
// Px of horizontal drag that covers the full 0 (shown) .. 1 (hidden) range.
const DRAG_DISTANCE = 120;
// A flick past this speed (px/s) commits in that direction regardless of how far the drag got.
const FLICK_VELOCITY = 800;

export type SwipeHideChat = {
  // Continuous 0 (shown) .. 1 (hidden) value: tracks the finger/cursor 1:1 while dragging, springs
  // to whichever end on release. Drive transforms/opacity off this inside useAnimatedStyle.
  progress: SharedValue<number>;
  // Plain, JS-thread-readable mirror of the committed (settled) state — for pointerEvents, a11y,
  // etc. Flips the instant a drag/tap commits, never deferred to the spring's completion callback.
  hidden: boolean;
  pan: ReturnType<typeof Gesture.Pan>;
  show: () => void;
  hide: () => void;
  toggle: () => void;
};

// Shared reversible horizontal-dismiss gesture. Separate hook calls keep the chat and product
// panel states independent, while preserving the same drag threshold and spring response.
function useSwipeToggle(): SwipeHideChat {
  const progress = useSharedValue(0);
  const hiddenShared = useSharedValue(false);
  const [hidden, setHidden] = useState(false);

  function set(toHidden: boolean) {
    hiddenShared.value = toHidden;
    progress.value = withSpring(toHidden ? 1 : 0, SPRING_CONFIG);
    setHidden(toHidden);
  }

  const pan = Gesture.Pan()
    // Only steals the gesture once the drag is clearly horizontal — lets a vertical drag keep
    // paging the live feed instead of getting swallowed here.
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const base = hiddenShared.value ? 1 : 0;
      const next = base - e.translationX / DRAG_DISTANCE;
      progress.value = Math.min(1, Math.max(0, next));
    })
    .onEnd((e) => {
      const flickLeft = e.velocityX < -FLICK_VELOCITY;
      const flickRight = e.velocityX > FLICK_VELOCITY;
      const toHidden = flickLeft || (!flickRight && progress.value > 0.5);
      hiddenShared.value = toHidden;
      progress.value = withSpring(toHidden ? 1 : 0, SPRING_CONFIG);
      runOnJS(setHidden)(toHidden);
    });

  return {
    progress,
    hidden,
    pan,
    show: () => set(false),
    hide: () => set(true),
    toggle: () => set(!hidden),
  };
}

// Swipe left over chat to hide chat and the action rail.
export function useSwipeHideChat(): SwipeHideChat {
  return useSwipeToggle();
}

// Swipe left over the lower product panel to hide product details and purchase controls.
export function useSwipeHideProductPanel(): SwipeHideChat {
  return useSwipeToggle();
}
