import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS, EventBusPort } from '../../../../shared/events/event-bus.port';
import {
  ORDER_CANCELLED_EVENT,
  OrderCancelledPayload,
} from '../../../orders/events/published/order-cancelled.event';
import { PaymentsService } from '../../../payments/application/payments.service';
import { SupportService } from '../../application/support.service';

@Injectable()
export class OnPaidOrderCancelledHandler implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBusPort,
    private readonly payments: PaymentsService,
    private readonly support: SupportService,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<OrderCancelledPayload>(ORDER_CANCELLED_EVENT, async ({ payload }) => {
      if (!payload.wasPaid) return;

      const amount = await this.payments.refundableAmountForOrder(payload.orderId);
      if (amount === null) return;

      const reason = payload.reason ?? 'Order cancelled before shipment';
      await this.support.createCancellationRefundReview({
        sourceEventKey: `paid-order-cancelled:${payload.orderId}`,
        customerUserId: payload.buyerUserId,
        orderId: payload.orderId,
        subject: 'Refund review for cancelled order',
        body: `This paid order was cancelled and needs Finance refund review. Reason: ${reason}`,
        requestedRefundAmount: amount,
        refundReason: reason,
      });
    });
  }
}
