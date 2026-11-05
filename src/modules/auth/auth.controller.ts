import { Controller, Post, Get, Put, Body, Req, Res, UseFilters, Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiExceptionFilter, HttpError, Public, Authenticated } from '../../common';
import { AuthService, type AuthenticatedUser } from './auth.service';
import { LoginRateLimiter } from './domain';

// req.user do AuthGuard gán khi cookie phiên hợp lệ (kể cả trên route công khai).
const sessionUser = (req: Request): AuthenticatedUser | null => ((req as any).user as AuthenticatedUser) || null;

@Controller('api')
@UseFilters(ApiExceptionFilter)
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly service: AuthService,
    @Inject(LoginRateLimiter) private readonly limiter: LoginRateLimiter
  ) {}

  // Token chỉ đi trong cookie HttpOnly, không trả trong thân để mã trang không đọc được.
  // Đang bị giới hạn thì không kiểm mật khẩu. req.ip theo TRUST_PROXY (bootstrap.ts).
  @Public()
  @Post('v2/auth/login')
  async login(@Body() body: any, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<unknown> {
    const { username, password } = body || {};
    const ip = req.ip || '';
    const gate = this.limiter.check(ip, username);
    if (!gate.allowed) {
      res.setHeader('Retry-After', String(gate.retryAfterSec));
      const minutes = Math.ceil(gate.retryAfterSec / 60);
      throw new HttpError(429, `Bạn đã thử quá nhiều lần. Thử lại sau ${minutes} phút.`, { code: 'TOO_MANY_ATTEMPTS' });
    }
    let result;
    try {
      result = await this.service.login(username, password);
    } catch (err) {
      if (err instanceof HttpError && (err.details as any)?.code === 'INVALID_CREDENTIALS') {
        this.limiter.recordFailure(ip, username);
      }
      throw err;
    }
    this.limiter.recordSuccess(ip, username);
    res.setHeader('Set-Cookie', this.service.createCookieHeader(result.token));
    return { ok: true, user: result.user };
  }

  @Public()
  @Post('v2/auth/logout')
  async logout(@Res({ passthrough: true }) res: Response): Promise<unknown> {
    res.setHeader('Set-Cookie', this.service.clearCookieHeader());
    return { ok: true };
  }

  // Alias công khai: HEALTHCHECK của Dockerfile gọi GET /api/me và cần mã 200.
  @Public()
  @Get('me')
  me(@Req() req: Request): unknown {
    return this.service.mePayload(sessionUser(req));
  }

  @Public()
  @Get('v2/auth/me')
  meV2(@Req() req: Request): unknown {
    return this.service.mePayload(sessionUser(req));
  }

  @Authenticated()
  @Put('v2/auth/password')
  async changePassword(
    @Req() req: Request,
    @Body() body: any,
    @Res({ passthrough: true }) res: Response
  ): Promise<unknown> {
    const { oldPassword, newPassword } = body || {};
    const token = await this.service.changePassword(sessionUser(req)!.username, oldPassword, newPassword);
    res.setHeader('Set-Cookie', this.service.createCookieHeader(token));
    return { ok: true };
  }
}
