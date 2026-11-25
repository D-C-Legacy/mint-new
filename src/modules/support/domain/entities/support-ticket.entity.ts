export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'ESCALATED';
export type SupportRefundDecision = 'NONE' | 'PENDING' | 'APPROVED' | 'PROCESSING' | 'DENIED' | 'ISSUED';

export interface SupportTicketMessage {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: Date;
}

export interface SupportTicket {
  readonly id: string;
  readonly customerUserId: string;
  readonly assignedToUserId: string | null;
  readonly orderId: string | null;
  readonly currency: string | null;
  readonly subject: string;
  readonly status: SupportTicketStatus;
  readonly requestedRefundAmount: bigint | null;
  readonly refundReason: string | null;
  readonly refundDecision: SupportRefundDecision;
  readonly refundDecisionById: string | null;
  readonly refundDecisionAt: Date | null;
  readonly refundId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly messages: readonly SupportTicketMessage[];
}
