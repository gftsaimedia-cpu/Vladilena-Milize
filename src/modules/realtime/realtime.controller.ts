import { Controller, Get, Inject, Optional, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequireCap, type UserSession } from '../../common';
import { AuthService } from '../auth/auth.service';
import { readSessionCookie } from '../auth/auth.guard';
import { capsOf } from '../auth/domain';
import { RealtimeBus } from './realtime-bus';

export const HEARTBEAT_MS = 25_000;
export const MAX_STREAMS_PER_USER = 5;

@Controller('api/v2/realtime')
export class RealtimeController {
  private readonly open = new Map<string, number>();

  constructor(
    @Inject(RealtimeBus) private readonly bus: RealtimeBus,
    // Kiểm lại phiên trước mỗi sự kiện: tài khoản bị khoá, đổi mật khẩu, hạ quyền hay phiên hết hạn thì luồng đang mở phải đóng.
    @Optional() @Inject(AuthService) private readonly auth?: AuthService
  ) {}

  // Quyền như xem chấm công của mọi người; nhân viên thường 403, chưa đăng nhập 401 (AuthGuard).
  @RequireCap('attendance.correct')
  @Get('stream')
  stream(@Req() req: Request, @Res() res: Response): void {
    const user = (req as Request & { user?: UserSession }).user;
    const key = user?.username ?? '';
    if ((this.open.get(key) ?? 0) >= MAX_STREAMS_PER_USER) {
      res.status(429).json({ error: 'Quá nhiều kết nối realtime đang mở', code: 'TOO_MANY_STREAMS' });
      return;
    }
    this.open.set(key, (this.open.get(key) ?? 0) + 1);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    req.socket.setNoDelay(true);
    req.socket.setTimeout(0);

    const send = (chunk: string) => {
      if (!res.writableEnded && !res.destroyed) res.write(chunk);
    };
    send('retry: 3000\nevent: ready\ndata: {}\n\n');
    const token = readSessionCookie(req.headers?.cookie);
    let queue: Promise<void> = Promise.resolve(); // giữ đúng thứ tự sự kiện dù kiểm phiên bất đồng bộ
    const frame = (event: { type: string }) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    const unsubscribe = this.bus.subscribe(event => {
      const auth = this.auth;
      if (!auth) {
        send(frame(event));
        return;
      }
      queue = queue.then(async () => {
        const current = await auth.verifySession(token).catch(() => null);
        if (!current || !capsOf(current.role).includes('attendance.correct')) {
          if (!res.writableEnded) res.end();
          return;
        }
        send(frame(event));
      });
    });
    const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      const left = (this.open.get(key) ?? 1) - 1;
      if (left <= 0) this.open.delete(key);
      else this.open.set(key, left);
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  }
}
