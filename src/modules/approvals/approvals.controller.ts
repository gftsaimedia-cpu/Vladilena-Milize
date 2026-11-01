import { Controller, Get, Put } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
import { decidableBy } from './approvals.helpers';
const { AsyncList } = require('../../../lib/shared/async-list');
const store = require('../../../lib/db');
const { HttpError, readJson } = require('../../../lib/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
const { rulesFor, nowIso } = require('../../../lib/request-rules'); // quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { estimateSheet } = require('../../../lib/domain/sheet'); // lịch ước tính và ngày phép
const { sheetForViewer } = require('../../../lib/domain/staff'); // hồ sơ gửi ra ngoài, che trường theo quyền
const { closeStaleFor } = require('../../../lib/domain/attendance'); // phiên Check-in/out dùng chung
const { sheetApprovals, listApprovals, tallyApprovals, approvalHttpError } = require('../../../lib/domain/approvals'); // khoản tự khai chờ duyệt
const { isatRefusal } = require('../../../lib/domain/isat-rule'); // ngày iSAT đúng thứ và đúng quyền lợi
const authz = require('../../../lib/authz'); // quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
const audit = require('../../../lib/audit'); // nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const events = require('../../../lib/events'); // báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const explanations = require('../../../lib/explanations'); // giải trình Check-out muộn
const { validMonth, validDate, USERNAME_RE, NOTE_MAX } = require('../../../lib/domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const { assertNotAiBlocked } = require('../../../lib/domain/ai-block'); // AI chặn duyệt khoản dính luật nặng (chỉ khi công tắc Agents bật)

@Controller('api')
export class ApprovalsController {
  @Get('approvals')
  async getApprovals(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, me, needAdmin } = c;
    const canDecideRow = decidableBy(me);
    needAdmin();
    const status = url.searchParams.get('status') || 'pending',
      month = url.searchParams.get('month') || undefined,
      user = url.searchParams.get('user')?.toLowerCase() || undefined;
    if (!['pending', 'approved', 'rejected', 'all'].includes(status))
      throw new HttpError(400, 'status phải là pending, approved, rejected hoặc all');
    if (month && !validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    if (user && !USERNAME_RE.test(user)) throw new HttpError(400, 'user không hợp lệ');
    const paging = (key, fallback, min, max) => {
      const raw = url.searchParams.get(key);
      if (raw === null) return fallback;
      const value = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max)
        throw new HttpError(400, `${key} phải là số nguyên từ ${min} đến ${max}`);
      return value;
    };
    const limit = paging('limit', 200, 1, 500),
      offset = paging('offset', 0, 0, Number.MAX_SAFE_INTEGER);
    const rows = await AsyncList.filter(await listApprovals({ month, username: user }), canDecideRow);
    const picked = rows
      .filter(row => status === 'all' || row.status === status)
      .sort((a, b) => a.username.localeCompare(b.username) || a.date.localeCompare(b.date))
      .slice(offset, offset + limit);
    const sheets = {};
    const lockedNames = new Set((await store.listStaff()).filter(s => s.locked).map(s => s.username));
    const items = await AsyncList.map(picked, async row => {
      const sheetMonth = row.date.slice(0, 7),
        key = `${row.username}|${sheetMonth}`;
      if (!sheets[key]) {
        const sheet = await estimateSheet(row.username, sheetMonth);
        sheets[key] = {
          ...(await sheetForViewer(me, row.username, sheet)),
          approvals: await sheetApprovals(row.username, sheetMonth, sheet.days)
        };
      }
      const day = sheets[key].days[row.date] || {};
      return {
        ...row,
        // Nhân sự bị khoá vẫn có khoản trong hàng chờ (Admin có thể còn phải chốt lương lần cuối), có đánh dấu
        ...(lockedNames.has(row.username) ? { locked: true } : {}),
        declared: {
          kind: day.kind || '',
          in: day.in || '',
          out: day.out || '',
          extraKind: day.extraKind || (day.extraOut ? 'makeup' : ''),
          extraIn: day.extraIn || '',
          extraOut: day.extraOut || '',
          ...(day.punchNote ? { punchNote: day.punchNote } : {}),
          ...(Array.isArray(day.makeupPlans) ? { makeupPlans: day.makeupPlans } : {}),
          ...(day.makeupDate ? { makeupDate: day.makeupDate } : {})
        }
      };
    });
    // limits: để màn duyệt cắt lô và đặt độ dài ô lý do theo đúng số của máy chủ, không chép tay
    const limits = { decideMax: (await rulesFor()).params['system.approval.maxDecideItems'], noteMax: NOTE_MAX };
    return { items, counts: tallyApprovals(rows), sheets, limits };
  }

  @Get('approvals/count')
  async getApprovalsCount(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, needAdmin, me } = c;
    const canDecideRow = decidableBy(me);
    needAdmin();
    return {
      pending: tallyApprovals(await AsyncList.filter(await listApprovals({ status: 'pending' }), canDecideRow)).pending
    };
  }

  // Việc Admin cần xử lý trong tháng, để giao diện hiện huy hiệu: quên Check-in/out, ngày vắng chưa có giải trình và số khoản chờ duyệt (mọi tháng, như /approvals/count).
  @Get('alerts')
  async getAlerts(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, me, needAdmin } = c;
    const canDecideRow = decidableBy(me);
    needAdmin();
    const month = url.searchParams.get('month');
    if (month === null)
      throw new HttpError(400, 'Thiếu month: gọi /api/alerts?month=YYYY-MM', { code: 'MONTH_REQUIRED' });
    if (!validMonth(month))
      throw new HttpError(400, `month "${month.slice(0, 12)}" không hợp lệ: phải dạng YYYY-MM`, { code: 'BAD_MONTH' });
    const holidays = await store.getSetting('holidays', []),
      found = new Map(),
      absentFound: any[] = [];
    const explained = await explanations.explainedByUser(month); // ngày đã có giải trình (mọi trạng thái): không còn là ngày vắng chưa ai xử lý
    const ActualHours = (await rulesFor(month)).actualHours;
    // Quên Check-in/out là việc sửa chấm công: chỉ người có attendance.correct, và chỉ người trong phạm vi của mình
    const watched = await AsyncList.filter(
      await store.listStaff(),
      async s => s.payrollSubject && (await authz.can(me, 'attendance.correct', { username: s.username }))
    );
    await closeStaleFor(watched); // lượt mở quá 16 giờ được đóng thành "quên check-out" trước khi đếm (chỉ người đang có lượt mở)
    for (const staff of watched) {
      const add = (date, kind) =>
        found.set(`${staff.username}|${date}|${kind}`, { username: staff.username, name: staff.name, date, kind });
      const sessions = await store.listSessions({ username: staff.username, month });
      for (const x of sessions)
        if (x.entry.kind === 'pending' && x.entry.reason === 'forgot-out') add(x.date, 'forgot-out');
      // Thêm các ngày thiếu giờ vào / giờ ra mà ActualHours.apply chờ Admin xử lý (cùng cách dựng với GET /team)
      {
        // quy tắc của đúng tháng, lịch của người như checklist kỳ và bộ máy
        const { report, absent } = (await rulesFor(month)).actualHours.apply(
          (await estimateSheet(staff.username, month)).days,
          sessions,
          {
            asOf: nowIso(),
            staff,
            holidays,
            month
          }
        );
        for (const [date, r] of Object.entries(report as Record<string, any>))
          if (r.state === 'forgot-in' || r.state === 'forgot-out') add(date, r.state);
        // Ngày trong lịch không có lượt nào mà chưa ai giải trình: tính vắng, 0 công
        for (const date of absent)
          if (date.startsWith(month + '-') && !(explained.get(staff.username) || new Set()).has(date))
            absentFound.push({ username: staff.username, name: staff.name, date });
      }
    }
    const missingPunches = [...found.values()].sort(
      (a, b) => a.username.localeCompare(b.username) || a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind)
    );
    const absentNoExplanation = absentFound.sort(
      (a, b) => a.username.localeCompare(b.username) || a.date.localeCompare(b.date)
    );
    return {
      missingPunches,
      absentNoExplanation,
      pendingApprovals: tallyApprovals(await AsyncList.filter(await listApprovals({ status: 'pending' }), canDecideRow))
        .pending
    };
  }

  @Put('approvals/decide')
  async putApprovalsDecide(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, actx, needAdmin, guardPeriod, me } = c;
    const canDecideRow = decidableBy(me);
    const admin = needAdmin(),
      b = await readJson(req);
    if (!['approve', 'reject'].includes(b.action)) throw new HttpError(400, 'action phải là approve hoặc reject');
    if (b.note != null && typeof b.note !== 'string') throw new HttpError(400, 'Lý do phải là chữ');
    const note = (b.note || '').trim();
    if (note.length > NOTE_MAX) throw new HttpError(400, `Lý do tối đa ${NOTE_MAX} ký tự`);
    const decideMax = (await rulesFor()).params['system.approval.maxDecideItems'];
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > decideMax)
      throw new HttpError(400, `Chọn từ 1 đến ${decideMax} khoản để duyệt`);
    const seen = new Set();
    const items = await AsyncList.map(b.items, async item => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.username !== 'string' ||
        !USERNAME_RE.test(item.username) ||
        !validDate(item.date) ||
        !Number.isInteger(item.rev) ||
        typeof item.fingerprint !== 'string' ||
        !item.fingerprint
      )
        throw new HttpError(
          400,
          'Mỗi khoản cần tên đăng nhập, ngày hợp lệ, số phiên bản (rev) là số nguyên và dấu vân tay (fingerprint) Admin đã thấy'
        );
      const key = `${item.username}|${item.date}`;
      if (seen.has(key)) throw new HttpError(400, `Khoản ngày ${item.date} bị chọn hai lần`);
      seen.add(key);
      const decidee = await store.getStaff(item.username);
      if (decidee && !decidee.payrollSubject)
        throw new HttpError(400, 'Tài khoản này không thuộc bảng lương nên không có khoản cần duyệt');
      return { username: item.username, date: item.date, rev: item.rev, fingerprint: item.fingerprint };
    });
    await guardPeriod(items.map(item => item.date));
    // Từng khoản phải thuộc nhóm duyệt và phạm vi của người duyệt; một khoản không đủ quyền thì cả lô bị từ chối và không lưu gì
    for (const item of items) {
      const stored = await store.approvals.get(item.username, item.date);
      if (stored && !(await canDecideRow(stored)))
        throw new HttpError(
          403,
          `Bạn không có quyền duyệt khoản "${stored.item}" của ${item.username} ngày ${item.date}`,
          { code: 'FORBIDDEN_CAP', cap: `request.decide.${stored.item}` }
        );
    }
    // Duyệt khoản iSAT kiểm lại thứ trong tuần và quyền lợi của chức vụ (chặn cứng); từ chối luôn được
    if (b.action === 'approve')
      for (const item of items) {
        const stored = await store.approvals.get(item.username, item.date),
          owner = await store.getStaff(item.username);
        if (!stored || stored.item !== 'isat' || !owner) continue;
        const refusal = isatRefusal({
          params: (await rulesFor(item.date.slice(0, 7))).params,
          staff: owner,
          date: item.date
        });
        if (refusal)
          throw new HttpError(400, `${item.username}: ${refusal.message}`, { code: refusal.code, date: item.date });
      }
    // AI chặn (khác các cảnh báo): chỉ khi duyệt và công tắc Agents bật; Từ chối luôn được
    if (b.action === 'approve') await assertNotAiBlocked(items);
    try {
      const decided = await store.transaction(async () => {
        const rows = await store.approvals.decide(
          items,
          b.action === 'approve' ? 'approved' : 'rejected',
          admin.username,
          note
        );
        // Một dòng cho mỗi khoản (lọc được theo người và tháng); request_id nối các dòng của cùng một lần bấm
        for (const row of rows)
          await audit.write(actx, {
            action: 'approval.decide',
            entityKind: 'sheet_approval',
            entityId: `${row.username}:${row.date}`,
            subject: row.username,
            month: row.date.slice(0, 7),
            after: { status: row.status, rev: row.rev },
            reason: note || null
          });
        return rows;
      });
      for (const decidedMonth of new Set(decided.map(row => row.date.slice(0, 7))))
        await events.emit.approvalsChanged(decidedMonth);
      await events.emit.requestsDecided(decided);
      return { ok: true, decided: decided.length, items: decided };
    } catch (error) {
      throw approvalHttpError(error);
    }
  }
}
