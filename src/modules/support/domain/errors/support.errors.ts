import { DomainError } from '../../../../shared/errors/domain-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';

export class SupportTicketNotFoundError extends DomainError {
  readonly code = ErrorCodes.SUPPORT_TICKET_NOT_FOUND;
  constructor() { super('Support ticket not found'); }
}

export class SupportRefundDecisionConflictError extends DomainError {
  readonly code = ErrorCodes.SUPPORT_REFUND_DECISION_CONFLICT;
  constructor() { super('Refund decision is no longer pending'); }
}
