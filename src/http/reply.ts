import { ExpressAdapter } from '@nestjs/platform-express';
import { send, withWarnings } from '../platform/http';

/** Phản hồi JSON có mã HTTP hoặc tiêu đề riêng. Route trả thẳng giá trị (mã 200) khi không cần hai thứ đó. */
export class Reply {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly headers: Record<string, string> = {}
  ) {}
}

/**
 * Cách duy nhất ghi phản hồi của route: giá trị route trả về (hoặc `Reply`) đi qua `send` của src/platform/http.ts (nén gzip, Cache-Control, cảnh báo
 * gom theo yêu cầu). Mã mặc định luôn là 200, kể cả POST (Nest mặc định 201). Route phát luồng (SSE, file) dùng @Res() và tự ghi.
 */
export class ReplyAdapter extends ExpressAdapter {
  override reply(response: any, body: any, _statusCode?: number): void {
    if (body instanceof Reply) send(response, body.status, body.body, body.headers);
    else send(response, 200, body === undefined ? {} : body);
  }
}

/**
 * Gắn cảnh báo của yêu cầu vào phản hồi (xem withWarnings ở src/platform/http.ts). Phải gọi TRONG phạm vi cảnh báo của yêu cầu
 * (request-scope.interceptor), vì phản hồi được ghi sau khi phạm vi đó đã đóng.
 */
export function withRequestWarnings(value: unknown): unknown {
  if (value instanceof Reply) return new Reply(value.status, withWarnings(value.status, value.body), value.headers);
  return value === undefined ? value : withWarnings(200, value);
}
