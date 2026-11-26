import { useEffect, useState } from 'react';
import type { AppLanguage } from '../types/preferences';
import { useRealtime } from './useRealtime';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function useStreamCaptions(sessionId: string, active: boolean, enabled: boolean, language: AppLanguage) {
  const realtime = useRealtime();
  const [caption, setCaption] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!active || !enabled) {
      setCaption('');
      setUnavailable(false);
      return undefined;
    }
    const sendWatch = () => realtime.emit('captions.watch', { sessionId, language });
    sendWatch();
    const interval = setInterval(sendWatch, 30_000);
    return () => clearInterval(interval);
  }, [active, enabled, language, realtime.emit, sessionId]);

  useEffect(() => {
    if (!active || !enabled) return undefined;
    const offCaption = realtime.on('stream.caption', (payload) => {
      const value = record(payload);
      if (value?.['sessionId'] === sessionId && value['language'] === language && typeof value['text'] === 'string') {
        setCaption(value['text']);
        setUnavailable(false);
      }
    });
    const offError = realtime.on('captions.error', (payload) => {
      if (record(payload)?.['sessionId'] === sessionId) setUnavailable(true);
    });
    return () => {
      offCaption();
      offError();
    };
  }, [active, enabled, language, realtime.on, sessionId]);

  useEffect(() => {
    if (!caption) return undefined;
    const timer = setTimeout(() => setCaption(''), 5000);
    return () => clearTimeout(timer);
  }, [caption]);

  return { caption, unavailable };
}
