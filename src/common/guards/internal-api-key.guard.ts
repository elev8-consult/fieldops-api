import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing internal API key');
    }

    const token = auth.slice('Bearer '.length).trim();
    const expected = process.env.INTERNAL_API_KEY;

    if (!expected) {
      throw new UnauthorizedException('INTERNAL_API_KEY is not configured');
    }

    const given = Buffer.from(token);
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      throw new UnauthorizedException('Invalid internal API key');
    }

    return true;
  }
}
