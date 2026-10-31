'use strict';
// Trạng thái duyệt của các khoản tự khai trong Lịch ước tính (iSAT, nghỉ được duyệt, OT, làm bù, đi làm ngày lễ, nghỉ phép năm, nghỉ sẽ làm bù).
// Lưu ở bảng riêng, chỉ máy chủ ghi; lịch của nhân sự (timesheets) không mang trạng thái duyệt.
// Một bảng duy nhất; người duyệt, lúc duyệt và lý do nằm ngay trên dòng.

// Luật nhận diện khoản cần duyệt dùng chung với trình duyệt: không viết lại ở đây.
const view = require('../public/approval-view.js');
const { DEFAULTS } = require('../public/payroll-params.js');
const { warnIf } = require('./warnings');

const ITEMS = view.ITEMS;
const STATUSES = ['pending', 'approved', 'rejected'];
const NOTE_MAX = DEFAULTS['control.reasonMaxLength']; // độ dài tối đa của lý do (cùng khoá với lý do ở nơi khác)
const MIGRATION_MARKER = 'sheet_approvals_v1';
// v2: khoản thứ sáu "đi làm ngày lễ" cần danh sách lễ và loại nhân sự, nên có đợt di chuyển riêng chạy sau v1 (DB đã chạy v1 vẫn nhận được)
const HOLIDAY_MARKER = 'sheet_approvals_v2';
// v3: khoản thứ bảy "Nghỉ phép năm"; DB đã chạy v1 và v2 vẫn nhận được dòng cho các ngày phép đã khai
const LEAVE_MARKER = 'sheet_approvals_v3';
// v4: "Nghỉ, sẽ làm bù" chuyển từ khai lịch sang yêu cầu duyệt.
const WILLMAKEUP_MARKER = 'sheet_approvals_v4';
// Khoản của tháng 09/2026 trở về trước coi như đã duyệt, từ 10/2026 chờ duyệt.
const DEFAULT_CUTOFF_MONTH = '2026-10';
const SYSTEM_USER = 'system';
// Các trường khai tay mà estimateSheet() trong server.js giữ lại; migration chiếu lịch cũ qua đúng danh sách này.
const DAY_FIELDS = ['kind', 'shift', 'in', 'out', 'extraKind', 'extraIn', 'extraOut', 'preset', 'breakMin'];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Lỗi có mã để server.js đổi thành mã HTTP; `items` là các mục gây lỗi (không chứa dữ liệu khác).
function approvalError(code, message, items = []) {
  return Object.assign(new Error(message), { code, items });
}

// OT ngày lễ là OT: dòng lưu với mục 'holiday_work' (trước khi OT ngày lễ dùng chung mục 'ot') đọc ra là mục 'ot'; dấu vân tay giữ nguyên
const HOLIDAY_FINGERPRINT = /^holiday_work\|/;
const itemOfRow = r => (r.item === 'holiday_work' ? 'ot' : r.item);
const rowToApproval = r => ({
  username: r.username,
  name: r.name ?? null,
  date: r.date,
  item: itemOfRow(r),
  ...(HOLIDAY_FINGERPRINT.test(r.fingerprint) ? { holiday: true } : {}),
  fingerprint: r.fingerprint,
  status: r.status,
  rev: r.rev,
  submittedAt: r.submitted_at,
  decidedBy: r.decided_by ?? null,
  decidedAt: r.decided_at ?? null,
  note: r.note ?? null
});

// Điều kiện lọc dùng chung cho list và count; bảng sheet_approvals luôn có bí danh `a`.
function approvalFilter({ status, month, username } = {}) {
  const where = [],
    args = [];
  if (status !== undefined && status !== null && status !== 'all') {
    if (!STATUSES.includes(status)) throw new Error('Trạng thái duyệt không hợp lệ');
    where.push('a.status = ?');
    args.push(status);
  }
  if (month) {
    if (!MONTH_RE.test(month)) throw new Error('Tháng phải có dạng YYYY-MM');
    where.push('a.date LIKE ?');
    args.push(month + '-%');
  }
  if (username) {
    where.push('a.username = ?');
    args.push(username);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

// Lịch đã khai chiếu như estimateSheet(): chỉ giữ trường khai tay, bỏ ngày 'pending' của Check-in/out.
function projectDay(entry) {
  if (!entry || typeof entry !== 'object' || entry.kind === 'pending') return null;
  if (entry.kind !== 'work' && entry.kind !== 'makeup') {
    return {
      kind: entry.kind,
      ...(Array.isArray(entry.makeupPlans) ? { makeupPlans: entry.makeupPlans } : {}),
      ...(typeof entry.makeupDate === 'string' ? { makeupDate: entry.makeupDate } : {})
    };
  }
  return Object.fromEntries(DAY_FIELDS.filter(key => Object.hasOwn(entry, key)).map(key => [key, entry[key]]));
}

module.exports = function approvalStore(db, { now, transaction, bootFail }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sheet_approvals (
      username     TEXT NOT NULL,
      date         TEXT NOT NULL,                   -- 'YYYY-MM-DD', ngày chứa khoản tự khai
      item         TEXT NOT NULL,                   -- ApprovalView.ITEMS
      fingerprint  TEXT NOT NULL,                   -- phần được trả tiền lúc khai; đổi thì phải duyệt lại
      status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
      rev          INTEGER NOT NULL DEFAULT 1,      -- tăng khi đổi phần trả tiền hoặc đổi quyết định
      submitted_at TEXT NOT NULL,                   -- ISO UTC, lúc khai hoặc khai lại
      decided_by   TEXT,                            -- Admin, hoặc 'system' khi migration/seed duyệt sẵn
      decided_at   TEXT,
      note         TEXT,                            -- lý do, tối đa 300 ký tự; bắt buộc khi từ chối hoặc đổi quyết định
      PRIMARY KEY (username, date)
    );
    CREATE INDEX IF NOT EXISTS idx_sheet_approvals_status_date ON sheet_approvals (status, date);
  `);

  // Các khoản cần duyệt trong một lịch (đối tượng ngày → mục): { 'YYYY-MM-DD': { item, fingerprint } }.
  // ctx (tuỳ chọn) { holidays, staffType }: nhận ra thêm khoản "đi làm ngày lễ"; không có ctx thì không xét khoản này.
  function declaredItems(days, ctx) {
    const declared = {};
    for (const [date, entry] of Object.entries(days || {})) {
      const day = projectDay(entry);
      const found = day && view.itemOf(day, view.dayCtx(ctx, date));
      if (found) declared[date] = { item: found.item, fingerprint: found.fingerprint };
    }
    return declared;
  }

  const api = {
    declaredItems,
    CUTOFF_MONTH: DEFAULT_CUTOFF_MONTH,

    // Đồng bộ các dòng duyệt của (người, tháng) với những khoản vừa khai. Gọi trong cùng transaction với setSheet.
    // declared: { 'YYYY-MM-DD': { item, fingerprint } } của đúng tháng đó.
    // Thêm dòng chờ duyệt cho khoản mới; giữ nguyên khi cùng mục và dấu vân tay; đổi mục hoặc dấu vân tay thì về chờ duyệt
    // (rev + 1, xoá người duyệt và lý do); xoá dòng của ngày không còn khoản nào.
    // Trả về { added, reset, resubmitted, removed }: reset = đã duyệt nay về chờ duyệt; resubmitted = chờ hoặc bị từ chối
    // nay khai lại (đang chờ). Không bao giờ đọc status từ dữ liệu người dùng.
    // options.approveBefore ('YYYY-MM', chỉ máy chủ truyền): dòng MỚI thêm của tháng nhỏ hơn mốc này được duyệt sẵn bởi 'system'
    // (quy tắc tháng ≤ 09/2026 coi như đã duyệt, dùng khi Admin đổi lịch lễ); dòng đổi mục hoặc dấu vân tay vẫn về chờ duyệt.
    reconcile(username, month, declared, options = {}) {
      const approveNew = !!options.approveBefore && month < options.approveBefore;
      if (!MONTH_RE.test(month)) throw new Error('Tháng phải có dạng YYYY-MM');
      for (const [date, found] of Object.entries(declared)) {
        if (!DATE_RE.test(date) || !date.startsWith(month + '-'))
          throw new Error(`Ngày ${date} không thuộc tháng ${month}`);
        if (!ITEMS.includes(found.item)) throw new Error(`Loại khoản tự khai không hợp lệ ở ngày ${date}`);
        if (typeof found.fingerprint !== 'string' || !found.fingerprint)
          throw new Error(`Thiếu dấu vân tay của khoản ngày ${date}`);
      }
      return transaction(() => {
        const result = { added: [], reset: [], resubmitted: [], removed: [] };
        const stored = db
          .prepare('SELECT date, item, fingerprint, status FROM sheet_approvals WHERE username = ? AND date LIKE ?')
          .all(username, month + '-%');
        const byDate = new Map(stored.map(r => [r.date, r]));
        for (const row of stored) {
          if (Object.hasOwn(declared, row.date)) continue;
          db.prepare('DELETE FROM sheet_approvals WHERE username = ? AND date = ?').run(username, row.date);
          result.removed.push(row.date);
        }
        const at = now();
        for (const [date, found] of Object.entries(declared)) {
          const row = byDate.get(date);
          if (!row) {
            db.prepare(
              `INSERT INTO sheet_approvals (username, date, item, fingerprint, status, rev, submitted_at, decided_by, decided_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
            ).run(
              username,
              date,
              found.item,
              found.fingerprint,
              approveNew ? 'approved' : 'pending',
              at,
              approveNew ? SYSTEM_USER : null,
              approveNew ? at : null
            );
            result.added.push(date);
          } else if (itemOfRow(row) !== found.item || row.fingerprint !== found.fingerprint) {
            db.prepare(
              `UPDATE sheet_approvals
               SET item = ?, fingerprint = ?, status = 'pending', rev = rev + 1, submitted_at = ?,
                 decided_by = NULL, decided_at = NULL, note = NULL
               WHERE username = ? AND date = ?`
            ).run(found.item, found.fingerprint, at, username, date);
            (row.status === 'approved' ? result.reset : result.resubmitted).push(date);
          }
        }
        for (const dates of Object.values(result)) dates.sort();
        return result;
      });
    },

    // Danh sách cho màn hình duyệt. Lọc: status ('pending' | 'approved' | 'rejected' | 'all' hoặc bỏ trống = tất cả),
    // month 'YYYY-MM', username; phân trang bằng limit, offset. Xếp theo ngày khai rồi tên đăng nhập.
    list(options = {}) {
      const { sql, args } = approvalFilter(options);
      const page = options.limit === undefined ? '' : ' LIMIT ? OFFSET ?';
      if (options.limit !== undefined) args.push(options.limit, options.offset || 0);
      return db
        .prepare(
          `SELECT a.*, s.name AS name
           FROM sheet_approvals a
           LEFT JOIN staff s ON s.username = a.username
           ${sql}
           ORDER BY a.date, a.username${page}`
        )
        .all(...args)
        .map(rowToApproval);
    },

    get(username, date) {
      const row = db.prepare('SELECT * FROM sheet_approvals WHERE username = ? AND date = ?').get(username, date);
      return row ? rowToApproval(row) : null;
    },

    // Các dòng duyệt của một lịch tháng, theo ngày: { 'YYYY-MM-DD': { item, fingerprint, status, rev, ... } }.
    forSheet(username, month) {
      if (!MONTH_RE.test(month)) throw new Error('Tháng phải có dạng YYYY-MM');
      return Object.fromEntries(
        db
          .prepare('SELECT * FROM sheet_approvals WHERE username = ? AND date LIKE ? ORDER BY date')
          .all(username, month + '-%')
          .map(r => [r.date, rowToApproval(r)])
      );
    },

    // Duyệt hoặc từ chối theo lô; tất cả hoặc không gì cả. items: [{ username, date, rev, fingerprint }] (fingerprint là dấu
    // vân tay Admin đã thấy: khoản bị xoá rồi khai lại có rev bắt đầu lại, chỉ dấu vân tay phân biệt được); status: 'approved' | 'rejected'.
    // Ném Error có `code` (và `items` là các mục gây lỗi):
    //   APPROVAL_NOT_FOUND, APPROVAL_STALE (rev lệch), APPROVAL_NOOP (đã ở trạng thái đích),
    //   APPROVAL_NOTE_TOO_LONG (quá 300 ký tự). Các lỗi tham số sai khác là Error thường.
    // Tự duyệt khoản của chính mình hay từ chối không ghi lý do chỉ là cảnh báo (APPROVAL_SELF).
    // Trả về [{ username, date, status, rev }] với rev mới.
    decide(items, status, by, note) {
      if (!['approved', 'rejected'].includes(status)) throw new Error('Trạng thái duyệt không hợp lệ');
      if (typeof by !== 'string' || !by) throw new Error('Thiếu người duyệt');
      if (!Array.isArray(items) || !items.length) throw new Error('Chưa chọn khoản nào để duyệt');
      const text = typeof note === 'string' ? note.trim() : '';
      if (text.length > NOTE_MAX) throw approvalError('APPROVAL_NOTE_TOO_LONG', `Lý do tối đa ${NOTE_MAX} ký tự`);
      return transaction(() => {
        const keys = new Set();
        const rows = items.map(item => {
          if (!item || typeof item.username !== 'string' || !DATE_RE.test(item.date) || !Number.isInteger(item.rev))
            throw new Error('Khoản duyệt thiếu người, ngày hoặc phiên bản');
          if (typeof item.fingerprint !== 'string' || !item.fingerprint)
            throw new Error('Khoản duyệt thiếu dấu vân tay của khoản Admin đã thấy');
          const key = `${item.username}|${item.date}`;
          if (keys.has(key)) throw new Error(`Khoản ngày ${item.date} bị chọn hai lần`);
          keys.add(key);
          return {
            item,
            row: db
              .prepare('SELECT * FROM sheet_approvals WHERE username = ? AND date = ?')
              .get(item.username, item.date)
          };
        });
        const refs = list => list.map(({ item }) => ({ username: item.username, date: item.date }));
        const missing = rows.filter(r => !r.row);
        if (missing.length)
          throw approvalError('APPROVAL_NOT_FOUND', 'Có khoản không còn trong danh sách chờ duyệt', refs(missing));
        const stale = rows.filter(r => r.row.rev !== r.item.rev || r.row.fingerprint !== r.item.fingerprint);
        if (stale.length)
          throw approvalError(
            'APPROVAL_STALE',
            'Có khoản vừa được người khác hoặc nhân sự sửa, hãy tải lại',
            refs(stale)
          );
        const noop = rows.filter(r => r.row.status === status);
        if (noop.length) throw approvalError('APPROVAL_NOOP', 'Có khoản đã ở trạng thái này rồi', refs(noop));
        const own = rows.filter(r => r.row.username === by);
        // Tự duyệt khoản của chính mình chỉ cảnh báo (nhật ký ghi after.self)
        warnIf('APPROVAL_SELF', own.length > 0, {
          message:
            'Bạn đang duyệt khoản tự khai của chính mình; việc này được ghi vào nhật ký là tự thực hiện. Khoản được duyệt vẫn vào tiền như khoản người khác duyệt.'
        });
        const at = now();
        return rows.map(({ row }) => {
          const done = db
            .prepare(
              `UPDATE sheet_approvals
               SET status = ?, rev = rev + 1, decided_by = ?, decided_at = ?, note = ?
               WHERE username = ? AND date = ? AND rev = ? AND fingerprint = ?`
            )
            .run(status, by, at, text || null, row.username, row.date, row.rev, row.fingerprint);
          if (done.changes !== 1)
            throw approvalError('APPROVAL_STALE', 'Có khoản vừa được sửa, hãy tải lại', [
              { username: row.username, date: row.date }
            ]);
          return { username: row.username, date: row.date, status, rev: row.rev + 1 };
        });
      });
    },

    // Đợt v2: tạo (hoặc đổi) dòng OT ngày lễ cho lịch đã khai trước khi có khoản thứ sáu, theo lịch lễ và loại nhân sự hiện tại.
    // Chạy một lần, đánh dấu bằng settings 'sheet_approvals_v2'. Quy tắc mốc giống v1: tháng < cutoffMonth đã duyệt bởi 'system',
    // từ cutoffMonth chờ duyệt. Ngày đã có dòng cùng mục và dấu vân tay thì giữ; dòng khác mục (ví dụ OT của v1 trên ngày lễ) được thay.
    // Trả về { approved, pending } số dòng đã tạo hoặc đổi, hoặc null nếu đã chạy trước đó.
    migrateHolidayWork({ cutoffMonth = DEFAULT_CUTOFF_MONTH } = {}) {
      if (!MONTH_RE.test(cutoffMonth)) throw new Error('Tháng mốc phải có dạng YYYY-MM');
      if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(HOLIDAY_MARKER)) return null;
      return transaction(() => {
        const at = now();
        const holidayRow = db.prepare('SELECT value_json FROM settings WHERE key = ?').get('holidays');
        const holidays = holidayRow ? JSON.parse(holidayRow.value_json) : [];
        const types = new Map(
          db
            .prepare('SELECT username, type FROM staff')
            .all()
            .map(r => [r.username, r.type])
        );
        const total = { approved: 0, pending: 0 };
        const find = db.prepare('SELECT item, fingerprint FROM sheet_approvals WHERE username = ? AND date = ?');
        const insert = db.prepare(
          `INSERT INTO sheet_approvals
             (username, date, item, fingerprint, status, rev, submitted_at, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
        );
        const replace = db.prepare(
          `UPDATE sheet_approvals
           SET item = ?, fingerprint = ?, status = ?, rev = rev + 1, submitted_at = ?, decided_by = ?, decided_at = ?, note = NULL
           WHERE username = ? AND date = ?`
        );
        if (Array.isArray(holidays) && holidays.length) {
          const sheets = db.prepare('SELECT username, days_json, updated_at FROM timesheets').all();
          for (const sheet of sheets) {
            if (!types.has(sheet.username)) continue;
            const ctx = { holidays, staffType: types.get(sheet.username) };
            for (const [date, found] of Object.entries(declaredItems(JSON.parse(sheet.days_json), ctx))) {
              if (!HOLIDAY_FINGERPRINT.test(found.fingerprint)) continue;
              const approved = date.slice(0, cutoffMonth.length) < cutoffMonth;
              const status = approved ? 'approved' : 'pending',
                by = approved ? SYSTEM_USER : null,
                decidedAt = approved ? at : null;
              const row = find.get(sheet.username, date);
              if (!row)
                insert.run(
                  sheet.username,
                  date,
                  found.item,
                  found.fingerprint,
                  status,
                  sheet.updated_at,
                  by,
                  decidedAt
                );
              else if (itemOfRow(row) !== found.item || row.fingerprint !== found.fingerprint)
                replace.run(
                  found.item,
                  found.fingerprint,
                  status,
                  sheet.updated_at,
                  by,
                  decidedAt,
                  sheet.username,
                  date
                );
              else continue;
              total[status]++;
            }
          }
        }
        db.prepare('INSERT INTO settings (key, value_json) VALUES (?, ?)').run(
          HOLIDAY_MARKER,
          JSON.stringify({ at, cutoffMonth, ...total })
        );
        return total;
      });
    },

    // Đợt v3: tạo dòng cho các ngày "Nghỉ phép năm" đã khai trước khi có khoản thứ bảy (DB đã chạy v1 và v2 không có dòng nào cho chúng).
    // Chạy một lần, đánh dấu bằng settings 'sheet_approvals_v3'. Quy tắc mốc giống v1: tháng < cutoffMonth đã duyệt bởi 'system',
    // từ cutoffMonth chờ duyệt. Ngày đã có dòng cùng mục và dấu vân tay thì giữ nguyên (không đặt lại quyết định của Admin);
    // dòng khác mục hoặc dấu vân tay (dữ liệu cũ lệch) được thay. Khoá ngày không đúng dạng trong lịch cũ bị bỏ qua.
    // Trả về { approved, pending } số dòng đã tạo hoặc đổi, hoặc null nếu đã chạy trước đó.
    migrateLeave({ cutoffMonth = DEFAULT_CUTOFF_MONTH } = {}) {
      if (!MONTH_RE.test(cutoffMonth)) throw new Error('Tháng mốc phải có dạng YYYY-MM');
      if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(LEAVE_MARKER)) return null;
      return transaction(() => {
        const at = now();
        const total = { approved: 0, pending: 0 };
        const find = db.prepare('SELECT item, fingerprint FROM sheet_approvals WHERE username = ? AND date = ?');
        const insert = db.prepare(
          `INSERT INTO sheet_approvals
             (username, date, item, fingerprint, status, rev, submitted_at, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
        );
        const replace = db.prepare(
          `UPDATE sheet_approvals
           SET item = ?, fingerprint = ?, status = ?, rev = rev + 1, submitted_at = ?, decided_by = ?, decided_at = ?, note = NULL
           WHERE username = ? AND date = ?`
        );
        for (const sheet of db.prepare('SELECT username, days_json, updated_at FROM timesheets').all()) {
          for (const [date, found] of Object.entries(declaredItems(JSON.parse(sheet.days_json)))) {
            if (found.item !== 'leave' || !DATE_RE.test(date)) continue;
            const approved = date.slice(0, cutoffMonth.length) < cutoffMonth;
            const status = approved ? 'approved' : 'pending',
              by = approved ? SYSTEM_USER : null,
              decidedAt = approved ? at : null;
            const row = find.get(sheet.username, date);
            if (!row)
              insert.run(sheet.username, date, found.item, found.fingerprint, status, sheet.updated_at, by, decidedAt);
            else if (row.item !== found.item || row.fingerprint !== found.fingerprint)
              replace.run(found.item, found.fingerprint, status, sheet.updated_at, by, decidedAt, sheet.username, date);
            else continue;
            total[status]++;
          }
        }
        db.prepare('INSERT INTO settings (key, value_json) VALUES (?, ?)').run(
          LEAVE_MARKER,
          JSON.stringify({ at, cutoffMonth, ...total })
        );
        return total;
      });
    },

    migrateWillMakeup({ cutoffMonth = DEFAULT_CUTOFF_MONTH } = {}) {
      if (!MONTH_RE.test(cutoffMonth)) throw new Error('Tháng mốc phải có dạng YYYY-MM');
      if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(WILLMAKEUP_MARKER)) return null;
      return transaction(() => {
        const at = now();
        const total = { approved: 0, pending: 0 };
        const find = db.prepare('SELECT item FROM sheet_approvals WHERE username = ? AND date = ?');
        const insert = db.prepare(
          `INSERT INTO sheet_approvals
             (username, date, item, fingerprint, status, rev, submitted_at, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
        );
        for (const sheet of db.prepare('SELECT username, days_json, updated_at FROM timesheets').all()) {
          for (const [date, found] of Object.entries(declaredItems(JSON.parse(sheet.days_json)))) {
            if (found.item !== 'willmakeup' || !DATE_RE.test(date)) continue;
            const approved = date.slice(0, cutoffMonth.length) < cutoffMonth;
            const status = approved ? 'approved' : 'pending';
            const existing = find.get(sheet.username, date);
            if (existing) continue;
            const decidedAt = approved ? at : null;
            insert.run(
              sheet.username,
              date,
              found.item,
              found.fingerprint,
              status,
              sheet.updated_at,
              approved ? SYSTEM_USER : null,
              decidedAt
            );
            total[status]++;
          }
        }
        db.prepare('INSERT INTO settings (key, value_json) VALUES (?, ?)').run(
          WILLMAKEUP_MARKER,
          JSON.stringify({ at, cutoffMonth, ...total })
        );
        return total;
      });
    },

    // Tạo dòng duyệt cho các khoản đã khai trước khi có tính năng. Chạy một lần, đánh dấu bằng settings 'sheet_approvals_v1'.
    // Khoản của tháng < cutoffMonth coi như đã duyệt (decided_by 'system'), từ cutoffMonth chờ duyệt.
    // Trả về { approved, pending } số dòng đã tạo, hoặc null nếu đã chạy trước đó.
    migrate({ cutoffMonth = DEFAULT_CUTOFF_MONTH } = {}) {
      if (!MONTH_RE.test(cutoffMonth)) throw new Error('Tháng mốc phải có dạng YYYY-MM');
      if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(MIGRATION_MARKER)) return null;
      return transaction(() => {
        const at = now();
        const insert = db.prepare(
          `INSERT OR IGNORE INTO sheet_approvals
             (username, date, item, fingerprint, status, rev, submitted_at, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
        );
        const total = { approved: 0, pending: 0 };
        const sheets = db.prepare('SELECT username, days_json, updated_at FROM timesheets').all();
        for (const sheet of sheets) {
          const days = JSON.parse(sheet.days_json);
          for (const [date, found] of Object.entries(declaredItems(days))) {
            if (found.item === 'willmakeup') continue; // xử lý riêng ở đợt v4, không đổi lịch sử ý nghĩa của v1
            const approved = date.slice(0, cutoffMonth.length) < cutoffMonth;
            const done = insert.run(
              sheet.username,
              date,
              found.item,
              found.fingerprint,
              approved ? 'approved' : 'pending',
              sheet.updated_at,
              approved ? SYSTEM_USER : null,
              approved ? at : null
            );
            if (done.changes) total[approved ? 'approved' : 'pending']++;
          }
        }
        db.prepare('INSERT INTO settings (key, value_json) VALUES (?, ?)').run(
          MIGRATION_MARKER,
          JSON.stringify({ at, cutoffMonth, ...total })
        );
        return total;
      });
    }
  };

  // Chạy khi mở DB. Lỗi ở đây là dữ liệu lịch hỏng: dừng hẳn và nói rõ, không để app chạy với trạng thái duyệt thiếu.
  try {
    api.migrate();
    api.migrateHolidayWork();
    api.migrateLeave();
    api.migrateWillMakeup();
  } catch (error) {
    bootFail([
      'Không khởi động được: không tạo được trạng thái duyệt cho các khoản tự khai cũ.',
      `Chi tiết: ${error.message}`,
      'Cần sửa: kiểm tra cột days_json của bảng timesheets (phải là JSON hợp lệ) trên bản sao DB rồi khởi động lại.',
      'Lần nâng cấp này đã được hoàn tác, chưa có dòng duyệt nào được tạo.'
    ]);
  }
  return api;
};
