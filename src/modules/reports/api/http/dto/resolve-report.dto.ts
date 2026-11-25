import { z } from 'zod';

export const ResolveReportSchema = z
  .object({
    status: z.enum(['RESOLVED', 'DISMISSED']),
    note: z.string().trim().min(1).max(500).optional(),
    // Admin discretion, not automatic — a borderline report can be RESOLVED without either, but
    // when a report is actually acted on, this lets both happen as one step instead of the admin
    // separately hunting down the right hide/delete/suspend screen afterward (Apple Guideline 1.2:
    // acting on a valid report means removing the content and ejecting the user who posted it).
    removeContent: z.boolean().optional().default(false),
    banUser: z.boolean().optional().default(false),
  })
  .strict();

export type ResolveReportDto = z.infer<typeof ResolveReportSchema>;
