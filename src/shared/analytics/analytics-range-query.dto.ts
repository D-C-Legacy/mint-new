import { z } from 'zod';

// Shared by every `GET .../analytics/*` route that takes an optional date range — admin's and
// every seller-scoped mirror of it (engineering-hardening backlog, Phase 2). Moved here from
// modules/admin for the same reason as its sibling `analytics-range.util.ts`: avoid duplicating
// (or cross-importing between unrelated modules for) one small, module-agnostic validation shape.
//
export const AnalyticsRangeQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  granularity: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
});

export type AnalyticsRangeQueryDto = z.infer<typeof AnalyticsRangeQuerySchema>;
