import { describe, expect, it, vi } from 'vitest';
import { DomainEvent } from '../../../../shared/events/domain-event';
import { EventBusPort, DomainEventHandler } from '../../../../shared/events/event-bus.port';
import { ORDER_CANCELLED_EVENT, OrderCancelledPayload } from '../../../orders/events/published/order-cancelled.event';
import { PaymentsService } from '../../../payments/application/payments.service';
import { SupportService } from '../../application/support.service';
import { OnPaidOrderCancelledHandler } from './on-paid-order-cancelled.handler';

function makeHarness(refundableAmount: bigint | null) {
  let onCancelled: DomainEventHandler<OrderCancelledPayload> | undefined;
  const eventBus: EventBusPort = {
    subscribe: <TPayload>(name: string, handler: DomainEventHandler<TPayload>) => {
      if (name === ORDER_CANCELLED_EVENT) onCancelled = handler as unknown as DomainEventHandler<OrderCancelledPayload>;
    },
    publish: async () => undefined,
  };
  const payments = { refundableAmountForOrder: vi.fn(async () => refundableAmount) } as unknown as PaymentsService;
  const support = { createCancellationRefundReview: vi.fn(async () => ({ id: 'case-id' })) } as unknown as SupportService;
  const handler = new OnPaidOrderCancelledHandler(eventBus, payments, support);
  handler.onModuleInit();

  return {
    onCancelled: (payload: OrderCancelledPayload) => {
      if (!onCancelled) throw new Error('order.cancelled handler was not registered');
      return onCancelled({
        name: ORDER_CANCELLED_EVENT,
        version: 2,
        occurredAt: new Date('2026-01-01T00:00:00.000Z'),
        payload,
      } satisfies DomainEvent<OrderCancelledPayload>);
    },
    payments,
    support,
  };
}

const cancelledOrder: OrderCancelledPayload = {
  orderId: 'order-1',
  buyerUserId: 'buyer-1',
  sellerId: 'seller-1',
  reason: 'Seller cancelled',
  cancelledByUserId: 'seller-1',
  wasPaid: true,
  currency: 'USD',
  itemAmount: '1000',
  commissionAmount: '100',
  sellerNetAmount: '900',
};

describe('OnPaidOrderCancelledHandler', () => {
  it('creates an idempotent Finance review case for the remaining refundable balance', async () => {
    const harness = makeHarness(875n);

    await harness.onCancelled(cancelledOrder);

    expect(harness.payments.refundableAmountForOrder).toHaveBeenCalledWith('order-1');
    expect(harness.support.createCancellationRefundReview).toHaveBeenCalledWith(expect.objectContaining({
      sourceEventKey: 'paid-order-cancelled:order-1',
      customerUserId: 'buyer-1',
      orderId: 'order-1',
      requestedRefundAmount: 875n,
      refundReason: 'Seller cancelled',
    }));
  });

  it('does not request a refund for unpaid cancellations or orders with no refundable balance', async () => {
    const harness = makeHarness(null);

    await harness.onCancelled({ ...cancelledOrder, wasPaid: false });
    expect(harness.payments.refundableAmountForOrder).not.toHaveBeenCalled();

    await harness.onCancelled(cancelledOrder);
    expect(harness.support.createCancellationRefundReview).not.toHaveBeenCalled();
  });
});
