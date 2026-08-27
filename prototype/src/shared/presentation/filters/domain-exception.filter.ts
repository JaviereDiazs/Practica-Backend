import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConflictError } from '../../domain/errors/conflict.error.js';
import { DomainError } from '../../domain/errors/domain.error.js';
import { NotFoundError } from '../../domain/errors/not-found.error.js';
import { UnauthorizedError } from '../../domain/errors/unauthorized.error.js';
import { ValidationError } from '../../domain/errors/validation.error.js';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  timestamp: string;
  path: string;
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.resolve(exception, request.url);
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }
    response.status(status).json(body);
  }

  private resolve(exception: unknown, path: string): { status: number; body: ErrorBody } {
    const timestamp = new Date().toISOString();

    if (exception instanceof DomainError) {
      const status = this.statusForDomainError(exception);
      return { status, body: { statusCode: status, code: exception.code, message: exception.message, timestamp, path } };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message = typeof response === 'string' ? response : ((response as { message?: string }).message ?? exception.message);
      return { status, body: { statusCode: status, code: 'HTTP_EXCEPTION', message, timestamp, path } };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        timestamp,
        path,
      },
    };
  }

  private statusForDomainError(error: DomainError): number {
    if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
    if (error instanceof ConflictError) return HttpStatus.CONFLICT;
    if (error instanceof UnauthorizedError) return HttpStatus.UNAUTHORIZED;
    if (error instanceof ValidationError) return HttpStatus.BAD_REQUEST;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
