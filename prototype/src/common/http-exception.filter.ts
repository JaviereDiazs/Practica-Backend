import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

// Catches everything. For a Nest HttpException (NotFoundException,
// ConflictException, etc.), formats a consistent JSON body — including an
// optional `code` when the exception was thrown with a custom response
// object, e.g. `new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message })`.
// Anything else is an unexpected bug: logged, and returned as a plain 500
// without leaking internals to the client.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const timestamp = new Date().toISOString();

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        timestamp,
        path: request.url,
      });
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    const isObjectBody = typeof body === 'object' && body !== null;

    response.status(status).json({
      statusCode: status,
      ...(isObjectBody ? body : { message: body }),
      timestamp,
      path: request.url,
    });
  }
}
