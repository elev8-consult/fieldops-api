import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { JwtUser } from '../interfaces/jwt-user.interface';

/**
 * Records structured access logs for mutating HTTP methods (observability).
 * Domain-level changes are written to audit_logs via AuditService in services.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpAudit');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: JwtUser;
    }>();
    const { method, url, user } = req;

    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.logger.log({
          method,
          url,
          userId: user?.id ?? null,
          role: user?.role ?? null,
        });
      }),
    );
  }
}
