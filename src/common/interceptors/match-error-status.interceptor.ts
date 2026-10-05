import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';

/**
 * Match endpoints answer 200 with `error: 'match_unavailable'` on failure,
 * which the n8n workflow relies on today. Callers that send
 * `X-Match-Errors: status` get a 503 instead.
 */
@Injectable()
export class MatchErrorStatusInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const wantsStatus =
      String(req.headers['x-match-errors'] ?? '').toLowerCase() === 'status';

    return next.handle().pipe(
      map((body: unknown) => {
        if (
          wantsStatus &&
          body &&
          typeof body === 'object' &&
          (body as { error?: unknown }).error === 'match_unavailable'
        ) {
          throw new ServiceUnavailableException(body);
        }
        return body;
      }),
    );
  }
}
