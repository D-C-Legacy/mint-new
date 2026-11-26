import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { v2 as speechV2, type protos } from '@google-cloud/speech';
import { v3 as translateV3 } from '@google-cloud/translate';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { env } from '../../../config/env';
import { LockService, type Lock } from '../../../platform/redis/lock.service';
import { RedisService } from '../../../platform/redis/redis.service';
import { createDomainEvent } from '../../../shared/events/domain-event';
import { EVENT_BUS, EventBusPort } from '../../../shared/events/event-bus.port';
import { StreamingService } from '../application/streaming.service';

export const STREAM_CAPTION_EVENT = 'stream.caption.v1';
export const STREAM_CAPTION_ERROR_EVENT = 'stream.caption.error.v1';
const LOCK_TTL_MS = 60_000;
const LANGUAGE_TTL_SECONDS = 120;
const LANGUAGE_KEYS: Readonly<Record<string, { speech: string; translation: string }>> = {
  en: { speech: 'en-US', translation: 'en' }, es: { speech: 'es-US', translation: 'es' },
  fr: { speech: 'fr-FR', translation: 'fr' }, pt: { speech: 'pt-BR', translation: 'pt' },
  ar: { speech: 'ar-EG', translation: 'ar' }, hi: { speech: 'hi-IN', translation: 'hi' },
  zh: { speech: 'cmn-Hans-CN', translation: 'zh-CN' }, sw: { speech: 'sw-KE', translation: 'sw' },
  af: { speech: 'af-ZA', translation: 'af' }, zu: { speech: 'zu-ZA', translation: 'zu' },
  xh: { speech: 'xh-ZA', translation: 'xh' }, st: { speech: 'st-ZA', translation: 'st' },
  tn: { speech: 'tn-ZA', translation: 'tn' }, nso: { speech: 'nso-ZA', translation: 'nso' },
};
type SpeechStream = {
  write(request: protos.google.cloud.speech.v2.IStreamingRecognizeRequest): boolean;
  on(event: string, listener: (value: unknown) => void): SpeechStream;
  end(): void;
  destroy(): SpeechStream;
};
type CaptionJob = { process: ChildProcessByStdio<null, Readable, Readable>; stream: SpeechStream; lock: Lock; timer: NodeJS.Timeout; speechStartedAt: number };

@Injectable()
export class CaptionsService implements OnModuleDestroy {
  private readonly speech = new speechV2.SpeechClient(
    env.GOOGLE_CLOUD_PROJECT_ID
      ? { projectId: env.GOOGLE_CLOUD_PROJECT_ID, apiEndpoint: 'us-speech.googleapis.com' }
      : { apiEndpoint: 'us-speech.googleapis.com' },
  );
  private readonly translation = new translateV3.TranslationServiceClient(
    env.GOOGLE_CLOUD_PROJECT_ID ? { projectId: env.GOOGLE_CLOUD_PROJECT_ID } : {},
  );
  private readonly jobs = new Map<string, CaptionJob>();
  private readonly playbackUrls = new Map<string, { playbackUrl: string; expiresAt: number }>();

  constructor(
    private readonly streaming: StreamingService,
    private readonly redis: RedisService,
    private readonly locks: LockService,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
  ) {}

  async watch(sessionId: string, userId: string, language: string): Promise<void> {
    if (!LANGUAGE_KEYS[language]) throw new Error('Unsupported caption language');
    if (!env.GOOGLE_CLOUD_PROJECT_ID) throw new Error('Automatic captions are not configured');
    let playbackUrl = this.playbackUrls.get(sessionId);
    if (!playbackUrl || playbackUrl.expiresAt <= Date.now()) {
      const access = await this.streaming.getViewerAccess({ sessionId, userId });
      if (!access.ok || access.value.viewerAccess.mode !== 'hls') {
        throw new Error('Automatic captions are only available on live HLS streams');
      }
      playbackUrl = { playbackUrl: access.value.viewerAccess.playbackUrl, expiresAt: Date.now() + 60_000 };
      this.playbackUrls.set(sessionId, playbackUrl);
    }
    const languageKey = `captions:languages:${sessionId}`;
    await this.redis.client.zadd(languageKey, Date.now(), language);
    await this.redis.client.expire(languageKey, LANGUAGE_TTL_SECONDS);
    await this.ensureTranscription(sessionId, playbackUrl.playbackUrl);
  }

  async onModuleDestroy(): Promise<void> {
    for (const [sessionId, job] of this.jobs) this.stopJob(sessionId, job);
    await this.speech.close();
    await this.translation.close();
  }

  private async ensureTranscription(sessionId: string, playbackUrl: string): Promise<void> {
    if (this.jobs.has(sessionId)) return;
    const lock = await this.locks.acquire(`captions:stream:${sessionId}`, LOCK_TTL_MS);
    if (!lock) return;
    const process = spawn('ffmpeg', [
      '-nostdin', '-loglevel', 'error', '-i', playbackUrl, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    const stream = this.openRecognitionStream(sessionId);
    process.stdout.on('data', (chunk: Buffer) => {
      const activeJob = this.jobs.get(sessionId);
      activeJob?.stream.write({ audio: chunk } satisfies protos.google.cloud.speech.v2.IStreamingRecognizeRequest);
    });
    process.stderr.on('data', () => undefined);
    process.on('error', () => {
      const current = this.jobs.get(sessionId);
      if (current) {
        this.stopJob(sessionId, current);
        void this.notifyUnavailable(sessionId);
      }
    });
    process.on('exit', () => {
      const current = this.jobs.get(sessionId);
      if (current) this.stopJob(sessionId, current);
    });
    const timer = setInterval(() => {
      void this.maintainJob(sessionId, lock);
    }, LOCK_TTL_MS / 3);
    this.jobs.set(sessionId, { process, stream, lock, timer, speechStartedAt: Date.now() });
  }

  private openRecognitionStream(sessionId: string): SpeechStream {
    const speech = this.speech as unknown as { _streamingRecognize(): SpeechStream };
    const stream = speech._streamingRecognize();
    stream.write({
      recognizer: `projects/${env.GOOGLE_CLOUD_PROJECT_ID}/locations/us/recognizers/_`,
      streamingConfig: {
        config: {
          explicitDecodingConfig: { encoding: 'LINEAR16', sampleRateHertz: 16_000, audioChannelCount: 1 },
          languageCodes: ['auto'],
          model: 'chirp_3',
        },
        streamingFeatures: { interimResults: false },
      },
    } satisfies protos.google.cloud.speech.v2.IStreamingRecognizeRequest);
    stream.on('data', (response: unknown) => {
      void this.handleRecognition(sessionId, response).catch(() => this.notifyUnavailable(sessionId));
    });
    stream.on('error', () => {
      const current = this.jobs.get(sessionId);
      if (current) {
        this.stopJob(sessionId, current);
        void this.notifyUnavailable(sessionId);
      }
    });
    return stream;
  }

  private async maintainJob(sessionId: string, lock: Lock): Promise<void> {
    const current = this.jobs.get(sessionId);
    if (!current) return;
    try {
      const renewed = await this.locks.renew(lock, LOCK_TTL_MS);
      const session = await this.streaming.getSessionForJoin({ sessionId });
      const activeLanguages = await this.redis.client.zrangebyscore(
        `captions:languages:${sessionId}`, Date.now() - LANGUAGE_TTL_SECONDS * 1000, '+inf',
      );
      if (!renewed || !session.ok || activeLanguages.length === 0) this.stopJob(sessionId, current);
      else if (Date.now() - current.speechStartedAt >= 240_000) {
        current.stream.end();
        current.stream = this.openRecognitionStream(sessionId);
        current.speechStartedAt = Date.now();
      }
    } catch {
      this.stopJob(sessionId, current);
    }
  }

  private async handleRecognition(sessionId: string, raw: unknown): Promise<void> {
    if (typeof raw !== 'object' || raw === null) return;
    const response = raw as { results?: Array<{ isFinal?: boolean; languageCode?: string; alternatives?: Array<{ transcript?: string }> }> };
    const result = response.results?.find((candidate) => candidate.isFinal);
    const transcript = result?.alternatives?.[0]?.transcript?.trim();
    if (!transcript || !result) return;
    const languages = await this.redis.client.zrangebyscore(
      `captions:languages:${sessionId}`, Date.now() - LANGUAGE_TTL_SECONDS * 1000, '+inf',
    );
    const detectedLanguage = result.languageCode ?? 'en-US';
    const sourceLanguage = Object.values(LANGUAGE_KEYS).find(
      (language) => language.speech.toLowerCase() === detectedLanguage.toLowerCase(),
    )?.translation ?? detectedLanguage.split('-')[0] ?? 'en';
    for (const language of new Set(languages)) {
      const target = LANGUAGE_KEYS[language]?.translation;
      if (!target) continue;
      let translated = transcript;
      try {
        if (target !== sourceLanguage) {
          const response = await this.translation.translateText({
            parent: `projects/${env.GOOGLE_CLOUD_PROJECT_ID}/locations/global`,
            contents: [transcript], mimeType: 'text/plain', sourceLanguageCode: sourceLanguage,
            targetLanguageCode: target,
          });
          translated = response[0].translations?.[0]?.translatedText ?? transcript;
        }
        await this.events.publish(createDomainEvent(STREAM_CAPTION_EVENT, 1, {
          sessionId, language, text: translated,
        }));
      } catch {
        // A transient translation failure should not bring down the realtime process.
      }
    }
  }

  private async notifyUnavailable(sessionId: string): Promise<void> {
    await this.events.publish(createDomainEvent(STREAM_CAPTION_ERROR_EVENT, 1, { sessionId }));
  }

  private stopJob(sessionId: string, job: CaptionJob): void {
    if (this.jobs.get(sessionId) !== job) return;
    this.jobs.delete(sessionId);
    clearInterval(job.timer);
    job.stream.destroy();
    job.process.kill('SIGTERM');
    void this.locks.release(job.lock);
  }
}
