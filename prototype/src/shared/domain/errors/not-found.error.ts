import { DomainError } from './domain.error.js';

// → 404. Business modules provide their own message + code, e.g.
// `new NotFoundError('User not found', 'USER_NOT_FOUND')`.
export class NotFoundError extends DomainError {}
