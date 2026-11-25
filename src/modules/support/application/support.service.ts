import { Inject, Injectable } from '@nestjs/common';
import { generateId } from '../../../shared/ids/id';
import { buildCursorPage, CursorPage, normalizeLimit } from '../../../shared/pagination/cursor';
import { OrderNotFoundError } from '../../orders/domain/errors/orders.errors';
import { OrdersService } from '../../orders/application/orders.service';
import { SupportTicket, SupportTicketStatus } from '../domain/entities/support-ticket.entity';
import { SUPPORT_TICKET_REPOSITORY, SupportTicketRepositoryPort } from '../domain/ports/support-ticket.repository.port';
import { SupportRefundDecisionConflictError, SupportTicketNotFoundError } from '../domain/errors/support.errors';

export interface CreateSupportTicketCommand {
  readonly customerUserId: string;
  readonly orderId: string | undefined;
  readonly subject: string;
  readonly body: string;
  readonly requestedRefundAmount: bigint | undefined;
  readonly refundReason: string | undefined;
}

@Injectable()
export class SupportService {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY) private readonly tickets: SupportTicketRepositoryPort,
    private readonly orders: OrdersService,
  ) {}

  async create(cmd: CreateSupportTicketCommand): Promise<SupportTicket> {
    if (cmd.orderId) {
      const order = await this.orders.getOrder({ orderId: cmd.orderId });
      if (!order || order.buyerUserId !== cmd.customerUserId) throw new OrderNotFoundError(cmd.orderId);
    }
    return this.tickets.create({
      id: generateId(), customerUserId: cmd.customerUserId, orderId: cmd.orderId ?? null,
      subject: cmd.subject, body: cmd.body,
      requestedRefundAmount: cmd.requestedRefundAmount ?? null,
      refundReason: cmd.refundReason ?? null,
    });
  }

  async createCancellationRefundReview(cmd: CreateSupportTicketCommand & { readonly sourceEventKey: string }): Promise<SupportTicket> {
    const order = cmd.orderId ? await this.orders.getOrder({ orderId: cmd.orderId }) : null;
    if (!order || order.buyerUserId !== cmd.customerUserId) throw new OrderNotFoundError(cmd.orderId ?? '');
    return this.tickets.createCancellationReview({
      id: generateId(), customerUserId: cmd.customerUserId, orderId: order.id,
      subject: cmd.subject, body: cmd.body,
      requestedRefundAmount: cmd.requestedRefundAmount ?? null,
      refundReason: cmd.refundReason ?? null, sourceEventKey: cmd.sourceEventKey,
    });
  }

  async listMine(userId: string, cursor?: string, limit?: number): Promise<CursorPage<SupportTicket>> {
    const pageLimit = normalizeLimit(limit);
    return buildCursorPage(await this.tickets.listForCustomer(userId, cursor, pageLimit), pageLimit);
  }

  async getMine(ticketId: string, userId: string): Promise<SupportTicket> {
    const ticket = await this.tickets.findForCustomer(ticketId, userId);
    if (!ticket) throw new SupportTicketNotFoundError();
    return ticket;
  }

  async listForStaff(status?: SupportTicketStatus, cursor?: string, limit?: number): Promise<CursorPage<SupportTicket>> {
    const pageLimit = normalizeLimit(limit);
    return buildCursorPage(await this.tickets.listForStaff(status, cursor, pageLimit), pageLimit);
  }

  async getForStaff(ticketId: string): Promise<SupportTicket> {
    const ticket = await this.tickets.findById(ticketId);
    if (!ticket) throw new SupportTicketNotFoundError();
    return ticket;
  }

  async addMessage(ticketId: string, authorId: string, body: string): Promise<SupportTicket> {
    const ticket = await this.tickets.addMessage(ticketId, authorId, body);
    if (!ticket) throw new SupportTicketNotFoundError();
    return ticket;
  }

  async updateStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket> {
    const ticket = await this.tickets.updateStatus(ticketId, status);
    if (!ticket) throw new SupportTicketNotFoundError();
    return ticket;
  }

  async assign(ticketId: string, assigneeUserId: string): Promise<SupportTicket> {
    const ticket = await this.tickets.assign(ticketId, assigneeUserId);
    if (!ticket) throw new SupportTicketNotFoundError();
    return ticket;
  }

  async decideRefund(ticketId: string, decision: 'APPROVED' | 'DENIED', actorUserId: string): Promise<SupportTicket> {
    const ticket = await this.tickets.decideRefund(ticketId, decision, actorUserId);
    if (!ticket) throw new SupportRefundDecisionConflictError();
    return ticket;
  }

  async markRefundIssued(ticketId: string, refundId: string): Promise<SupportTicket> {
    const ticket = await this.tickets.markRefundIssued(ticketId, refundId);
    if (!ticket) throw new SupportRefundDecisionConflictError();
    return ticket;
  }

  async claimRefundIssue(ticketId: string): Promise<SupportTicket> {
    const ticket = await this.tickets.claimRefundIssue(ticketId);
    if (!ticket) throw new SupportRefundDecisionConflictError();
    return ticket;
  }

  async releaseRefundIssue(ticketId: string): Promise<void> {
    await this.tickets.releaseRefundIssue(ticketId);
  }
}
