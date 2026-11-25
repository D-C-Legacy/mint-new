import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { JwtGuard, AuthenticatedUser } from '../../../../platform/auth/jwt.guard';
import { CurrentUser } from '../../../../platform/auth/current-user.decorator';
import { RolesGuard } from '../../../../platform/auth/roles.guard';
import { Roles } from '../../../../platform/auth/roles.decorator';
import { DefaultRateLimitGuard } from '../../../../platform/rate-limit/default-rate-limit.guard';
import { IdempotencyGuard } from '../../../../platform/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../../platform/validation/zod-validation.pipe';
import { toHttpException } from '../../../../shared/errors/to-http-exception';
import { AdminService } from '../../../admin/application/admin.service';
import { PaymentsService } from '../../../payments/application/payments.service';
import { SupportRefundDecisionConflictError } from '../../domain/errors/support.errors';
import { SupportService } from '../../application/support.service';
import {
  AssignSupportTicketSchema, AssignSupportTicketDto, ListSupportTicketsSchema, ListSupportTicketsDto,
  RefundDecisionSchema, RefundDecisionDto, SupportMessageSchema, SupportMessageDto,
  UpdateSupportTicketStatusSchema, UpdateSupportTicketStatusDto,
} from './dto/support-ticket-queries.dto';

@Controller('admin/support/tickets')
@UseGuards(JwtGuard, RolesGuard, DefaultRateLimitGuard)
@Roles('ADMIN', 'SUPPORT_AGENT', 'SUPPORT_LEAD', 'FINANCE')
export class AdminSupportController {
  constructor(
    private readonly support: SupportService,
    private readonly payments: PaymentsService,
    private readonly admin: AdminService,
  ) {}

  @Get()
  async list(@Query(new ZodValidationPipe(ListSupportTicketsSchema)) query: ListSupportTicketsDto): Promise<{ data: unknown }> {
    return { data: await this.support.listForStaff(query.status, query.cursor, query.limit) };
  }

  @Get(':id')
  async get(@Param('id') ticketId: string): Promise<{ data: unknown }> {
    return { data: await this.support.getForStaff(ticketId) };
  }

  @Post(':id/messages')
  @Roles('ADMIN', 'SUPPORT_AGENT', 'SUPPORT_LEAD')
  async reply(
    @Param('id') ticketId: string,
    @Body(new ZodValidationPipe(SupportMessageSchema)) dto: SupportMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: unknown }> {
    return { data: await this.support.addMessage(ticketId, user.id, dto.body) };
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'SUPPORT_AGENT', 'SUPPORT_LEAD')
  async updateStatus(
    @Param('id') ticketId: string,
    @Body(new ZodValidationPipe(UpdateSupportTicketStatusSchema)) dto: UpdateSupportTicketStatusDto,
  ): Promise<{ data: unknown }> {
    return { data: await this.support.updateStatus(ticketId, dto.status) };
  }

  @Patch(':id/assign')
  @Roles('SUPPORT_LEAD')
  async assign(
    @Param('id') ticketId: string,
    @Body(new ZodValidationPipe(AssignSupportTicketSchema)) dto: AssignSupportTicketDto,
  ): Promise<{ data: unknown }> {
    return { data: await this.support.assign(ticketId, dto.assigneeUserId) };
  }

  @Post(':id/escalate')
  @Roles('SUPPORT_LEAD')
  @HttpCode(200)
  async escalate(@Param('id') ticketId: string): Promise<{ data: unknown }> {
    return { data: await this.support.updateStatus(ticketId, 'ESCALATED') };
  }

  @Post(':id/refund-decision')
  @Roles('FINANCE')
  @HttpCode(200)
  async refundDecision(
    @Param('id') ticketId: string,
    @Body(new ZodValidationPipe(RefundDecisionSchema)) dto: RefundDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<{ data: unknown }> {
    const ticket = await this.support.decideRefund(ticketId, dto.decision, user.id);
    await this.admin.recordAuditLog({
      actorUserId: user.id, action: `support.refund_${dto.decision.toLowerCase()}`,
      targetType: 'SupportTicket', targetId: ticketId,
      after: { decision: dto.decision, orderId: ticket.orderId, amount: ticket.requestedRefundAmount?.toString() },
      ipAddress: request.ip,
    });
    return { data: ticket };
  }

  @Post(':id/issue-refund')
  @Roles('FINANCE')
  @HttpCode(200)
  @UseInterceptors(IdempotencyGuard)
  async issueRefund(
    @Param('id') ticketId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<{ data: unknown }> {
    const approved = await this.support.getForStaff(ticketId);
    if (approved.refundDecision !== 'APPROVED' || !approved.orderId || approved.requestedRefundAmount === null || !approved.refundReason) {
      throw new SupportRefundDecisionConflictError();
    }
    await this.support.claimRefundIssue(ticketId);
    const orderId = approved.orderId;
    const amount = approved.requestedRefundAmount;
    const reason = approved.refundReason;
    const refund = await this.payments.refundPayment({
      orderId,
      initiatedByUserId: user.id,
      amount,
      reason,
    });
    if (!refund.ok) {
      await this.support.releaseRefundIssue(ticketId);
      throw toHttpException(refund.error);
    }
    const issued = await this.support.markRefundIssued(ticketId, refund.value.refundId);
    await this.admin.recordAuditLog({
      actorUserId: user.id, action: 'support.refund_issued', targetType: 'SupportTicket', targetId: ticketId,
      after: { refundId: refund.value.refundId, orderId, amount: amount.toString() },
      ipAddress: request.ip,
    });
    return { data: issued };
  }
}
