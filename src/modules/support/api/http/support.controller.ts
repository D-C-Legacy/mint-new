import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard, AuthenticatedUser } from '../../../../platform/auth/jwt.guard';
import { CurrentUser } from '../../../../platform/auth/current-user.decorator';
import { DefaultRateLimitGuard } from '../../../../platform/rate-limit/default-rate-limit.guard';
import { ZodValidationPipe } from '../../../../platform/validation/zod-validation.pipe';
import { SupportService } from '../../application/support.service';
import { CreateSupportTicketSchema, CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { ListSupportTicketsSchema, ListSupportTicketsDto, SupportMessageSchema, SupportMessageDto } from './dto/support-ticket-queries.dto';

@Controller('support/tickets')
@UseGuards(JwtGuard, DefaultRateLimitGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateSupportTicketSchema)) dto: CreateSupportTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: unknown }> {
    return { data: await this.support.create({
      customerUserId: user.id,
      orderId: dto.orderId,
      subject: dto.subject,
      body: dto.body,
      requestedRefundAmount: dto.requestedRefundAmount,
      refundReason: dto.refundReason,
    }) };
  }

  @Get()
  async listMine(
    @Query(new ZodValidationPipe(ListSupportTicketsSchema)) query: ListSupportTicketsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: unknown }> {
    return { data: await this.support.listMine(user.id, query.cursor, query.limit) };
  }

  @Get(':id')
  async getMine(@Param('id') ticketId: string, @CurrentUser() user: AuthenticatedUser): Promise<{ data: unknown }> {
    return { data: await this.support.getMine(ticketId, user.id) };
  }

  @Post(':id/messages')
  async reply(
    @Param('id') ticketId: string,
    @Body(new ZodValidationPipe(SupportMessageSchema)) dto: SupportMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: unknown }> {
    await this.support.getMine(ticketId, user.id);
    return { data: await this.support.addMessage(ticketId, user.id, dto.body) };
  }
}
