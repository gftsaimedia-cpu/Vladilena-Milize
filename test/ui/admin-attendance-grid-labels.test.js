'use strict';
// Màn Chấm công của Admin (public/admin/view-cham-cong.js): ô Bảng công, chú giải, cột đếm, tab Hôm nay và hộp một ngày chỉ dùng
// sáu nhãn của AttendanceStatus, đọc status / statusNote do máy chủ gửi kèm từng lượt.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AS = require('../../public/attendance-status.js');

const MONTH = '2026-11';
const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const session = (id, username, date, status, statusNote = '', open = false) => ({
  id,
  username,
  date,
  state: open ? 'open' : 'closed',
  status,
  statusNote,
  entry: {
    kind: open ? 'pending' : 'work',
    reason: open ? 'open' : undefined,
    presIn: `${date}T01:00:00.000Z`,
    presOut: open ? undefined : `${date}T10:00:00.000Z`
  },
  punches: [],
  corrections: []
});
const ROWS = [
  session(1, 'an', `${MONTH}-03`, 'pending', 'Vào trễ 22 phút'),
  session(2, 'an', `${MONTH}-04`, 'checked-out'),
  session(3, 'an', `${MONTH}-05`, 'approved', 'Giải trình Check-out muộn'),
  session(4, 'an', `${MONTH}-06`, 'admin'),
  session(5, 'an', `${MONTH}-09`, 'rejected', 'Giải trình Check-out muộn'),
  session(6, 'an', `${MONTH}-09`, 'checked-out'),
  session(7, 'an', `${MONTH}-10`, 'checked-in', '', true),
  // lượt quên Check-out bị lượt Admin khai thay cùng ngày thay (máy chủ đánh dấu superseded): không quyết định nhãn của ngày
  { ...session(8, 'an', `${MONTH}-06`, 'pending', 'Quên Check-out'), superseded: true }
];
const TODAY = {
  today: `${MONTH}-10`,
  rows: [
    { username: 'an', name: 'An', sessionId: 7, open: true, status: 'checked-in', statusNote: '', sessionCount: 1 },
    { username: 'binh', name: 'Bình', sessionId: 8, open: false, status: 'pending', statusNote: 'Về sớm 10 phút' },
    { username: 'chi', name: 'Chi', sessionId: null, status: null, statusNote: '' }
  ]
};

function load() {
  const staff = [{ username: 'an', name: 'An', type: 'nv', shiftCode: 'Normal1' }];
  const S = { view: 'cham-cong', month: MONTH, sub: {}, f: {}, q: {}, page: {} };
  const dialogs = [];
  const fixed = {
    esc,
    nf: n => String(n),
    ic: () => '',
    S,
    actions: {},
    views: {},
    register(key, view) {
      this.views[key] = view;
    },
    api: async (method, route) => (route.startsWith('/attendance') ? { rows: ROWS } : route === '/today' ? TODAY : {}),
    qs: () => '',
    staff: { promise: Promise.resolve(), byUser: new Map(staff.map(u => [u.username, u])), state: 'ok' },
    people: () => staff,
    holidaySet: () => new Set(),
    daysInMonth: () => 30,
    pad: n => String(n).padStart(2, '0'),
    vnToday: () => `${MONTH}-10`,
    dowOf: d => new Date(`${d}T00:00:00Z`).getUTCDay(),
    DOW_SHORT: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
    TYPE_LONG: { nv: 'Nhân viên' },
    typeCodes: () => ['nv'],
    chip: (on, act, attrs, label) => `<button data-act="${act}">${esc(label)}</button>`,
    header: (title, sub) => `<h1>${esc(title)}</h1><p class="sub">${sub}</p>`,
    pill: (kind, text) => `<span class="pill p-${esc(kind)}">${esc(text)}</span>`,
    pager: (key, total) => ({ start: 0, end: total, slice: list => list }),
    shiftOf: () => ['Normal1', 'Normal 1'],
    shiftName: () => 'Normal 1',
    shiftCode: c => c,
    fold: s => String(s || '').toLowerCase(),
    canActFor: () => false,
    meInfo: { actualFrom: `${MONTH}-01` },
    Ky: { load: async () => {}, data: () => null, congActs: () => '' },
    openDialog: o => dialogs.push(o),
    hm: iso => (iso ? iso.slice(11, 16) : ''),
    render() {},
    loadStaff() {},
    CcKhai: undefined // không khai lịch thay trong test này
  };
  // các hàm vẽ phụ không ảnh hưởng nhãn: trả chuỗi rỗng
  const A = new Proxy(fixed, { get: (t, k) => (k in t ? t[k] : () => '') });
  const window = { Admin: A, AttendanceStatus: AS, ActualHours: { lateMinutes: () => 0 } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/admin/view-cham-cong.js'), 'utf8'), {
    window,
    document: { querySelector: () => null },
    console
  });
  return { A, S, view: fixed.views['cham-cong'], dialogs };
}

test('Bảng công: ô theo nhãn của ngày, chú giải đúng sáu nhãn, cột Chờ xử lý đếm ngày Chờ xử lý', async () => {
  const { view } = load();
  await view.load();
  const html = view.render();
  const cell = d => new RegExp(`id="ccc-an-${MONTH}-${d}"[^>]*aria-label="An, [^:"]*: ([^"]*)"`).exec(html)[1];
  assert.equal(cell('03'), 'Chờ xử lý: Vào trễ 22 phút');
  assert.equal(cell('04'), 'Đã Check-out');
  assert.equal(cell('05'), 'Được phê duyệt: Giải trình Check-out muộn');
  assert.equal(cell('06'), 'Đã chấm công');
  assert.equal(cell('09'), 'Bị từ chối: Giải trình Check-out muộn');
  assert.equal(cell('10'), 'Đã Check-in');
  for (const label of Object.values(AS.LABEL))
    assert.ok(html.includes(`</span>${label}</span>`), `chú giải thiếu ${label}`);
  for (const old of ['Đủ công', 'Đang trong ca', 'Quên Check-in/out', 'nên đối soát', 'Có mặt', 'Cần xử lý'])
    assert.ok(!html.includes(old), `còn "${old}"`);
  // 8 lượt trên 6 ngày khác nhau; 1 ngày Chờ xử lý (ngày 06 đã có lượt Admin khai thay nên không tính)
  assert.match(html, /<td class="num cc-s">6<\/td><td class="num cc-s p">1<\/td>/);
  assert.match(html, /<b>1 ngày<\/b> chờ xử lý · 1 ngày bị từ chối/);
});

test('Hộp một ngày: nhãn của lượt và lý do ở ô Ghi chú', async () => {
  const { A, view, dialogs } = load();
  await view.load();
  view.render();
  A.actions.cccell({ dataset: { u: 'an', d: `${MONTH}-03` } });
  const body = dialogs[0].body;
  assert.match(body, /<span class="pill p-pending">Chờ xử lý<\/span>/);
  assert.match(body, /<span>Ghi chú<\/span><b>Vào trễ 22 phút<\/b>/);
  assert.ok(!body.includes('Ngày công'));
});

test('Hộp một ngày: ngày Admin khai thay vẫn liệt kê lượt quên Check-out với nhãn riêng của lượt', async () => {
  const { A, view, dialogs } = load();
  await view.load();
  view.render();
  A.actions.cccell({ dataset: { u: 'an', d: `${MONTH}-06` } });
  const body = dialogs[0].body;
  assert.match(body, /<span class="pill p-done">Đã chấm công<\/span>/);
  assert.match(body, /<span class="pill p-pending">Chờ xử lý<\/span>/);
  assert.match(body, /<b>Quên Check-out<\/b>/);
});

test('Hôm nay: nhãn của dòng do máy chủ gửi, lý do là chữ nhỏ, dòng chưa có lượt giữ "Chưa có lượt"', async () => {
  const { S, view } = load();
  S.sub.cc = 'hom-nay';
  await view.load();
  const html = view.render();
  assert.match(html, /<span class="pill p-line">Đã Check-in<\/span>/);
  assert.match(html, /<span class="pill p-pending">Chờ xử lý<\/span><span class="cap">Về sớm 10 phút<\/span>/);
  assert.match(html, /<span class="pill p-draft">Chưa có lượt<\/span>/);
  assert.ok(!html.includes('Đang trong ca'));
});
