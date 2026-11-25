import { Module } from '@nestjs/common';
import { AuthModule } from '../../platform/auth/auth.module';
import { DatabaseModule } from '../../platform/database/database.module';
import { IdempotencyModule } from '../../platform/idempotency/idempotency.module';
import { RateLimitModule } from '../../platform/rate-limit/rate-limit.module';
import { AdminModule } from '../admin/admin.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { EventsModule } from '../../platform/events/events.module';
import { SUPPORT_TICKET_REPOSITORY } from './domain/ports/support-ticket.repository.port';
import { SupportTicketPrismaRepository } from './infra/repositories/support-ticket.prisma.repository';
import { SupportService } from './application/support.service';
import { SupportController } from './api/http/support.controller';
import { AdminSupportController } from './api/http/admin-support.controller';
import { OnPaidOrderCancelledHandler } from './events/handlers/on-paid-order-cancelled.handler';

@Module({
  imports: [AuthModule, DatabaseModule, IdempotencyModule, RateLimitModule, AdminModule, OrdersModule, PaymentsModule, EventsModule],
  controllers: [SupportController, AdminSupportController],
  providers: [
    { provide: SUPPORT_TICKET_REPOSITORY, useClass: SupportTicketPrismaRepository },
    SupportService,
    OnPaidOrderCancelledHandler,
  ],
})
export class SupportModule {}
