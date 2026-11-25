import { z } from 'zod';

export const CreateSupportTicketSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  orderId: z.string().min(1).optional(),
  requestedRefundAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).transform((amount) => BigInt(amount)).optional(),
  refundReason: z.string().trim().min(1).max(1000).optional(),
}).strict().refine(
  (value) => (value.requestedRefundAmount === undefined) === (value.refundReason === undefined),
  { message: 'A refund request needs both an amount and a reason' },
).refine(
  (value) => value.requestedRefundAmount === undefined || value.orderId !== undefined,
  { message: 'A refund request must include an order' },
);
export type CreateSupportTicketDto = z.infer<typeof CreateSupportTicketSchema>;
