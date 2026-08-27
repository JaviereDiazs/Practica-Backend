import { DomainError } from './domain.error.js';

// → 400. For business-rule validation that happens in the domain/application
// layer — request-shape validation is already handled by the global
// ValidationPipe + class-validator DTOs, see main.ts.
export class ValidationError extends DomainError {}
