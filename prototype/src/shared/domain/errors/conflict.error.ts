import { DomainError } from './domain.error.js';

// → 409, e.g. `new ConflictError('Email already registered', 'EMAIL_ALREADY_REGISTERED')`.
export class ConflictError extends DomainError {}
