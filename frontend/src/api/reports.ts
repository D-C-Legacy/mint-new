import { api } from './index';

export type ReportTargetType = 'REVIEW' | 'MESSAGE';

// POST /v1/reports — not in 05-API-SPEC.md, a user-directed addition (Apple guideline 1.2: a
// viewer must be able to flag an abusive chat message or review). `targetId` is the message's or
// review's own id; the admin moderation queue resolves it.
export function createReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
}): Promise<unknown> {
  return api.request('/reports', { method: 'POST', body: input });
}
