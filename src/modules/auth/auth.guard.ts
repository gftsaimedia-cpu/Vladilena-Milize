import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_KEY, type AccessRule, ForbiddenError, UnauthorizedError } from '../../common';
import { AuthService } from './auth.service';
import { capsOf } from './domain';

/** Giá trị cookie `session` trong tiêu đề Cookie; không có thì chuỗi rỗng. */
export function readSessionCookie(header: string | undefined): string {
  for (const part of String(header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === 'session') return part.slice(eq + 1).trim();
  }
  return '';
}

// Guard toàn cục (APP_GUARD): đọc phiên, gán req.user, rồi kiểm dấu quyền của handler. Không có dấu thì từ chối.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest();
    const token = readSessionCookie(req.headers?.cookie);
    const user = token ? await this.auth.verifySession(token) : null;
    if (user) req.user = user;

    if (!rule) throw new ForbiddenError('Không có quyền truy cập');
    if (rule.kind === 'public') return true;
    if (!user) throw new UnauthorizedError('Chưa đăng nhập hoặc phiên đã hết hạn');
    if (rule.kind === 'cap' && !capsOf(user.role).includes(rule.cap)) {
      throw new ForbiddenError('Không có quyền truy cập');
    }
    return true;
  }
}
