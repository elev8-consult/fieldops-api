import { ForbiddenException } from '@nestjs/common';
import type { JwtUser } from './interfaces/jwt-user.interface';

/**
 * Brand the caller is locked to, or null when unrestricted.
 * Brand managers must have a brand; supervisors are restricted only when assigned one.
 */
export function lockedBrandId(current: JwtUser): string | null {
  if (current.role === 'brand_manager') {
    if (current.brandId == null) {
      throw new ForbiddenException('Brand manager has no brand');
    }
    return current.brandId;
  }
  if (current.role === 'supervisor' && current.brandId != null) {
    return current.brandId;
  }
  return null;
}

/** Brand filter for list queries (undefined = no filter); a locked brand overrides the request. */
export function scopedBrandFilter(
  current: JwtUser,
  requested?: string | null,
): string | undefined {
  return lockedBrandId(current) ?? (requested || undefined);
}

export function assertBrandAccess(
  current: JwtUser,
  resourceBrandId: string | null | undefined,
): void {
  const locked = lockedBrandId(current);
  if (locked != null && resourceBrandId !== locked) {
    throw new ForbiddenException('Out of brand scope');
  }
}
