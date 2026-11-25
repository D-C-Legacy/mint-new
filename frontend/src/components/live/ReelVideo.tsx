import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView, type SubtitleTrack } from 'expo-video';
import { Feather } from '@expo/vector-icons';

// Founder-reported (22 Oct 2026): the live viewer "freezes" and loses audio, requiring a manual
// back-out/re-enter to recover. Root cause: this component never listened for player status at
// all — a live HLS stream genuinely stalls during any real upstream gap (the seller's OBS
// reconnecting, a network blip), and native HLS players routinely do NOT recover from falling
// behind the live edge on their own; without reloading the manifest, playback just sits stuck
// indefinitely. `player.replaceAsync` re-fetches a fresh manifest at the current live edge, which
// is the standard fix for this class of stall.
const STALL_TIMEOUT_MS = 8_000;
const RELOAD_COOLDOWN_MS = 5_000;

// One full-screen reel: the real HLS playback URL from POST /streams/:id/viewer-token. Only the
// active reel plays; the others are paused so only one video ever has sound. `flash` changes each
// time the viewer taps, which replays the mute/sound icon.
export function ReelVideo({
  source,
  active,
  muted,
  flash,
  volume,
  captionLanguage,
}: {
  source: string;
  active: boolean;
  muted: boolean;
  flash: number;
  // 0-1. Only a web control exists for this (phones have hardware volume buttons instead), but the
  // player itself supports it, so it's accepted here too rather than silently ignored.
  volume?: number;
  captionLanguage: 'en' | 'es';
}) {
  // No `loop`: this is a live broadcast, not a finite clip. `timeUpdateEventInterval` defaults to
  // 0 (no timeUpdate events at all) — opted in here specifically to detect a stalled live edge.
  const player = useVideoPlayer(source, (p) => {
    p.muted = muted;
    p.volume = volume ?? 1;
    p.timeUpdateEventInterval = 1;
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    player.volume = volume ?? 1;
  }, [volume, player]);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);

  useEffect(() => {
    const sub = player.addListener('sourceLoad', ({ availableSubtitleTracks }) => {
      setSubtitleTracks(availableSubtitleTracks);
      setCaptionsEnabled(false);
      player.subtitleTrack = null;
    });
    return () => sub.remove();
  }, [player]);

  const toggleCaptions = () => {
    const next = !captionsEnabled;
    setCaptionsEnabled(next);
    if (!next) {
      player.subtitleTrack = null;
      return;
    }
    const track = subtitleTracks.find((item) => item.language?.toLowerCase().startsWith(captionLanguage))
      ?? subtitleTracks.find((item) => item.language?.toLowerCase().startsWith('en'))
      ?? subtitleTracks[0];
    if (track) player.subtitleTrack = track;
    else setCaptionsEnabled(false);
  };

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  // Stall/error recovery: reload the manifest when the player reports a hard error, or when
  // playback time stops advancing for too long while this reel is the active one (a silent stall
  // — no error event, the live edge just never moves). `replaceAsync` is the only reliable way to
  // resume once an HLS player has fallen behind; `play()` alone has been observed to just sit
  // stuck in `loading`.
  const lastProgressRef = useRef(Date.now());
  const lastCurrentTimeRef = useRef(0);
  const lastReloadRef = useRef(0);

  useEffect(() => {
    // Fresh grace window from the moment this reel becomes active, not from component mount —
    // otherwise normal initial buffering on swipe-in could itself look like a stall.
    if (active) lastProgressRef.current = Date.now();

    function reload(reason: string) {
      const now = Date.now();
      if (now - lastReloadRef.current < RELOAD_COOLDOWN_MS) return;
      lastReloadRef.current = now;
      lastProgressRef.current = now;
      // eslint-disable-next-line no-console
      console.warn(`[ReelVideo] reloading after ${reason}`);
      player
        .replaceAsync(source)
        .then(() => {
          // Re-applied explicitly rather than assumed carried over by the fresh source load.
          player.muted = mutedRef.current;
          if (active) player.play();
        })
        .catch(() => {
          // A failed reload just means the next stall check or error event tries again; nothing
          // else to do here, same "best-effort recovery" tolerance as the rest of this component.
        });
    }

    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error' && active) reload('player error');
    });
    const timeSub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime > lastCurrentTimeRef.current) {
        lastCurrentTimeRef.current = currentTime;
        lastProgressRef.current = Date.now();
      }
    });

    const stallCheck = setInterval(() => {
      if (active && Date.now() - lastProgressRef.current > STALL_TIMEOUT_MS) {
        reload('stalled live edge');
      }
    }, 2_000);

    return () => {
      statusSub.remove();
      timeSub.remove();
      clearInterval(stallCheck);
    };
  }, [player, source, active]);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;
  const mounted = useRef(false);

  useEffect(() => {
    // Skip the first render so the icon does not appear before anyone has tapped.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!active) return;
    opacity.setValue(1);
    scale.setValue(0.6);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 600,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [flash]);

  return (
    <View style={styles.frame} pointerEvents="box-none">
      {/* Explicit 100% size: on web the video element otherwise keeps its file's pixel size. */}
      <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />
      {subtitleTracks.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={captionsEnabled ? 'Turn captions off' : 'Turn captions on'}
          accessibilityState={{ selected: captionsEnabled }}
          onPress={toggleCaptions}
          style={styles.captionButton}
        >
          <Feather name="type" size={20} color="#FFFFFF" />
        </Pressable>
      ) : null}
      <View style={styles.centre} pointerEvents="none">
        <Animated.View style={[styles.badge, { opacity, transform: [{ scale }] }]}>
          <Feather name={muted ? 'volume-x' : 'volume-2'} size={28} color="#FFFFFF" />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  centre: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,16,20,0.55)',
  },
  captionButton: {
    position: 'absolute',
    right: 18,
    top: 72,
    zIndex: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,16,20,0.62)',
  },
});
