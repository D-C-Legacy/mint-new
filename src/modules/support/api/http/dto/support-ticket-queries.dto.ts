import { z } from 'zod';

export const ListSupportTicketsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'ESCALATED']).optional(),
}).strict();
export type ListSupportTicketsDto = z.infer<typeof ListSupportTicketsSchema>;

export const SupportMessageSchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();
export type SupportMessageDto = z.infer<typeof SupportMessageSchema>;

export const UpdateSupportTicketStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED']),
}).strict();
export type UpdateSupportTicketStatusDto = z.infer<typeof UpdateSupportTicketStatusSchema>;

export const AssignSupportTicketSchema = z.object({ assigneeUserId: z.string().min(1) }).strict();
export type AssignSupportTicketDto = z.infer<typeof AssignSupportTicketSchema>;

export const RefundDecisionSchema = z.object({ decision: z.enum(['APPROVED', 'DENIED']) }).strict();
export type RefundDecisionDto = z.infer<typeof RefundDecisionSchema>;
