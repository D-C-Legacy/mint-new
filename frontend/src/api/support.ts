import { api } from './index';

export type SupportTicket = {
  id: string;
  orderId: string | null;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'ESCALATED';
  requestedRefundAmount: number | null;
  refundReason: string | null;
  refundDecision: 'NONE' | 'PENDING' | 'APPROVED' | 'PROCESSING' | 'DENIED' | 'ISSUED';
  messages: { id: string; authorId: string; body: string; createdAt: string }[];
};

export async function listSupportTickets(): Promise<SupportTicket[]> {
  const page = await api.request<{ items: SupportTicket[]; nextCursor: string | null }>('/support/tickets');
  return page.items;
}

export function createSupportTicket(input: {
  subject: string;
  body: string;
  orderId?: string;
  requestedRefundAmount?: number;
  refundReason?: string;
}) {
  return api.request<SupportTicket>('/support/tickets', { method: 'POST', body: input });
}

export function replyToSupportTicket(ticketId: string, body: string) {
  return api.request<SupportTicket>(`/support/tickets/${ticketId}/messages`, { method: 'POST', body: { body } });
}
