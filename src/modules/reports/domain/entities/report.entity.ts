// 'USER' is never user-submitted (CreateReportSchema only accepts REVIEW/MESSAGE) — it's created
// internally by BlocksService whenever someone blocks another user, so a block is visible to
// admin moderation the same way a report is, not just hidden client-side on the blocker's device.
export type ReportTargetType = 'REVIEW' | 'MESSAGE' | 'USER';
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export interface Report {
  readonly id: string;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly reporterUserId: string;
  readonly reason: string;
  readonly status: ReportStatus;
  readonly resolvedByUserId: string | null;
  readonly resolvedAt: Date | null;
  readonly resolutionNote: string | null;
  readonly createdAt: Date;
}
