import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { generateId } from '../../../../shared/ids/id';
import { PrismaService } from '../../../../platform/database/prisma.service';
import { SupportTicket, SupportTicketMessage } from '../../domain/entities/support-ticket.entity';
import { SupportTicketCreateInput, SupportTicketRepositoryPort } from '../../domain/ports/support-ticket.repository.port';

const includeMessages = {
  messages: { orderBy: { createdAt: 'asc' as const } },
  order: { select: { currency: true } },
} satisfies Prisma.SupportTicketInclude;
type TicketRow = Prisma.SupportTicketGetPayload<{ include: typeof includeMessages }>;

function toDomain(row: TicketRow): SupportTicket {
  const messages: SupportTicketMessage[] = row.messages.map((message) => ({
    id: message.id, authorId: message.authorId, body: message.body, createdAt: message.createdAt,
  }));
  return {
    id: row.id, customerUserId: row.customerUserId, assignedToUserId: row.assignedToUserId,
    orderId: row.orderId, currency: row.order?.currency ?? null, subject: row.subject, status: row.status,
    requestedRefundAmount: row.requestedRefundAmount, refundReason: row.refundReason,
    refundDecision: row.refundDecision, refundDecisionById: row.refundDecisionById,
    refundDecisionAt: row.refundDecisionAt, refundId: row.refundId,
    createdAt: row.createdAt, updatedAt: row.updatedAt, messages,
  };
}

@Injectable()
export class SupportTicketPrismaRepository implements SupportTicketRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: SupportTicketCreateInput): Promise<SupportTicket> {
    const row = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          id: input.id, customerUserId: input.customerUserId, orderId: input.orderId,
          subject: input.subject, requestedRefundAmount: input.requestedRefundAmount,
          refundReason: input.refundReason, refundDecision: input.requestedRefundAmount === null ? 'NONE' : 'PENDING',
        },
      });
      await tx.supportTicketMessage.create({
        data: { id: generateId(), ticketId: ticket.id, authorId: input.customerUserId, body: input.body },
      });
      return tx.supportTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: includeMessages });
    });
    return toDomain(row);
  }

  async createCancellationReview(input: SupportTicketCreateInput & { readonly sourceEventKey: string }): Promise<SupportTicket> {
    const row = await this.prisma.supportTicket.upsert({
      where: { sourceEventKey: input.sourceEventKey },
      update: {},
      create: {
        id: input.id, customerUserId: input.customerUserId, orderId: input.orderId,
        subject: input.subject, requestedRefundAmount: input.requestedRefundAmount,
        refundReason: input.refundReason, refundDecision: 'PENDING',
        sourceEventKey: input.sourceEventKey,
        messages: { create: { id: generateId(), authorId: input.customerUserId, body: input.body } },
      },
      include: includeMessages,
    });
    return toDomain(row);
  }

  async listForCustomer(userId: string, cursor: string | undefined, limit: number): Promise<SupportTicket[]> {
    const rows = await this.prisma.supportTicket.findMany({
      where: { customerUserId: userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: includeMessages,
    });
    return rows.map(toDomain);
  }

  async findForCustomer(ticketId: string, userId: string): Promise<SupportTicket | null> {
    const row = await this.prisma.supportTicket.findFirst({ where: { id: ticketId, customerUserId: userId }, include: includeMessages });
    return row ? toDomain(row) : null;
  }

  async listForStaff(status: SupportTicket['status'] | undefined, cursor: string | undefined, limit: number): Promise<SupportTicket[]> {
    const rows = await this.prisma.supportTicket.findMany({
      where: status ? { status } : {}, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: includeMessages,
    });
    return rows.map(toDomain);
  }

  async findById(ticketId: string): Promise<SupportTicket | null> {
    const row = await this.prisma.supportTicket.findUnique({ where: { id: ticketId }, include: includeMessages });
    return row ? toDomain(row) : null;
  }

  async addMessage(ticketId: string, authorId: string, body: string): Promise<SupportTicket | null> {
    const exists = await this.prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
    if (!exists) return null;
    await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({ data: { id: generateId(), ticketId, authorId, body } }),
      this.prisma.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } }),
    ]);
    return this.findById(ticketId);
  }

  async updateStatus(ticketId: string, status: SupportTicket['status']): Promise<SupportTicket | null> {
    const { count } = await this.prisma.supportTicket.updateMany({ where: { id: ticketId }, data: { status } });
    return count ? this.findById(ticketId) : null;
  }

  async assign(ticketId: string, assigneeUserId: string): Promise<SupportTicket | null> {
    const assignee = await this.prisma.user.findFirst({
      where: { id: assigneeUserId, status: 'ACTIVE', role: { in: ['SUPPORT_AGENT', 'SUPPORT_LEAD'] } }, select: { id: true },
    });
    if (!assignee) return null;
    const { count } = await this.prisma.supportTicket.updateMany({ where: { id: ticketId }, data: { assignedToUserId: assigneeUserId } });
    return count ? this.findById(ticketId) : null;
  }

  async decideRefund(ticketId: string, decision: 'APPROVED' | 'DENIED', actorUserId: string): Promise<SupportTicket | null> {
    const { count } = await this.prisma.supportTicket.updateMany({
      where: { id: ticketId, refundDecision: 'PENDING', requestedRefundAmount: { not: null } },
      data: { refundDecision: decision, refundDecisionById: actorUserId, refundDecisionAt: new Date() },
    });
    return count ? this.findById(ticketId) : null;
  }

  async markRefundIssued(ticketId: string, refundId: string): Promise<SupportTicket | null> {
    const { count } = await this.prisma.supportTicket.updateMany({
      where: { id: ticketId, refundDecision: 'PROCESSING', refundId: null }, data: { refundDecision: 'ISSUED', refundId },
    });
    return count ? this.findById(ticketId) : null;
  }

  async claimRefundIssue(ticketId: string): Promise<SupportTicket | null> {
    const { count } = await this.prisma.supportTicket.updateMany({ where: { id: ticketId, refundDecision: 'APPROVED' }, data: { refundDecision: 'PROCESSING' } });
    return count ? this.findById(ticketId) : null;
  }

  async releaseRefundIssue(ticketId: string): Promise<void> {
    await this.prisma.supportTicket.updateMany({ where: { id: ticketId, refundDecision: 'PROCESSING', refundId: null }, data: { refundDecision: 'APPROVED' } });
  }
}
