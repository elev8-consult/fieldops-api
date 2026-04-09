import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status  = exception.getStatus();
      message = exception.getResponse();

    } else if (exception instanceof QueryFailedError) {
      const err = exception as any;

      this.logger.error(
        `QueryFailedError [${err.code}] on ${request.method} ${request.url}: ${err.message}`,
      );

      switch (err.code) {
        case '22P02':
          status  = HttpStatus.BAD_REQUEST;
          message = `Invalid ID format. Value received: "${
            err.parameters?.[0] ?? 'unknown'
          }". Expected a valid UUID.`;
          break;
        case '23502':
          status  = HttpStatus.BAD_REQUEST;
          message = `Missing required field: ${err.column ?? 'unknown'}`;
          break;
        case '23505':
          status  = HttpStatus.CONFLICT;
          message = 'A record with this value already exists.';
          break;
        case '23503':
          status  = HttpStatus.BAD_REQUEST;
          message = 'Referenced record does not exist.';
          break;
        default:
          status  = HttpStatus.BAD_REQUEST;
          message = `Database error [${err.code}]: ${err.message ?? 'unknown'}`;
      }

    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
      message = exception.message;
    }

    response.status(status).json({
      statusCode: status,
      message,
      path:       request.url,
      timestamp:  new Date().toISOString(),
    });
  }
}
