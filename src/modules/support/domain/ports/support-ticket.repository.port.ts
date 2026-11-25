import { SupportTicket, SupportTicketStatus } from '../entities/support-ticket.entity';

export const SUPPORT_TICKET_REPOSITORY = Symbol('SupportTicketRepositoryPort');

export interface SupportTicketCreateInput {
  readonly id: string;
  readonly customerUserId: string;
  readonly orderId: string | null;
  readonly subject: string;
  readonly body: string;
  readonly requestedRefundAmount: bigint | null;
  readonly refundReason: string | null;
  readonly sourceEventKey?: string | null;
}

export interface SupportTicketRepositoryPort {
  create(input: SupportTicketCreateInput): Promise<SupportTicket>;
  createCancellationReview(input: SupportTicketCreateInput & { readonly sourceEventKey: string }): Promise<SupportTicket>;
  listForCustomer(userId: string, cursor: string | undefined, limit: number): Promise<SupportTicket[]>;
  findForCustomer(ticketId: string, userId: string): Promise<SupportTicket | null>;
  listForStaff(status: SupportTicketStatus | undefined, cursor: string | undefined, limit: number): Promise<SupportTicket[]>;
  findById(ticketId: string): Promise<SupportTicket | null>;
  addMessage(ticketId: string, authorId: string, body: string): Promise<SupportTicket | null>;
  updateStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket | null>;
  assign(ticketId: string, assigneeUserId: string): Promise<SupportTicket | null>;
  decideRefund(ticketId: string, decision: 'APPROVED' | 'DENIED', actorUserId: string): Promise<SupportTicket | null>;
  claimRefundIssue(ticketId: string): Promise<SupportTicket | null>;
  releaseRefundIssue(ticketId: string): Promise<void>;
  markRefundIssued(ticketId: string, refundId: string): Promise<SupportTicket | null>;
}
