import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ApiGate } from './api-gate';
import { API_CONTEXT_KEY } from './api-context';

/** Mọi route /api đi qua đây: dựng ApiContext (phiên, quyền, giới hạn tải) rồi gắn vào yêu cầu cho @Ctx(). */
@Injectable()
export class ApiGuard implements CanActivate {
  constructor(@Inject(ApiGate) private readonly gate: ApiGate) {}

  async canActivate(host: ExecutionContext): Promise<boolean> {
    const http = host.switchToHttp();
    const req = http.getRequest();
    req[API_CONTEXT_KEY] = await this.gate.open(req, http.getResponse());
    return true;
  }
}
