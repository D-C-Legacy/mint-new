import { apiClient } from '../auth/AuthContext';

export type SupportTicket = {
  id: string;
  customerUserId: string;
  assignedToUserId: string | null;
  orderId: string | null;
  currency: string | null;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'ESCALATED';
  requestedRefundAmount: number | null;
  refundReason: string | null;
  refundDecision: 'NONE' | 'PENDING' | 'APPROVED' | 'PROCESSING' | 'DENIED' | 'ISSUED';
  refundId: string | null;
  messages: { id: string; authorId: string; body: string; createdAt: string }[];
};

export function listSupportTickets(status?: string) {
  return apiClient.request<{ items: SupportTicket[]; nextCursor: string | null }>('/admin/support/tickets', { query: { status, limit: 50 } });
}
export function getSupportTicket(id: string) {
  return apiClient.request<SupportTicket>(`/admin/support/tickets/${id}`);
}
export function replyToSupportTicket(id: string, body: string) {
  return apiClient.request<SupportTicket>(`/admin/support/tickets/${id}/messages`, { method: 'POST', body: { body } });
}
export function updateSupportTicketStatus(id: string, status: string) {
  return apiClient.request<SupportTicket>(`/admin/support/tickets/${id}/status`, { method: 'PATCH', body: { status } });
}
export function assignSupportTicket(id: string, assigneeUserId: string) {
  return apiClient.request<SupportTicket>(`/admin/support/tickets/${id}/assign`, { method: 'PATCH', body: { assigneeUserId } });
}
export function escalateSupportTicket(id: string) {
  return apiClient.request<SupportTicket>(`/admin/support/tickets/${id}/escalate`, { method: 'POST' });
}
export function decideSupportRefund(id: string, decision: 'APPROVED' | 'DENIED') {
  return apiClient.request<SupportTicket>(`/admin/support/tickets/${id}/refund-decision`, { method: 'POST', body: { decision } });
}
export function issueSupportRefund(id: string) {
  return apiClient.request<SupportTicket>(`/admin/support/tickets/${id}/issue-refund`, { method: 'POST', idempotent: true });
}
