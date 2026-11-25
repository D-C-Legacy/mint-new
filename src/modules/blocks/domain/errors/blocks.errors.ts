import { DomainError } from '../../../../shared/errors/domain-error';
import { ErrorCodes } from '../../../../shared/errors/error-codes';

export class CannotBlockSelfError extends DomainError {
  readonly code = ErrorCodes.VALIDATION_ERROR;

  constructor() {
    super('You cannot block yourself');
  }
}
