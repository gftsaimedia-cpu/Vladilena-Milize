import { Injectable } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
const store = require('../../lib/db');
import auth = require('../../lib/auth');
import authz = require('../../lib/authz');
import audit = require('../../lib/audit');
import config = require('../../lib/config');
import warnings = require('../../lib/warnings');
import { HttpError } from '../../lib/http';
import { Overloaded } from '../../lib/ops/limiters';
import { HEAVY_ROUTES, UNLIMITED_WRITE_ROUTES } from '../../lib/ops/route-classes';
import { shedder, writeLimiter } from './load-control';
import { RAW_URL, type ApiContext } from './api-context';

/** Ghi vào tháng đã duyệt hoặc chi trả: phiếu của lần chạy đã chốt là bản chụp đóng băng nên số đã trả KHÔNG đổi theo dữ liệu vừa lưu. */
export async function warnFrozen(month: string): Promise<void> {
  const period = await store.periods.get(month);
  if (period.status === 'approved' || period.status === 'paid')
    warnings.warn(
      'PERIOD_FROZEN',
      `Kỳ ${month} đã ${period.status === 'paid' ? 'chi trả' : 'duyệt'}: số trên phiếu đã chốt KHÔNG đổi cho tới khi kỳ được mở lại và tính lại.`,
      { details: { month, status: period.status } }
    );
}

/** Bị giới hạn tốc độ ghi theo người: 429 kèm Retry-After. */
export class WriteRateLimited extends HttpError {
  readonly headers: Record<string, string>;
  constructor(waitSec: number) {
    super(429, `Bạn thao tác quá nhanh. Thử lại sau ${waitSec} giây.`, { code: 'WRITE_RATE_LIMITED' });
    this.headers = { 'Retry-After': String(waitSec) };
  }
}

/** Cổng MỘT chỗ cho mọi route /api: đọc phiên, chính sách quyền (ROUTE_CAPS), giới hạn tải, giới hạn tốc độ ghi, ngữ cảnh nhật ký. */
@Injectable()
export class ApiGate {
  async open(req: IncomingMessage, res: ServerResponse): Promise<ApiContext> {
    const url = new URL(((req as any)[RAW_URL] ?? req.url) as string, 'http://localhost');
    const sessionUser = await auth.readSession(req.headers.cookie);
    const me = sessionUser ? await store.getStaff(sessionUser) : null;
    const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
    const method = req.method as string;
    const route = `${method} /${seg.slice(1, 3).join('/')}`;
    const need = () => {
      if (!me) throw new HttpError(401, 'Chưa đăng nhập');
      return me;
    };
    // Route không có trong ROUTE_CAPS bị từ chối mặc định; thiếu năng lực thì 403 trước khi đọc thân yêu cầu.
    const policy = authz.policyOf(authz.routeKey(method, seg));
    if (!policy) {
      need();
      throw new HttpError(403, 'Đường dẫn này chưa có chính sách quyền, bị từ chối', { code: 'NO_ROUTE_POLICY' });
    }
    if (!policy.public) {
      need();
      if (await authz.gate(me, policy))
        throw new HttpError(403, 'Chỉ Admin hoặc vai trò được giao quyền mới được thao tác này', {
          code: 'FORBIDDEN_CAP',
          cap: policy.cap
        });
    }
    // Giới hạn tải (sau cổng quyền, trước khi đọc thân yêu cầu): route nặng bị từ chối khi máy chủ nghẽn; lệnh ghi của một người bị giới hạn tốc độ
    const routeKey = authz.routeKey(method, seg);
    if (HEAVY_ROUTES.has(routeKey)) {
      const reason = shedder.check();
      if (reason)
        throw new Overloaded(`Máy chủ đang bận (${reason}), thử lại sau ít giây`, config.OVERLOAD_RETRY_AFTER_SEC);
    }
    if (me && method !== 'GET' && !UNLIMITED_WRITE_ROUTES.has(routeKey)) {
      const waitSec = writeLimiter.take(me.username);
      if (waitSec > 0) throw new WriteRateLimited(waitSec);
    }
    const actx = me ? await audit.context(me) : null; // ngữ cảnh nhật ký của yêu cầu này
    const needAdmin = () => {
      need();
      if (!policy.cap) throw new Error('needAdmin() dùng ở route không khai báo năng lực trong ROUTE_CAPS');
      return me;
    };
    const guardPeriod = async (...dates: any[]) => {
      if (!policy.periodScope) throw new Error('guardPeriod() dùng ở route không khai báo periodScope');
      for (const month of new Set(
        dates
          .flat()
          .filter(Boolean)
          .map(d => String(d).slice(0, 7))
      )) {
        await store.assertPeriodOpen(month, policy.periodScope);
        await warnFrozen(month);
      }
    };
    return { req, res, url, seg, route, routeKey, me, policy, actx, need, needAdmin, guardPeriod };
  }
}
