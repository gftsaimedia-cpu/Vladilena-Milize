import type { IncomingMessage, ServerResponse } from 'node:http';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Ngữ cảnh của một yêu cầu /api đã qua cổng quyền: người gọi, chính sách của route, ngữ cảnh nhật ký và các hàm cổng. */
export interface ApiContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  /** ['api', ...] */
  seg: string[];
  /** 'GET /sheet' (hai đoạn đầu) */
  route: string;
  /** khoá trong ROUTE_CAPS, ví dụ 'PUT /staff/:u' */
  routeKey: string;
  me: any;
  policy: any;
  actx: any;
  /** Trả người gọi hoặc ném 401. */
  need(): any;
  /** Khẳng định route đã khai báo năng lực và người gọi đã qua cổng đó (test tĩnh permissions-matrix nhận dạng theo tên này). */
  needAdmin(): any;
  /** Cổng khoá kỳ: kỳ đã khoá thì ghi cảnh báo PERIOD_LOCKED và route vẫn lưu. dates: ngày hoặc tháng. */
  guardPeriod(...dates: any[]): Promise<void>;
}

export const API_CONTEXT_KEY = 'apiContext';
/** Địa chỉ yêu cầu gốc (chưa đụng tới dấu %) do bootstrap lưu trước khi giao cho Express. */
export const RAW_URL = 'rawUrl';

/** @Ctx() lấy ApiContext do ApiGuard dựng. */
export const Ctx = createParamDecorator(
  (_: unknown, host: ExecutionContext): ApiContext => host.switchToHttp().getRequest()[API_CONTEXT_KEY]
);
