import { Controller, Post, Get, Put, Body, Req, Res, UseFilters } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiExceptionFilter, BadRequestError, UnauthorizedError, CurrentUser, UserSession } from '../../common';
import { AuthService } from './auth.service';

@Controller('api')
@UseFilters(ApiExceptionFilter)
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('login')
  async login(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response
  ): Promise<unknown> {
    const { username, password } = body || {};
    const result = await this.service.login(username, password);
    res.setHeader('Set-Cookie', this.service.createCookieHeader(result.token));
    return { ok: true, me: result.user };
  }

  @Post('v2/auth/login')
  async loginV2(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response
  ): Promise<unknown> {
    const { username, password } = body || {};
    const result = await this.service.login(username, password);
    res.setHeader('Set-Cookie', this.service.createCookieHeader(result.token));
    return { ok: true, user: result.user, token: result.token };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response): Promise<unknown> {
    res.setHeader('Set-Cookie', this.service.clearCookieHeader());
    return { ok: true };
  }

  @Post('v2/auth/logout')
  async logoutV2(@Res({ passthrough: true }) res: Response): Promise<unknown> {
    res.setHeader('Set-Cookie', this.service.clearCookieHeader());
    return { ok: true };
  }

  @Get('me')
  async me(@Req() req: Request): Promise<unknown> {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/session=([^;]+)/);
    const token = match ? match[1] : '';

    const user = await this.service.verifySession(token);
    if (!user) {
      return { me: null };
    }
    return { me: user };
  }

  @Get('v2/auth/me')
  async meV2(@Req() req: Request): Promise<unknown> {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/session=([^;]+)/);
    const token = match ? match[1] : '';

    const user = await this.service.verifySession(token);
    if (!user) {
      throw new UnauthorizedError('Chưa đăng nhập');
    }
    return { user };
  }

  @Put('password')
  async changePassword(
    @Req() req: Request,
    @Body() body: any
  ): Promise<unknown> {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/session=([^;]+)/);
    const token = match ? match[1] : '';

    const user = await this.service.verifySession(token);
    if (!user) {
      throw new UnauthorizedError('Chưa đăng nhập');
    }

    const { oldPassword, newPassword } = body || {};
    await this.service.changePassword(user.username, oldPassword, newPassword);
    return { ok: true };
  }
}
