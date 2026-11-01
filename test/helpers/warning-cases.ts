'use strict';
// Bảng ca thử cho các kiểm tra chỉ cảnh báo. Mỗi ca là MỘT yêu cầu vi phạm quy trình hoặc nghiệp vụ:
// yêu cầu thành công (200), phản hồi có `warnings[]` mang mã (hoặc câu) của vi phạm, và dữ liệu thật sự được lưu.
// Dùng ở test/api/warnings-cases.test.ts.
// Mỗi ca "kỳ" lấy một tháng riêng của monthPool (payroll_runs, payslips, param_versions, audit_log chỉ-thêm-dòng); ca "tự do" dùng tháng xa FREE_MONTH.
// Người bịa của helpers/period-flow.js: qa_tts1 (TTS ca n1), qa_ctv1 (CTV ca n2), qa_nv1 (NV ca g2), qa_nv2 (NV bậc 3, ca f2) và admin.
const assert = require('node:assert/strict');
const S = require('./settings-api');
const { assertPlain } = require('./plain-text');

const { F, store } = S;
const FREE_MONTH = '2029-03'; // đồng hồ giả được seed đặt sang 02/04/2029; chưa kỳ nào của test đụng tới tháng này
const FAR_MONTH = '2029-06'; // tháng hiệu lực cho tham số: không ảnh hưởng số tiền của tháng nào đã dùng
const HQ = { lat: 10.7769, lng: 106.7009 };
const M_PER_DEG = (Math.PI / 180) * 6371000;
const REASON = 'Lý do đủ mười ký tự';

const put = async (who?, route?, body?) => await F.call('PUT', route, { who, body });
const post = async (who?, route?, body?) => await F.call('POST', route, { who, body });
const day = { kind: 'work', in: '10:00', out: '19:00' }; // ca n2 của qa_ctv1
const n1 = { kind: 'work', in: '08:00', out: '17:00' };
const sheet = async (who?, month?, days?, extra: any = {}) => await put(who, '/sheet', { month, days, ...extra });
const savedDay = async (who?, month?, date?) => (await store.getSheet(who, month)).days[date];

// Lịch ước tính vi phạm một luật: ngày do hàm days(ctx) cho, người khai who
const sheetCase = (id, title, { who = 'qa_ctv1', days, message, saved, setup, extra }: any) => ({
  id,
  title,
  free: true,
  setup,
  fire: async (ctx?) => await sheet(who, ctx.M, await days(ctx), extra && extra(ctx)),
  warn: { message },
  saved:
    saved ||
    (async (ctx, res) => assert.ok(Object.keys((await store.getSheet(who, ctx.M)).days).length > 0, 'lịch đã lưu'))
});
const sunday = (ctx?) => S.firstDow(ctx.M, 0);
const monday = (ctx?) => S.firstDow(ctx.M, 1);
const saturday = (ctx?) => S.firstDow(ctx.M, 6);

// Đưa kỳ tới `target` rồi trả ngữ cảnh
const toState = (target?) => async ctx => await S.advance(ctx.M, target);
const items = async (ctx?) => S.itemsOf(await S.slipRows(ctx.M));

const CASES = [
  /* ---------- kỳ lương ---------- */
  {
    id: 'A1',
    title: 'chốt công khi còn khoản chờ duyệt',
    setup: async (ctx?) => {
      const days = { ...(await store.getSheet('qa_nv1', ctx.M)).days, [await S.lastDow(ctx.M, 6)]: { kind: 'isat' } };
      const res = await sheet('qa_nv1', ctx.M, days);
      assert.equal(res.status, 200, JSON.stringify(res.data));
    },
    fire: async (ctx?) => await S.step(ctx.M, 'lock-attendance'),
    warn: { codes: ['PENDING_APPROVALS'] },
    saved: async (ctx?) => assert.equal((await S.periodRow(ctx.M)).status, 'attendance_locked')
  },
  {
    id: 'A2',
    title: 'duyệt kỳ ngay sau tính lương (chưa AI kiểm tra, phiếu còn nháp): phiếu nháp được duyệt cùng',
    setup: toState('calculated'),
    fire: async (ctx?) => await S.step(ctx.M, 'approve'),
    warn: {},
    saved: async (ctx?) => {
      assert.equal((await S.periodRow(ctx.M)).status, 'approved');
      assert.ok(
        (await S.slipRows(ctx.M)).every(r => r.status === 'approved'),
        'mọi phiếu đã duyệt'
      );
    }
  },
  {
    id: 'A5',
    title: 'trả lại phiếu không ghi chú',
    setup: async (ctx?) => {
      await S.advance(ctx.M, 'calculated');
      await S.decide(ctx.M, await items(ctx));
    },
    fire: async (ctx?) => await S.decide(ctx.M, [(await items(ctx))[0]], 'return'),
    warn: { optional: true },
    saved: async (ctx?) =>
      assert.equal((await S.slipRows(ctx.M))[0].status, 'draft', 'phiếu trả lại về bản nháp (trước đó đã duyệt)')
  },
  {
    id: 'A6',
    title: 'duyệt phiếu thực lĩnh âm',
    setup: async (ctx?) => {
      await S.advance(ctx.M, 'reviewed');
      const row = (await S.slipRows(ctx.M)).find(r => r.username === 'qa_nv1');
      const res = await put('admin', '/slip-override', {
        user: 'qa_nv1',
        month: ctx.M,
        values: { advance: row.gross + 1000000 },
        reason: REASON
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
    },
    fire: async (ctx?) => await S.decide(ctx.M, await items(ctx)),
    warn: { codes: ['PAYSLIP_NEGATIVE_NET'] },
    saved: async (ctx?) => assert.ok((await S.slipRows(ctx.M)).every(r => r.status === 'approved'))
  },
  {
    id: 'A8',
    title: 'mở lại kỳ không ghi lý do',
    setup: toState('calculated'),
    fire: async (ctx?) => await S.step(ctx.M, 'reopen', { to: 'attendance_locked' }),
    warn: { optional: true },
    saved: async (ctx?) => assert.equal((await S.periodRow(ctx.M)).status, 'attendance_locked')
  },
  {
    id: 'D3',
    title: 'sửa số trên phiếu không ghi lý do',
    free: true,
    fire: async (ctx?) =>
      await put('admin', '/slip-override', { user: 'qa_nv1', month: ctx.M, values: { otPay: 1000 } }),
    warn: { optional: true },
    saved: async (ctx?) => assert.equal((await store.getSlipOverride('qa_nv1', ctx.M)).values.otPay, 1000)
  },

  /* ---------- khoá theo kỳ, mở lại kỳ đã chi trả, tự duyệt, sàn luật ---------- */
  {
    id: 'K5-1',
    title: 'lưu lịch ước tính vào kỳ đã chốt công (không còn khoá kỳ)',
    setup: toState('attendance_locked'),
    fire: async (ctx?) => await sheet('qa_ctv1', ctx.M, { [monday(ctx)]: day }),
    warn: { codes: ['PERIOD_LOCKED'] },
    saved: async (ctx?) => assert.equal((await savedDay('qa_ctv1', ctx.M, monday(ctx))).kind, 'work')
  },
  {
    id: 'K5-2',
    title: 'ghi vào kỳ đã chi trả (sửa số phiếu)',
    setup: toState('paid'),
    fire: async (ctx?) =>
      await put('admin', '/slip-override', { user: 'qa_nv1', month: ctx.M, values: { otPay: 1000 }, reason: REASON }),
    warn: { codes: ['PERIOD_LOCKED'] },
    saved: async (ctx?) => assert.equal((await store.getSlipOverride('qa_nv1', ctx.M)).values.otPay, 1000)
  },
  {
    id: 'K5-3',
    title: 'lưu lịch ước tính vào kỳ đã chi trả',
    setup: toState('paid'),
    fire: async (ctx?) => await sheet('qa_ctv1', ctx.M, { [monday(ctx)]: day }),
    warn: { codes: ['PERIOD_LOCKED'] },
    saved: async (ctx?) => assert.equal((await savedDay('qa_ctv1', ctx.M, monday(ctx))).kind, 'work')
  },
  {
    id: 'K5-4',
    title: 'mở lại kỳ đã chi trả',
    setup: toState('paid'),
    fire: async (ctx?) => await S.step(ctx.M, 'reopen', { to: 'calculated', reason: REASON }),
    warn: { codes: ['PERIOD_STATE'] },
    saved: async (ctx?) => assert.equal((await S.periodRow(ctx.M)).status, 'calculated')
  },
  {
    id: 'K5-5',
    title: 'tự duyệt phiếu của chính mình (người làm lương cũng nhận lương)',
    setup: async (ctx?) => {
      await S.advance(ctx.M, 'reviewed');
      await S.grant('qa_nv1', 'cb');
    },
    fire: async (ctx?) => {
      const own = (await S.slipRows(ctx.M)).find(r => r.username === 'qa_nv1');
      return await S.decide(ctx.M, [{ username: 'qa_nv1', rev: own.rev }], 'approve', undefined, 'qa_nv1');
    },
    warn: { codes: ['SELF_DECISION_FORBIDDEN'] },
    saved: async (ctx?) => {
      assert.equal((await S.slipRows(ctx.M)).find(r => r.username === 'qa_nv1').status, 'approved');
      const rows = (await S.auditOf(ctx.M)).filter(r => r.actor === 'qa_nv1');
      assert.ok(
        rows.some(r => r.after && r.after.self === true),
        `nhật ký phải ghi after.self = true: ${JSON.stringify(rows.map(r => [r.action, r.after]))}`
      );
    }
  },
  {
    id: 'K5-6',
    title: 'tham số dưới sàn luật mức cứng',
    free: true,
    // khoá cố định thay vì dò bằng validateValue: bộ kiểm giá trị không còn báo lỗi cứng nên bộ dò S.hardFloorKey() trả null và bài bị bỏ qua âm thầm
    // phụ trội giờ nghỉ đêm có sàn luật mức cứng 30 % (Bộ luật Lao động 45/2019/QH14, Điều 98 khoản 2)
    ready: () => S.entryOf('night.breakPremium'),
    setup: async () => await S.setMode('defaults-only'),
    fire: async () =>
      await S.saveChanges([{ key: 'night.breakPremium', value: 0.1 }], {
        month: FAR_MONTH,
        extra: { basis: 'Căn cứ thử', acknowledge: [{ key: 'night.breakPremium', code: 'PARAM_FLOOR_ACK_REQUIRED' }] }
      }),
    warn: { codes: ['PARAM_BELOW_LEGAL_FLOOR'] },
    saved: async () => assert.ok((await S.rowCount()) > 0, 'đã lưu một phiên bản tham số')
  },

  /* ---------- lịch ước tính ---------- */
  sheetCase('B1', 'khai ngày làm vào Chủ nhật', {
    days: (ctx?) => ({ [sunday(ctx)]: day }),
    message: /Chủ nhật/,
    saved: async (ctx?) => assert.equal((await savedDay('qa_ctv1', ctx.M, sunday(ctx))).kind, 'work')
  }),
  sheetCase('B2', 'TTS đi làm vào ngày ngoài lịch (Thứ Bảy)', {
    who: 'qa_tts1',
    days: (ctx?) => ({ [saturday(ctx)]: n1 }),
    message: /ngoài lịch làm việc/,
    saved: async (ctx?) => assert.equal((await savedDay('qa_tts1', ctx.M, saturday(ctx))).kind, 'work')
  }),
  sheetCase('B3', 'giờ vào – ra khác ca cố định do Admin gán', {
    days: (ctx?) => ({ [monday(ctx)]: { kind: 'work', in: '11:00', out: '20:00' } }),
    message: /ca cố định/,
    saved: async (ctx?) => assert.equal((await savedDay('qa_ctv1', ctx.M, monday(ctx))).in, '11:00')
  }),
  // OT vào ngày lễ không có trong bảng: khai và trả OT ngày lễ, không phải chỗ chặn (test holiday-ot-entry).
  // Làm bù ngày lễ bị chặn nên cũng không thuộc bảng này.
  sheetCase('B7', 'OT rơi vào khung 22h–6h', {
    days: (ctx?) => ({ [monday(ctx)]: { ...day, extraKind: 'ot', extraOut: '23:00' } }),
    message: /22h/,
    saved: async (ctx?) => assert.equal((await savedDay('qa_ctv1', ctx.M, monday(ctx))).extraOut, '23:00')
  }),
  sheetCase('B10', 'TTS khai OT (chức vụ không có overtime)', {
    who: 'qa_tts1',
    days: (ctx?) => ({ [monday(ctx)]: { ...n1, extraKind: 'ot', extraOut: '19:00' } }),
    message: /không có overtime/,
    saved: async (ctx?) => assert.equal((await savedDay('qa_tts1', ctx.M, monday(ctx))).extraKind, 'ot')
  }),
  sheetCase('B13', 'nghỉ không lương ngày thường khi còn phép năm', {
    who: 'qa_nv1',
    days: (ctx?) => ({ [monday(ctx)]: { kind: 'unpaid' } }),
    message: /ngày thường phải dùng phép năm/,
    saved: async (ctx?) => assert.equal((await savedDay('qa_nv1', ctx.M, monday(ctx))).kind, 'unpaid')
  }),
  sheetCase('B15', 'mức KPI khai vượt mức tối đa của bậc', {
    days: (ctx?) => ({ [monday(ctx)]: day }),
    extra: () => ({ kpiAmt: 99000000 }),
    message: /vượt mức tối đa/,
    saved: async (ctx?) => assert.ok((await store.getSheet('qa_ctv1', ctx.M)).kpiAmt > 0, 'mức KPI đã lưu')
  }),

  /* ---------- Check-in ---------- */
  {
    id: 'C1',
    title: 'Check-in ngoài vùng GPS của công ty',
    free: true,
    setup: async (ctx?) => {
      const fence = await put('admin', '/settings/geofence', { ...HQ, radiusM: 150, maxAccuracyM: 80 });
      assert.equal(fence.status, 200, JSON.stringify(fence.data));
      await F.at('2029-04-03T07:50:00'); // Thứ Ba
    },
    fire: async () =>
      await post('qa_tts1', '/punch', {
        type: 'in',
        requestId: 'k4-geo-0001',
        explanation: 'Giải trình lúc bấm', // Check-in ngoài vùng phải kèm giải trình
        location: { lat: HQ.lat + 500 / M_PER_DEG, lng: HQ.lng, accuracy: 10 }
      }),
    warn: { message: /ngoài phạm vi công ty/ },
    saved: async () => {
      const open = await store.openSession('qa_tts1');
      assert.ok(open, 'lượt Check-in đã tạo');
      // chỉ MỘT cờ boolean outsideZone: true (không toạ độ, độ chính xác, khoảng cách hay mã lý do)
      assert.strictEqual(open.entry.outsideZone, true, 'lượt mang cờ outsideZone: true');
      const forbiddenKeys = /^(lat|lng|latitude|longitude|accuracy|location|distance|distanceM|geo)$/i;
      const keysOf = (node?) =>
        node && typeof node === 'object' ? Object.entries<any>(node).flatMap(([k, v]: any) => [k, ...keysOf(v)]) : [];
      assert.deepEqual(
        keysOf(open).filter(k => forbiddenKeys.test(k)),
        [],
        'lượt không có khoá toạ độ nào'
      );
      assert.doesNotMatch(JSON.stringify(open), /10\.7\d|106\.70\d/, 'không có số toạ độ trong lượt');
      // và không bảng nào (trừ cài đặt vùng GPS và nhật ký đổi vùng, vốn chứa toạ độ công ty) mang toạ độ của lượt Check-in
      for (const table of (await F.tables()).filter(name => !['settings', 'audit_log'].includes(name)))
        for (const row of await store.db.prepare(`SELECT * FROM ${table}`).all())
          assert.doesNotMatch(
            JSON.stringify(row, (k, v) => (v instanceof Uint8Array ? '' : v)),
            /10\.7\d{2}|106\.70\d/,
            `bảng ${table} chứa toạ độ`
          );
    }
  },

  /* ---------- KPI ---------- */
  {
    id: 'D1',
    title: 'nhập điểm KPI cho tháng chưa bắt đầu',
    free: true,
    fire: async () => await put('admin', '/kpi/scores', { user: 'qa_ctv1', month: '2029-06', scores: { wework: 80 } }),
    warn: { message: /chưa bắt đầu/ },
    saved: async () => assert.equal((await store.getKpiScores('qa_ctv1', '2029-06')).scores.wework != null, true)
  },

  /* ---------- cài đặt tham số ---------- */
  {
    id: 'E1',
    title: 'lưu tham số không ghi lý do',
    free: true,
    ready: () => S.adminKey(),
    setup: async () => await S.setMode('defaults-only'),
    fire: async () => {
      const key = await S.adminKey();
      const [value] = await S.differing(key, FAR_MONTH);
      return await S.saveChanges([{ key: key.key, value }], { month: FAR_MONTH, reason: undefined });
    },
    warn: { optional: true },
    saved: async () => assert.ok((await S.rowCount()) > 0)
  },
  {
    id: 'E3',
    title: 'lưu tham số dưới/trên mức khuyến nghị mà không tích xác nhận',
    free: true,
    ready: () => S.softFloorKey(),
    setup: async () => await S.setMode('defaults-only'),
    fire: async () => {
      const found = await S.softFloorKey();
      return await S.saveChanges([{ key: found.key, value: found.value }], {
        month: FAR_MONTH,
        extra: { basis: 'Căn cứ thử' }
      });
    },
    warn: { codes: ['PARAM_FLOOR_ACK_REQUIRED'] },
    saved: async () => assert.ok((await S.rowCount()) > 0)
  },
  {
    id: 'E2',
    title: 'Kế toán sửa tham số luật mà không ghi căn cứ',
    free: true,
    ready: () => S.accountingKey(),
    setup: async () => await S.setMode('defaults-only'),
    fire: async () => {
      const found = await S.accountingKey();
      return await S.saveChanges([{ key: found.key, value: found.value }], {
        month: FAR_MONTH,
        extra: { basis: '' },
        who: 'admin'
      });
    },
    warn: { optional: true },
    saved: async () => assert.ok((await S.rowCount()) > 0)
  },

  /* ---------- hồ sơ, tài khoản ---------- */
  {
    id: 'G5',
    title: 'Admin đặt lại mật khẩu không ghi lý do',
    free: true,
    fire: async () => await post('admin', '/staff/qa_tts1/password', { password: 'mat-khau-moi-12345' }),
    warn: { optional: true },
    saved: async () => {
      const auth = require('../../src/platform/auth');
      assert.equal(auth.verifyPassword('mat-khau-moi-12345', (await store.getStaffRow('qa_tts1')).pass_hash), true);
    }
  },

  /* ---------- duyệt khoản tự khai ---------- */
  {
    id: 'H1',
    title: 'từ chối khoản tự khai không ghi lý do',
    free: true,
    setup: async (ctx?) => {
      const days = { [await S.lastDow(ctx.M, 6)]: { kind: 'isat' } };
      const res = await sheet('qa_nv1', ctx.M, days);
      assert.equal(res.status, 200, JSON.stringify(res.data));
    },
    fire: async (ctx?) => {
      const row = (await store.approvals.list({ status: 'pending', username: 'qa_nv1' }))[0];
      assert.ok(row, 'có khoản chờ duyệt');
      return await put('admin', '/approvals/decide', {
        action: 'reject',
        items: [{ username: row.username, date: row.date, rev: row.rev, fingerprint: row.fingerprint }]
      });
    },
    warn: { optional: true },
    saved: async () => assert.equal((await store.approvals.list({ status: 'rejected', username: 'qa_nv1' })).length, 1)
  }
];

/* ---------- bộ chạy ---------- */
// Dựng thế giới cho một ca: kỳ lấy tháng riêng từ `nextMonth` (monthPool của file test), ca tự do dùng FREE_MONTH
async function prepare(c?, nextMonth?) {
  const month = c.free ? FREE_MONTH : nextMonth();
  const world = await S.seed(month);
  const ctx = { M: month, holiday: world.holiday };
  if (c.setup) await c.setup(ctx);
  return ctx;
}
// 200, cảnh báo mang mã/câu của vi phạm, dữ liệu đã lưu
async function checkWarn(c?, ctx?) {
  const res = await c.fire(ctx);
  assert.equal(res.status, 200, `${c.id} warn: ${res.status} ${JSON.stringify(res.data).slice(0, 400)}`);
  if (c.warn.optional) {
    // lý do / căn cứ là tuỳ chọn: thiếu thì lưu bình thường, không cần cảnh báo
    await c.saved(ctx, res);
    return res;
  }
  const list = res.data.warnings;
  assert.ok(
    Array.isArray(list) && list.length > 0,
    `${c.id} warn: phản hồi có warnings[]: ${JSON.stringify(res.data).slice(0, 300)}`
  );
  for (const w of list) {
    assert.equal(typeof w.code, 'string', `${c.id}: cảnh báo có mã`);
    assertPlain(w.message, `${c.id}: câu cảnh báo`);
    assert.ok(typeof w.message === 'string' && w.message.length > 0, `${c.id}: cảnh báo có câu tiếng Việt`);
  }
  for (const code of c.warn.codes || [])
    assert.ok(
      list.some(w => w.code === code),
      `${c.id} warn: thiếu cảnh báo ${code}; có ${list.map(w => w.code)}`
    );
  if (c.warn.message)
    assert.ok(
      list.some(w => c.warn.message.test(w.message)),
      `${c.id} warn: không câu nào khớp ${c.warn.message}`
    );
  await c.saved(ctx, res);
  return res;
}

module.exports = { CASES, FREE_MONTH, FAR_MONTH, prepare, checkWarn, S };
