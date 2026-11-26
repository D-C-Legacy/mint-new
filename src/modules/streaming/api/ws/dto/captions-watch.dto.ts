import { z } from 'zod';

export const CaptionsWatchSchema = z.object({
  sessionId: z.string().min(1),
  language: z.enum(['en', 'es', 'fr', 'pt', 'ar', 'hi', 'zh', 'sw', 'af', 'zu', 'xh', 'st', 'tn', 'nso']),
});
export type CaptionsWatchDto = z.infer<typeof CaptionsWatchSchema>;
