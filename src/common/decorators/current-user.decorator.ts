import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface UserSession {
  username: string;
  name: string;
  role: string;
  type: string;
  level: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserSession | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user || req.me || req.apiContext?.me;
  }
);
