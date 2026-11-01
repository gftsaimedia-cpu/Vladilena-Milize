import { Inject, Injectable } from '@nestjs/common';
import { AUTHZ, STORE } from '../../core/tokens';
const { AsyncList } = require('../../shared/async-list');
// Route đọc lịch sử yêu cầu ứng lương.
// server.js không có gì ở đây: src/domain/routes.js gửi đường dẫn /api/advance-requests tới handle(). Quyền ở cổng ROUTE_CAPS (src/platform/authz.ts);
// đọc bảng ở src/domain/advance/advance-requests.ts; mức tối đa do bộ máy lương tính (src/domain/advance/advance-cap.ts).
//   GET  /api/advance-requests?month=[&username=][&status=]   { month, scope, items, pending?, cap, granted, remaining, eligible, reason? }
//        nhân sự: của mình, kèm cap (đồng) = mức tối đa của tháng; người có quyền duyệt (hoặc xem lương): mọi người (không có cap), hoặc một người nếu có username
// Số đã duyệt ở đây không trừ vào phiếu; tạm ứng là số theo quy tắc, chỉ trừ khi Admin duyệt (src/domain/advance/routes.js).

const advances = require('../../domain/advance/advance-requests');
const advanceCap = require('../../domain/advance/advance-cap');
const { HttpError, send } = require('../../platform/http');
const { validMonth, USERNAME_RE } = require('../../domain/input');

// Mức tối đa của một người trong tháng, phẳng để giao diện đọc thẳng: cap (đồng), granted (đã duyệt), remaining (còn được ứng), eligible và reason khi không được ứng
const capView = info => ({
  cap: info.cap,
  granted: info.granted,
  remaining: info.remaining,
  eligible: info.eligible,
  ...(info.reason ? { reason: info.reason } : {})
});
// Mã lỗi của src/domain/advance/advance-requests.ts mang httpStatus; chuyển thành HttpError để send() trả đúng mã
const wrap = async fn => {
  try {
    return await fn();
  } catch (e) {
    if (e && e.httpStatus && !(e instanceof HttpError))
      throw new HttpError(e.httpStatus, e.message, { code: e.code, ...(e.details || {}) });
    throw e;
  }
};
// Người xem được yêu cầu của người khác: có quyền duyệt (ở phạm vi tất cả) hoặc xem lương

@Injectable()
export class AdvanceRequestsHandlers {
  constructor(
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(STORE) private readonly store: any
  ) {}

  viewsAll = async me =>
    (await this.authz.scopeOf(me, advances.DECIDE_CAP)) === 'all' ||
    (await this.authz.scopeOf(me, 'payroll.view')) === 'all';

  list = async ({ res, url, me }) => {
    const q = url.searchParams;
    const month = q.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải có dạng YYYY-MM', { code: 'BAD_MONTH' });
    const status = q.get('status') || undefined;
    const asked = q.get('username') ? q.get('username').toLowerCase() : undefined;
    if (asked !== undefined && !USERNAME_RE.test(asked)) throw new HttpError(400, 'username không hợp lệ');
    const all = await this.viewsAll(me);
    if (asked !== undefined && asked !== me.username && !all)
      throw new HttpError(403, 'Chỉ xem được yêu cầu ứng lương của chính mình', { code: 'FORBIDDEN_CAP' });
    const target = asked !== undefined ? asked : all ? undefined : me.username;
    const items = await AsyncList.map(
      await wrap(async () => await advances.list({ month, username: target, status })),
      async r => {
        const person = await this.store.getStaff(r.username);
        return { ...r, name: person ? person.name : r.username };
      }
    );
    return {
      month,
      scope: target === undefined ? 'all' : target === me.username ? 'self' : 'person',
      ...(target !== undefined ? capView(await advanceCap.capOf(target, month)) : {}),
      pending: all ? await advances.pendingCount(month) : undefined, // chờ duyệt của tháng này
      pendingAll: all ? await advances.pendingFor(me) : undefined, // chờ duyệt mọi tháng mà người xem duyệt được (huy hiệu "Yêu cầu")
      items
    };
  };
}
