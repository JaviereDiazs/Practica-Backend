import { DomainError } from './domain.error.js';

// → 401, e.g. `new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS')`.
export class UnauthorizedError extends DomainError {}
