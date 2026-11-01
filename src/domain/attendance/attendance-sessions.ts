// Session persistence is separate from salary estimates and the immutable punch log.
const { AttendanceSessionsRepository } = require('../../data');
const { AsyncList } = require('../../shared/async-list');
const P = require('../../engine/punch');
const { DEFAULTS } = require('../../engine/payroll-params');

// Lịch làm việc (các thứ, 0 = Chủ nhật) của loại nhân sự, đọc từ khoá type.<loại>.dows của DEFAULTS: đợt di chuyển dưới đây chạy
// lúc nạp src/platform/db, trước khi có tham số theo tháng. Loại lạ hiểu như NV (mọi loại khác TTS đều Thứ 2–Thứ 7).
const scheduleOfType = (type?) => {
  const key = `type.${type}.dows`;
  return [...(Object.hasOwn(DEFAULTS, key) ? DEFAULTS[key] : DEFAULTS['type.nv.dows'])];
};
// Lượt Admin khai thay giờ vào / ra (src/domain/attendance/admin-presence.ts) được tạo ngay lúc lưu, kể cả ngày khai trước. Ngày
// đó chỉ tính là có mặt khi đã qua giờ ra; trước đó chỉ là lịch. Nên mọi lượt đọc (bảng lương, Hôm nay, Bảng công, app nhân viên,
// kiểm chồng giờ khi Check-in) đều không thấy lượt Admin có giờ ra sau lúc này. Giờ ISO cùng dạng nên so chuỗi được.
const ADMIN_ORIGIN = 'sheet.onBehalf';
module.exports = function sessionStore(db, { bootFail, transaction, queryBuilder }: any) {
  const sessionsRepo = new AttendanceSessionsRepository(queryBuilder);

  // Thời điểm ghi bản nhớ requestId (đợt dọn punch_requests, purgePunchRequests bên dưới). Dòng chưa có cột này thì created_at
  // là NULL và không bao giờ bị dọn: chỉ bản ghi có created_at được xoá theo tuổi.

  // Chỉ mục theo phiên: thiếu chỉ mục thì sessionPunches, listCorrections({ sessionId }), "UPDATE ... WHERE session_id = ?" khi ghi lượt bấm
  // quét cả bảng cho MỖI phiên. Phải tạo sau addColumn
  // (cột session_id được thêm ở trên). Dòng có session_id null cũng vào chỉ mục (không ảnh hưởng). Danh sách này khớp test/tools/record-schema.js.

  const now = () => new Date(Date.now()).toISOString();
  const row = (r?) =>
    r
      ? {
          id: r.id,
          sessionId: r.id,
          username: r.username,
          date: r.date,
          state: r.state,
          entry: JSON.parse(r.entry_json),
          version: r.version,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }
      : null;
  const api = {
    sessionsRepo,
    getSession: async (id?) => row(await sessionsRepo.find(id)),
    openSession: async (u?) => row(await sessionsRepo.open(u)),
    lastSession: async (u?) => row(await sessionsRepo.last(u, ADMIN_ORIGIN, now())),
    // includeScheduled: cả lượt Admin khai trước chưa tới giờ ra (chỉ src/domain/attendance/admin-presence.ts cần, để sửa / xoá chúng)
    async listSessions({ username, month, date, includeScheduled = false }: any = {}) {
      const hide = includeScheduled ? null : { origin: ADMIN_ORIGIN, nowIso: now() };
      return (await sessionsRepo.list({ username, month, date }, hide)).map(row);
    },
    async createSession(u?, date?, state?, entry?, legacyKey: any = null, createdAt = now(), updatedAt = createdAt) {
      const id = await sessionsRepo.insert({
        username: u,
        date,
        state,
        entry_json: JSON.stringify(entry),
        legacy_key: legacyKey,
        created_at: createdAt,
        updated_at: updatedAt
      });
      return await api.getSession(id);
    },
    async updateSession(id, version, { date, state, entry }: any) {
      const changed = await sessionsRepo.update(id, version, {
        date,
        state,
        entryJson: JSON.stringify(entry),
        at: now()
      });
      return changed ? await api.getSession(id) : null;
    },
    sessionPunches: async (id?) =>
      (await sessionsRepo.punchesOf(id)).map(p => ({
        ...p,
        ts: p.at,
        context: p.context_json ? JSON.parse(p.context_json) : null
      })),
    getPunchRequest: async (u?, id?) => await sessionsRepo.punchRequest(u, id),
    async savePunchRequest(u?, id?, operation?, sid?, response?) {
      await sessionsRepo.savePunchRequest({
        username: u,
        request_id: id,
        operation,
        session_id: sid ?? null,
        response_json: JSON.stringify(response),
        created_at: now()
      });
    },
    // Dọn bảng nhớ requestId của Check-in/out (server.js gọi một lần lúc khởi động rồi mỗi PUNCH_REQUEST_PURGE_HOURS giờ):
    // chỉ xoá bản ghi CŨ HƠN olderThanDays ngày, để bấm lại sau lỗi mạng vẫn nhận đúng phản hồi cũ thay vì chấm công hai lần
    // (src/engine/nhan-vien/punch.js → ATTEMPT_TTL_MS phải ngắn hơn hạn này). Dòng chưa có created_at giữ nguyên.
    async purgePunchRequests(olderThanDays?) {
      const days = Number(olderThanDays);
      if (!Number.isFinite(days) || !(days > 0)) throw new Error('purgePunchRequests cần số ngày lớn hơn 0');
      const cutoff = new Date(Date.now() - days * DEFAULTS['unit.msPerDay']).toISOString();
      return await transaction(async () => await sessionsRepo.purgePunchRequests(cutoff));
    }
  };
  // Dữ liệu chấm công cũ mơ hồ (nhiều phiên mở) thì không nâng cấp được: dừng hẳn, nói rõ cần sửa gì, không in stack.

  return api;
};
module.exports.ADMIN_ORIGIN = ADMIN_ORIGIN;
