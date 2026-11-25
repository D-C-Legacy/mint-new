import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

// A hand-rolled approximation of UINavigationController's push/pop: the incoming screen slides in
// over the outgoing one (not a flat cross-fade — this app's whole nav stack used to just hard-swap
// a React `key`, which is the single biggest "feels like a web view, not an app" tell App Review's
// design-spam flag watches for). The screen being covered trails with a slight parallax shift and
// a faint dim, same as the real thing. An edge-swipe from the left 24pt can drag the top screen
// back interactively — 1:1 with the finger, interruptible, and it springs home from wherever it's
// released rather than finishing a canned animation (Apple's "Designing Fluid Interfaces"
// interruptibility principle — see .claude/skills/apple-design-emil).
//
// CORRECTNESS NEVER WAITS ON AN ANIMATION CALLBACK. Two earlier versions of this file used a
// Reanimated `withSpring(..., (finished) => ...)` completion callback to decide when a popped-to
// screen becomes "the one shown" — on-device testing (confirmed by disabling the animation
// entirely as a diagnostic) showed that callback sometimes just doesn't fire in this environment,
// which left the screen showing nothing, forever. So now: which screen occupies which physical
// slot is plain React state, set synchronously the instant a navigation happens — never deferred
// to "whenever the spring finishes." The spring animation is purely cosmetic on top of that; if its
// completion callback never fires, the worst case is a slid-away, fully-covered view sitting in
// memory a little longer, never a blank screen.
//
// Two PHYSICALLY FIXED view slots, each with its OWN independent translateX/dim shared values —
// not one "front slot" whose role flips, so a screen's JSX never moves to a different parent View
// (which would unmount and remount it, see below) and its animation never depends on the other
// slot's animation finishing. `slotKeys[i]` is the key currently assigned to physical slot `i`;
// `topZ` is whichever slot should paint on top right now (the one visually in front).
//
// Slots track an entry's KEY only, never a frozen copy of its rendered JSX: content is resolved
// live from `top`/`below` every render (`contentForKey`), so a screen that's merely covered (not
// actively leaving) keeps receiving fresh props the whole time it's mounted — e.g. `Live`'s
// `navVisible`, which changes without any navigation happening at all. The only content ever
// allowed to render from a frozen snapshot is the screen actively animating off-screen during a
// pop (`outgoingSnapshot`), because by definition the parent has already dropped it from
// `top`/`below` before the animation finishes.
//
// No `react-native-screens`: this app's whole navigation state already lives in one place
// (`useNavigationBase.ts`'s `routes` array), so this component only ever needs the current top
// screen and the one directly beneath it, passed down fresh every render — no second navigation
// library, no stack of mounted screens to manage beyond these two fixed slots.
const EDGE_HOT_ZONE = 24;
const COMMIT_RATIO = 0.3; // iOS commits an interactive pop past ~1/3 dragged, or on a fast flick
const COMMIT_VELOCITY = 800;
const SPRING_CONFIG = { damping: 34, stiffness: 320, mass: 1 };
const PARALLAX_RATIO = 0.3;
const MAX_DIM = 0.1;
// Safety net for the cosmetic cleanup only (dropping the frozen outgoing snapshot) — well past the
// spring's real settle time, so it never fires before the real completion callback in practice, but
// guarantees that callback not firing can never leave anything stuck forever.
const CLEANUP_FALLBACK_MS = 700;

type Entry = { key: string; node: React.ReactNode };
type SlotIndex = 0 | 1;

export function AnimatedStackView({
  top,
  below,
  instant = false,
  backgroundColor,
  onInteractiveBack,
}: {
  top: Entry;
  below: Entry | null;
  /** Tab switches swap content outright — only a push/pop within one tab's stack slides. */
  instant?: boolean;
  /** Opaque fill behind both layers — without it, whatever's behind this view (another screen's
   *  own transparent default background) shows through the parts of each layer its content
   *  doesn't paint, which reads as one screen "ghosting" through another during a transition. */
  backgroundColor: string;
  onInteractiveBack: () => void;
}) {
  // Not `useWindowDimensions()` — on web this app's frame is capped to 480px and centered inside a
  // wider browser window (MainTabShell's `maxWidth: 480`), so the window width is wider than what's
  // actually on screen. Sliding by the wrong distance is exactly what reads as a glitchy, unstable
  // transition, so this measures the stack's own rendered width instead.
  const [width, setWidth] = useState(0);

  const tx0 = useSharedValue(0);
  const tx1 = useSharedValue(0);
  const dim0 = useSharedValue(0);
  const dim1 = useSharedValue(0);

  const [slotKeys, setSlotKeys] = useState<[string | null, string | null]>([top.key, below?.key ?? null]);
  const [topZ, setTopZ] = useState<SlotIndex>(0);
  const [outgoingSnapshot, setOutgoingSnapshot] = useState<Entry | null>(null);

  const topEntryRef = useRef<Entry>(top); // only updated inside the effect — holds the *previous* top across a navigation
  const liveRef = useRef({ top, below }); // updated every render — always current, safe to read from any callback
  liveRef.current = { top, below };
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function tx(i: SlotIndex) {
    return i === 0 ? tx0 : tx1;
  }
  function dim(i: SlotIndex) {
    return i === 0 ? dim0 : dim1;
  }
  function other(i: SlotIndex): SlotIndex {
    return i === 0 ? 1 : 0;
  }

  function contentForKey(key: string | null): React.ReactNode {
    if (key === null) return null;
    const { top: liveTop, below: liveBelow } = liveRef.current;
    if (key === liveTop.key) return liveTop.node;
    if (liveBelow && key === liveBelow.key) return liveBelow.node;
    if (outgoingSnapshot && outgoingSnapshot.key === key) return outgoingSnapshot.node;
    return null;
  }

  function scheduleCleanup(slotToFree: SlotIndex) {
    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    const run = () => {
      cleanupTimerRef.current = null;
      setOutgoingSnapshot(null);
      setSlotKeys((s) => {
        if (s[slotToFree] === null) return s;
        const next: [string | null, string | null] = [...s];
        next[slotToFree] = null;
        return next;
      });
    };
    cleanupTimerRef.current = setTimeout(run, CLEANUP_FALLBACK_MS);
    return run;
  }

  useEffect(() => {
    const prevTop = topEntryRef.current;
    topEntryRef.current = top;
    if (prevTop.key === top.key) return;

    if (instant) {
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      setSlotKeys([top.key, below?.key ?? null]);
      setTopZ(0);
      setOutgoingSnapshot(null);
      tx0.value = 0;
      tx1.value = 0;
      dim0.value = 0;
      dim1.value = 0;
      return;
    }

    // Whichever slot currently identifies `prevTop` is the one that was in front a moment ago —
    // this is always derivable from state alone, never from a remembered "front" flag.
    const prevFront: SlotIndex = slotKeys[0] === prevTop.key ? 0 : 1;
    const wasPush = below?.key === prevTop.key;

    if (wasPush) {
      const incoming = other(prevFront);
      setSlotKeys((s) => {
        const next: [string | null, string | null] = [...s];
        next[incoming] = top.key;
        return next;
      });
      setTopZ(incoming);
      tx(incoming).value = width;
      tx(incoming).value = withSpring(0, SPRING_CONFIG);
      tx(prevFront).value = withSpring(-width * PARALLAX_RATIO, SPRING_CONFIG);
      dim(prevFront).value = withSpring(MAX_DIM, SPRING_CONFIG);
    } else {
      // Pop, triggered by the in-screen back button or Android's hardware back — not a gesture.
      // The revealed slot already identifies the right key (it was `below` all along) and is
      // already at its parked position — only the outgoing slot needs to animate away, and the
      // whole transition is "done" for correctness purposes immediately, not when that finishes.
      const revealed = other(prevFront);
      setOutgoingSnapshot(prevTop);
      setTopZ(prevFront);
      tx(prevFront).value = withSpring(width, SPRING_CONFIG, (finished) => {
        'worklet';
        if (finished) runOnJS(onOutgoingSettled)();
      });
      tx(revealed).value = withSpring(0, SPRING_CONFIG);
      dim(revealed).value = withSpring(0, SPRING_CONFIG);
      const fallback = scheduleCleanup(prevFront);
      function onOutgoingSettled() {
        if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
        fallback();
      }
    }
  }, [top.key]);

  // Plain state can't be read inside a worklet, so the gesture reads a shared-value mirror of
  // `topZ` on the UI thread instead of crossing back to JS mid-drag.
  const topZSharedForGesture = useSharedValue<SlotIndex>(0);
  useEffect(() => {
    topZSharedForGesture.value = topZ;
  }, [topZ]);

  const pan = Gesture.Pan()
    .enabled(!!below && !instant && width > 0)
    .activeOffsetX(10)
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      const frontIdx = topZSharedForGesture.value;
      const backIdx = frontIdx === 0 ? 1 : 0;
      const p = Math.max(0, Math.min(1, e.translationX));
      tx(frontIdx).value = p;
      tx(backIdx).value = interpolate(p, [0, width], [-width * PARALLAX_RATIO, 0], Extrapolation.CLAMP);
      dim(backIdx).value = interpolate(p, [0, width], [MAX_DIM, 0], Extrapolation.CLAMP);
    })
    .onEnd((e) => {
      const draggedRatio = Math.max(0, e.translationX) / width;
      const commit = draggedRatio > COMMIT_RATIO || e.velocityX > COMMIT_VELOCITY;
      const frontIdx = topZSharedForGesture.value;
      const backIdx = frontIdx === 0 ? 1 : 0;
      if (commit) {
        runOnJS(commitGesturePop)(frontIdx, backIdx);
      } else {
        tx(frontIdx).value = withSpring(0, SPRING_CONFIG);
        tx(backIdx).value = withSpring(-width * PARALLAX_RATIO, SPRING_CONFIG);
        dim(backIdx).value = withSpring(MAX_DIM, SPRING_CONFIG);
      }
    });

  function commitGesturePop(frontIdx: SlotIndex, backIdx: SlotIndex) {
    // Freeze the still-live front content now, before `onInteractiveBack` causes the parent to
    // drop it from props on its next render.
    setOutgoingSnapshot(liveRef.current.top);
    tx(frontIdx).value = withSpring(width, SPRING_CONFIG, (finished) => {
      'worklet';
      if (finished) runOnJS(onSettled)();
    });
    tx(backIdx).value = withSpring(0, SPRING_CONFIG);
    dim(backIdx).value = withSpring(0, SPRING_CONFIG);
    const fallback = scheduleCleanup(frontIdx);
    function onSettled() {
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      fallback();
    }
    onInteractiveBack();
  }

  useEffect(
    () => () => {
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    },
    [],
  );

  // Not `zIndex` — Android doesn't reliably respect sibling zIndex on a view that also has an
  // active `transform` (it can get composited onto its own hardware layer independent of normal
  // paint order), which is exactly the kind of thing that would make a transition glitch only on
  // Android and only while actually animating. Stacking instead comes from plain render order
  // (the last-rendered sibling paints on top, which every platform honors) — reordering which
  // slot renders last never remounts either one, since each keeps the same `key` (its physical
  // slot number) regardless of position.
  const style0 = useAnimatedStyle(() => ({ transform: [{ translateX: tx0.value }] }));
  const style1 = useAnimatedStyle(() => ({ transform: [{ translateX: tx1.value }] }));
  const dimStyle0 = useAnimatedStyle(() => ({ opacity: dim0.value }));
  const dimStyle1 = useAnimatedStyle(() => ({ opacity: dim1.value }));

  const slotStyle: Record<SlotIndex, typeof style0> = { 0: style0, 1: style1 };
  const slotDimStyle: Record<SlotIndex, typeof dimStyle0> = { 0: dimStyle0, 1: dimStyle1 };
  const paintOrder: SlotIndex[] = topZ === 0 ? [1, 0] : [0, 1];

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {paintOrder.map((slotIdx) => {
        const key = slotKeys[slotIdx];
        if (key === null) return null;
        return (
          <Animated.View
            key={slotIdx}
            style={[StyleSheet.absoluteFill, { backgroundColor }, slotStyle[slotIdx]]}
          >
            {contentForKey(key)}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.dim, slotDimStyle[slotIdx]]}
            />
          </Animated.View>
        );
      })}
      {!!below && !instant && (
        <GestureDetector gesture={pan}>
          <View style={styles.edge} />
        </GestureDetector>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: '#000' },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE_HOT_ZONE, zIndex: 2 },
});
