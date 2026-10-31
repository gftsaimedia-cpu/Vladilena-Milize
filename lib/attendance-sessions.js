// Session persistence is separate from salary estimates and the immutable punch log.
const { AsyncList } = require('./shared/async-list');
const P = require('../public/punch');
const { DEFAULTS } = require('../public/payroll-params.js');

// Lịch làm việc (các thứ, 0 = Chủ nhật) của loại nhân sự, đọc từ khoá type.<loại>.dows của DEFAULTS: đợt di chuyển dưới đây chạy
// lúc nạp lib/db, trước khi có tham số theo tháng. Loại lạ hiểu như NV (mọi loại khác TTS đều Thứ 2–Thứ 7).
const scheduleOfType = type => {
  const key = `type.${type}.dows`;
  return [...(Object.hasOwn(DEFAULTS, key) ? DEFAULTS[key] : DEFAULTS['type.nv.dows'])];
};
// Lượt Admin khai thay giờ vào / ra (lib/domain/attendance/admin-presence.js) được tạo ngay lúc lưu, kể cả ngày khai trước. Ngày
// đó chỉ tính là có mặt khi đã qua giờ ra; trước đó chỉ là lịch. Nên mọi lượt đọc (bảng lương, Hôm nay, Bảng công, app nhân viên,
// kiểm chồng giờ khi Check-in) đều không thấy lượt Admin có giờ ra sau lúc này. Giờ ISO cùng dạng nên so chuỗi được.
const ADMIN_ORIGIN = 'sheet.onBehalf';
const NOT_SCHEDULED =
  "NOT (COALESCE(json_extract(entry_json,'$.origin'),'')=? AND json_extract(entry_json,'$.presOut')>?)";
module.exports = function sessionStore(db, { addColumn, bootFail, transaction, initDb = db }) {
  initDb.exec(`CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, date TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('open','closed')), entry_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1, legacy_key TEXT UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS session_one_open ON attendance_sessions(username) WHERE state='open';
    CREATE INDEX IF NOT EXISTS session_user_date ON attendance_sessions(username,date,id);
    CREATE TABLE IF NOT EXISTS punch_requests (username TEXT NOT NULL, request_id TEXT NOT NULL,
      operation TEXT NOT NULL, session_id INTEGER, response_json TEXT NOT NULL, PRIMARY KEY(username,request_id));`);
  addColumn('punches', 'session_id', 'INTEGER');
  addColumn('corrections', 'session_id', 'INTEGER');
  addColumn('corrections', 'session_version', 'INTEGER');
  // Thời điểm ghi bản nhớ requestId (đợt dọn punch_requests, purgePunchRequests bên dưới). Dòng chưa có cột này thì created_at
  // là NULL và không bao giờ bị dọn: chỉ bản ghi có created_at được xoá theo tuổi.
  addColumn('punch_requests', 'created_at', 'TEXT');
  // Chỉ mục theo phiên: thiếu chỉ mục thì sessionPunches, listCorrections({ sessionId }), "UPDATE ... WHERE session_id = ?" khi ghi lượt bấm
  // quét cả bảng cho MỖI phiên. Phải tạo sau addColumn
  // (cột session_id được thêm ở trên). Dòng có session_id null cũng vào chỉ mục (không ảnh hưởng). Danh sách này khớp test/tools/record-schema.js.
  initDb.exec(`
    CREATE INDEX IF NOT EXISTS punches_session ON punches(session_id);
    CREATE INDEX IF NOT EXISTS corrections_session ON corrections(session_id);`);
  const now = () => new Date(Date.now()).toISOString();
  const row = r =>
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
    getSession: async id => row(await db.prepare('SELECT * FROM attendance_sessions WHERE id=?').get(id)),
    openSession: async u => row(await db.prepare("SELECT * FROM attendance_sessions WHERE username=? AND state='open'").get(u)),
    lastSession: async u =>
      row(
        await db
          .prepare(
            `SELECT * FROM attendance_sessions WHERE username=? AND ${NOT_SCHEDULED} ORDER BY COALESCE(json_extract(entry_json,'$.presOut'),json_extract(entry_json,'$.presIn'),created_at) DESC,id DESC LIMIT 1`
          )
          .get(u, ADMIN_ORIGIN, now())
      ),
    // includeScheduled: cả lượt Admin khai trước chưa tới giờ ra (chỉ lib/domain/attendance/admin-presence.js cần, để sửa / xoá chúng)
    async listSessions({ username, month, date, includeScheduled = false } = {}) {
      const clauses = includeScheduled ? [] : [NOT_SCHEDULED],
        args = includeScheduled ? [] : [ADMIN_ORIGIN, now()];
      if (username) {
        clauses.push('username=?');
        args.push(username);
      }
      if (month) {
        clauses.push('date LIKE ?');
        args.push(month + '-%');
      }
      if (date) {
        clauses.push('date=?');
        args.push(date);
      }
      return (await db
        .prepare(
          `SELECT * FROM attendance_sessions ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY date,id`
        )
        .all(...args))
        .map(row);
    },
    async createSession(u, date, state, entry, legacyKey = null, createdAt = now(), updatedAt = createdAt) {
      const id = Number(
        (await db
          .prepare(
            'INSERT INTO attendance_sessions(username,date,state,entry_json,legacy_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?)'
          )
          .run(u, date, state, JSON.stringify(entry), legacyKey, createdAt, updatedAt)).lastInsertRowid
      );
      return await api.getSession(id);
    },
    async updateSession(id, version, { date, state, entry }) {
      const result = await db
        .prepare(
          'UPDATE attendance_sessions SET date=?,state=?,entry_json=?,version=version+1,updated_at=? WHERE id=? AND version=?'
        )
        .run(date, state, JSON.stringify(entry), now(), id, version);
      return result.changes ? await api.getSession(id) : null;
    },
    sessionPunches: async id =>
      (await db
        .prepare('SELECT * FROM punches WHERE session_id=? ORDER BY id')
        .all(id))
        .map(p => ({ ...p, ts: p.at, context: p.context_json ? JSON.parse(p.context_json) : null })),
    getPunchRequest: async (u, id) => await db.prepare('SELECT * FROM punch_requests WHERE username=? AND request_id=?').get(u, id),
    async savePunchRequest(u, id, operation, sid, response) {
      await db.prepare(
        'INSERT INTO punch_requests(username,request_id,operation,session_id,response_json,created_at) VALUES(?,?,?,?,?,?)'
      ).run(u, id, operation, sid ?? null, JSON.stringify(response), now());
    },
    // Dọn bảng nhớ requestId của Check-in/out (server.js gọi một lần lúc khởi động rồi mỗi PUNCH_REQUEST_PURGE_HOURS giờ):
    // chỉ xoá bản ghi CŨ HƠN olderThanDays ngày, để bấm lại sau lỗi mạng vẫn nhận đúng phản hồi cũ thay vì chấm công hai lần
    // (public/nhan-vien/punch.js → ATTEMPT_TTL_MS phải ngắn hơn hạn này). Dòng chưa có created_at giữ nguyên.
    async purgePunchRequests(olderThanDays) {
      const days = Number(olderThanDays);
      if (!Number.isFinite(days) || !(days > 0)) throw new Error('purgePunchRequests cần số ngày lớn hơn 0');
      const cutoff = new Date(Date.now() - days * DEFAULTS['unit.msPerDay']).toISOString();
      return Number(
        (await transaction(async () =>
          await db.prepare('DELETE FROM punch_requests WHERE created_at IS NOT NULL AND created_at < ?').run(cutoff)
        )).changes
      );
    },
    async migrateAttendanceSessions() {
      if (await db.prepare('SELECT 1 FROM settings WHERE key=?').get('attendance_sessions_v1')) return;
      await db.exec('SAVEPOINT attendance_migration');
      try {
        const legacy = await db.prepare('SELECT * FROM attendance_days ORDER BY username,date').all();
        const opens = new Map();
        for (const r of legacy) {
          const e = JSON.parse(r.entry_json);
          if (e.reason === 'open') {
            if (opens.has(r.username)) throw new Error(`Cần đối soát ${r.username}: nhiều phiên mở trong dữ liệu cũ`);
            opens.set(r.username, r.date);
          }
        }
        for (const r of legacy) {
          const key = `day:${r.username}:${r.date}`;
          if (await db.prepare('SELECT 1 FROM attendance_sessions WHERE legacy_key=?').get(key)) continue;
          const e = JSON.parse(r.entry_json);
          await api.createSession(
            r.username,
            r.date,
            e.reason === 'open' ? 'open' : 'closed',
            e,
            key,
            r.updated_at,
            r.updated_at
          );
        }
        const people = await db.prepare('SELECT * FROM staff').all();
        for (const staff of people) {
          const events = await db.prepare('SELECT * FROM punches WHERE username=? ORDER BY id').all(staff.username),
            pairs = [];
          let pending = null,
            ambiguous = false;
          for (const ev of events) {
            if (ev.type === 'in') {
              if (pending) ambiguous = true;
              pending = ev;
            } else if (ev.type === 'out' && pending) {
              if (!ambiguous && Date.parse(ev.at) >= Date.parse(pending.at)) pairs.push([pending, ev]);
              pending = null;
              ambiguous = false;
            }
          }
          if (pending && ambiguous)
            throw new Error(`Cần đối soát ${staff.username}: nhiều dấu Check-in chưa xác định phiên mở`);
          const context = e => (e.context_json ? JSON.parse(e.context_json) : {});
          const dateOf = e => context(e)?.plannedShift?.date || P.vnDate(e.at);
          const pairEntry = (a, b) => {
            const planned = context(a)?.plannedShift;
            if (!planned)
              return {
                kind: 'pending',
                reason: b.auto ? 'forgot-out' : 'legacy-review',
                src: 'punch',
                presIn: a.at,
                ...(!b.auto ? { presOut: b.at } : {})
              };
            const info = {
              shiftCode: planned.code,
              sched: scheduleOfType(staff.type)
            };
            return b.auto
              ? P.forgotDay(info, a.at, planned).entry
              : P.buildDay(info, a.at, b.at, 'punch', { plannedShift: planned }).entry;
          };
          const counts = new Map();
          for (const [a] of pairs) counts.set(dateOf(a), (counts.get(dateOf(a)) || 0) + 1);
          for (const [a, b] of pairs) {
            if (a.session_id || b.session_id) continue;
            const date = dateOf(a),
              allSessions = await api.listSessions({ username: staff.username }),
              sessions = allSessions.filter(s => s.date === date);
            let target = allSessions.find(
              s => s.entry.presIn === a.at && (s.entry.presOut === b.at || (b.auto && s.entry.reason === 'forgot-out'))
            );
            const overlaps = allSessions.filter(
              s =>
                s.entry.presIn &&
                s.entry.presOut &&
                Date.parse(a.at) < Date.parse(s.entry.presOut) &&
                Date.parse(b.at) > Date.parse(s.entry.presIn)
            );
            if (!target && overlaps.length === 1 && overlaps[0].entry.src === 'admin') target = overlaps[0];
            // A uniquely represented edited day uses its original punches as evidence, never a second paid-looking row.
            if (!target && sessions.length === 1 && counts.get(date) === 1 && sessions[0].entry.src === 'admin')
              target = sessions[0];
            if (!target && overlaps.length) continue; // Uncertain evidence stays raw instead of duplicating presence.
            const historicalWindow = await AsyncList.some(allSessions, async s => {
              const plan = s.entry.plannedShift;
              return (
                plan &&
                (await db.prepare('SELECT 1 FROM attendance_sessions WHERE id=? AND legacy_key LIKE ?').get(s.id, 'day:%')) &&
                Date.parse(a.at) < Date.parse(plan.endIso) &&
                Date.parse(b.at) > Date.parse(plan.startIso)
              );
            });
            if (!target && historicalWindow) continue; // Edited night hours may no longer overlap their original punches.
            if (!target && sessions.length === 0)
              target = await api.createSession(
                staff.username,
                date,
                'closed',
                pairEntry(a, b),
                `punch:${a.id}:${b.id}`,
                a.at,
                b.at
              );
            else if (
              !target &&
              (await AsyncList.every(
                sessions,
                async s => !(await db.prepare('SELECT 1 FROM attendance_sessions WHERE id=? AND legacy_key LIKE ?').get(s.id, 'day:%'))
              ))
            )
              target = await api.createSession(
                staff.username,
                date,
                'closed',
                pairEntry(a, b),
                `punch:${a.id}:${b.id}`,
                a.at,
                b.at
              );
            if (target) await db.prepare('UPDATE punches SET session_id=? WHERE id IN (?,?)').run(target.id, a.id, b.id);
          }
          if (pending && !pending.session_id) {
            const date = dateOf(pending),
              matches = (await api.listSessions({ username: staff.username })).filter(s => s.entry.presIn === pending.at);
            let target = matches.length === 1 ? matches[0] : null;
            if (!target) {
              if (await api.openSession(staff.username))
                throw new Error(`Cần đối soát ${staff.username}: nhiều phiên mở không xác định`);
              const plan = context(pending)?.plannedShift;
              target = await api.createSession(
                staff.username,
                date,
                'open',
                {
                  kind: 'pending',
                  reason: 'open',
                  src: 'punch',
                  presIn: pending.at,
                  ...(plan ? { plannedShift: plan } : { outsideShift: true })
                },
                `open:${pending.id}`,
                pending.at,
                pending.at
              );
            }
            await db.prepare('UPDATE punches SET session_id=? WHERE id=?').run(target.id, pending.id);
          }
        }
        for (const c of await db.prepare('SELECT * FROM corrections WHERE session_id IS NULL').all()) {
          const candidates = await api.listSessions({ username: c.username, date: c.date });
          const exact = candidates.filter(s => s.entry.presIn === c.req_in && s.entry.presOut === c.req_out);
          const s = exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null;
          if (s)
            await db.prepare('UPDATE corrections SET session_id=?,session_version=? WHERE id=?').run(s.id, s.version, c.id);
        }
        await db.prepare('INSERT INTO settings(key,value_json) VALUES(?,?)').run(
          'attendance_sessions_v1',
          JSON.stringify({ at: now() })
        );
        await db.exec('RELEASE attendance_migration');
      } catch (error) {
        await db.exec('ROLLBACK TO attendance_migration');
        await db.exec('RELEASE attendance_migration');
        throw error;
      }
    }
  };
  // Dữ liệu chấm công cũ mơ hồ (nhiều phiên mở) thì không nâng cấp được: dừng hẳn, nói rõ cần sửa gì, không in stack.
  api.init = async () => {
  try {
    await api.migrateAttendanceSessions();
  } catch (error) {
    bootFail([
      'Không khởi động được: dữ liệu chấm công cũ cần đối soát trước khi chuyển sang phiên chấm công.',
      `Chi tiết: ${error.message}`,
      'Cần sửa: mỗi nhân sự chỉ được có tối đa một ngày đang mở (reason "open" trong attendance_days)',
      'và không có hai lần Check-in liên tiếp mà thiếu Check-out trong punches. Đóng hoặc bỏ phần thừa của người nêu trên.',
      'Sao lưu DB (cả file -wal và -shm) trước khi sửa, rồi khởi động lại.',
      'Lần nâng cấp này đã được hoàn tác, chưa có dữ liệu chấm công nào bị đổi.'
    ]);
  }
  };
  return api;
};
module.exports.ADMIN_ORIGIN = ADMIN_ORIGIN;
