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

/**
 * HttpExceptions keep Nest's default body ({ statusCode, message, error }) so
 * the web and mobile apps can keep reading `message`. Database and unexpected
 * errors get a safe message instead of internals.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        );
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof QueryFailedError) {
      const err = exception as QueryFailedError & { code?: string };
      this.logger.error(
        `QueryFailedError [${err.code}] on ${request.method} ${request.url}: ${err.message}`,
      );

      switch (err.code) {
        case '22P02':
          status = HttpStatus.BAD_REQUEST;
          message = 'Invalid ID or value format.';
          break;
        case '23502':
          status = HttpStatus.BAD_REQUEST;
          message = 'A required field is missing.';
          break;
        case '23505':
          status = HttpStatus.CONFLICT;
          message = 'A record with this value already exists.';
          break;
        case '23503':
          status = HttpStatus.BAD_REQUEST;
          message = 'Referenced record does not exist.';
          break;
      }
    } else {
      const err = exception instanceof Error ? exception : null;
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}: ${err?.message ?? String(exception)}`,
        err?.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error:
        status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'Internal Server Error'
          : undefined,
    });
  }
}
