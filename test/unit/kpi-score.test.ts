// KPI 5 thành phần (Quy chế lương 3P), phần hàm thuần: src/engine/kpi-score.ts (module dùng chung trình duyệt và máy chủ).
// Các tên được kiểm: COMPONENTS, WEWORK_MIN, checkScore, evaluate, pay.
// Các trường hợp biên (chờ điểm, dưới mốc đạt, Wework dưới 75) dùng cách tính mặc định của mô-đun.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverFiles, serverSourceOf } = require('../helpers/server-source');

// Chưa có src/engine/kpi-score.ts thì mỗi test thất bại với lỗi "Cannot find module" (đúng lý do), không dừng cả tệp.
let KpiScore;
try {
  KpiScore = require('../../src/engine/kpi-score');
} catch (error) {
  KpiScore = new Proxy(
    {},
    {
      get() {
        throw error;
      }
    }
  );
}

// Điểm theo thứ tự Wework / Người dùng / Đồng nghiệp / QLTT / Tự đánh giá
const parts = (wework?, user?, peer?, manager?, self?) => ({ wework, user, peer, manager, self });
const PASS = 75; // TYPES[type].kpiPass, nhận làm tham số

// 12 trường hợp: NV L1 mức KPI 6.000.000 ₫ trừ khi ghi khác; hệ số 1 trừ khi ghi khác.
const CASES = [
  { n: 1, p: parts(100, 100, 100, 100, 100), amt: 6000000, units: 1000000, expected: 6000000, reason: 'ok' },
  { n: 2, p: parts(100, 90, 80, 85, 100), amt: 6000000, units: 922000, expected: 5532000, reason: 'ok' },
  { n: 3, p: parts(80, 70, 70, 70, 70), amt: 6000000, units: 740000, expected: 0, reason: 'below-pass' }, // dưới mốc đạt
  { n: 4, p: parts(74, 100, 100, 100, 100), amt: 6000000, units: 896000, expected: 0, reason: 'wework' }, // Wework dưới 75
  { n: 5, p: parts(75, 75, 75, 75, 75), amt: 6000000, units: 750000, expected: 4500000, reason: 'ok' },
  { n: 6, p: parts(80, 80, 80, 80, 80), amt: 4000000, units: 800000, expected: 3200000, reason: 'ok' },
  { n: 7, p: parts(100, 100, 100, 100, 0), amt: 6000000, units: 940000, expected: 5640000, reason: 'ok' },
  { n: 8, p: parts(87.5, 92.25, 80, 90, 100), amt: 6000000, units: 883400, expected: 5300400, reason: 'ok' },
  { n: 11, p: parts(75, 100, 100, 100, 100), amt: 6000000, units: 900000, expected: 5400000, reason: 'ok' },
  { n: 12, p: parts(90, 90, 90, 90, 90), amt: 6500000, units: 900000, expected: 5850000, reason: 'ok' } // NV L2
];
const lineOf = (c?) => `ca ${c.n} (${Object.values<any>(c.p).join('/')}, mức ${c.amt})`;

// ================= tham số: khóa, trọng số =================

test('COMPONENTS: đúng 5 khóa wework/user/peer/manager/self, trọng số 40/24/18/12/6, tổng 100, đóng băng', () => {
  const list = KpiScore.COMPONENTS;
  assert.deepEqual(
    list.map(c => [c.key, c.weight]),
    [
      ['wework', 40],
      ['user', 24],
      ['peer', 18],
      ['manager', 12],
      ['self', 6]
    ]
  );
  assert.equal(
    list.reduce((sum, c) => sum + c.weight, 0),
    100
  );
  assert.ok(Object.isFrozen(list), 'danh sách phải bị đóng băng');
  assert.throws(() => {
    'use strict';
    list.push({ key: 'bonus', weight: 1 });
  });
  assert.equal(KpiScore.WEWORK_MIN, 75);
});

test('COMPONENTS khớp SLIP_QTY của server.js: wework→kpiBase, user→kpiUser, peer→kpiPeer, manager→kpiQltt, self→kpiSelf', async () => {
  const map = { wework: 'kpiBase', user: 'kpiUser', peer: 'kpiPeer', manager: 'kpiQltt', self: 'kpiSelf' };
  assert.deepEqual(KpiScore.COMPONENTS.map(c => c.key).sort(), Object.keys(map).sort());
  // đọc đúng file khai báo SLIP_QTY (server.js hoặc lib/routes/slip.js), không ghép chuỗi: indexOf đầu tiên có thể trúng chỗ khác
  const owner = serverFiles().find(rel => /^(?:export )?const SLIP_QTY = /m.test(serverSourceOf(rel)));
  assert.ok(owner, 'không thấy khai báo const SLIP_QTY trong mã máy chủ');
  const text = await serverSourceOf(owner);
  const at = text.search(/^(?:export )?const SLIP_QTY = /m);
  const block = text.slice(at, at + 800);
  for (const name of Object.values<any>(map)) assert.ok(block.includes(`'${name}'`), `SLIP_QTY thiếu ${name}`);
});

// ================= checkScore =================

test('checkScore: nhận số hữu hạn 0..100 với tối đa 2 chữ số thập phân, trả { ok:true, value }', () => {
  for (const v of [0, 100, 75, 87.5, 87.25, 0.01, 99.99, 80.07]) {
    const r = KpiScore.checkScore(v);
    assert.equal(r.ok, true, String(v));
    assert.equal(r.value, v);
  }
});

test('checkScore: null được phép (xóa điểm) và trả { ok:true, value:null }', () => {
  const r = KpiScore.checkScore(null);
  assert.equal(r.ok, true);
  assert.equal(r.value, null);
});

test('checkScore: từ chối (không kẹp) 101, -1, 100.01, 3 chữ số thập phân, NaN, vô cực, chuỗi, boolean, mảng, đối tượng', () => {
  const bad = [101, -1, 100.01, -0.01, 87.125, 0.001, NaN, Infinity, -Infinity, 1e400, '90', '', true, false, [90], {}];
  for (const v of bad) {
    const r = KpiScore.checkScore(v);
    assert.equal(r.ok, false, `phải từ chối ${JSON.stringify(v)} (${typeof v})`);
    assert.equal(typeof r.error, 'string');
    assert.ok(r.error.length > 0, 'phải có thông báo lỗi tiếng Việt');
    assert.notEqual(r.value, 100, 'không được kẹp về 100');
  }
});

// ================= evaluate + pay: 12 trường hợp =================

for (const c of CASES) {
  test(`${lineOf(c)}: evaluate cho units ${c.units}, lý do ${c.reason}; pay đúng ${c.expected} ₫`, () => {
    const e = KpiScore.evaluate(c.p, { pass: PASS });
    assert.equal(e.complete, true);
    assert.deepEqual(e.missing, []);
    assert.equal(e.units, c.units, 'units = Σ (điểm × 100) × trọng số, số nguyên');
    assert.equal(e.total, c.units / 10000);
    assert.equal(e.reason, c.reason);
    assert.equal(e.pass, c.reason === 'ok');
    assert.equal(e.weworkOk, c.p.wework >= 75);
    const money = e.pass ? KpiScore.pay(c.amt, e.units, 1) : 0;
    assert.equal(money, c.expected);
  });
}

test('ca 9: 100 điểm cả 5, hệ số 22/26 (giờ vượt ngưỡng): pay = 5.076.923,08 trước VND(), làm tròn 5.076.923 ₫', () => {
  const e = KpiScore.evaluate(parts(100, 100, 100, 100, 100), { pass: PASS });
  const money = KpiScore.pay(6000000, e.units, 22 / 26);
  assert.ok(Math.abs(money - 5076923.076923) < 1e-3, `được ${money}`);
  assert.equal(Math.round(money), 5076923);
  assert.equal(KpiScore.pay(6000000, e.units, 1), 6000000, 'hệ số 1 không đổi số tiền');
});

test('ca 10: thiếu một điểm (trống) thì chưa đủ điểm: complete false, missing nêu khóa, lý do incomplete, không đạt', () => {
  const e = KpiScore.evaluate(parts(90, 90, 90, 90, null), { pass: PASS });
  assert.equal(e.complete, false);
  assert.deepEqual(e.missing, ['self']);
  assert.equal(e.reason, 'incomplete');
  assert.equal(e.pass, false);
});

test('chờ điểm: nhiều thành phần thiếu, khóa vắng và undefined đều tính là thiếu; điểm 0 không phải thiếu', () => {
  const e = KpiScore.evaluate({ wework: 100, user: undefined, manager: null }, { pass: PASS });
  assert.equal(e.complete, false);
  assert.deepEqual([...e.missing].sort(), ['manager', 'peer', 'self', 'user']);
  assert.equal(e.reason, 'incomplete');
  assert.equal(e.pass, false);
  const none = KpiScore.evaluate({}, { pass: PASS });
  assert.deepEqual([...none.missing].sort(), ['manager', 'peer', 'self', 'user', 'wework']);
  // điểm 0 hợp lệ, khác null (ca 7)
  assert.equal(KpiScore.evaluate(parts(100, 100, 100, 100, 0), { pass: PASS }).complete, true);
});

test('chờ điểm thì tiền KPI là 0 dù các điểm đã nhập rất cao (K4: chờ điểm, KPI 0, chưa cộng vào tổng; đề xuất, chờ lead)', () => {
  const e = KpiScore.evaluate(parts(100, 100, 100, 100, null), { pass: PASS });
  assert.equal(e.pass, false);
  // module không được trả số tiền cho tháng chưa đủ điểm: nơi gọi dùng e.pass để quyết định
  assert.equal(e.complete ? KpiScore.pay(6000000, e.units, 1) : 0, 0);
});

// ================= số nguyên trên phần trăm (đơn vị 1/100) =================

test('số nguyên: units và so sánh ngưỡng tính trên điểm × 100, không phụ thuộc sai số số thực', () => {
  // 80,07 / 90,35 / 70,29 / 65,10 / 88,88 -> 8007×40 + 9035×24 + 7029×18 + 6510×12 + 8888×6 = 795090
  const e = KpiScore.evaluate(parts(80.07, 90.35, 70.29, 65.1, 88.88), { pass: PASS });
  assert.equal(e.units, 795090);
  assert.ok(Number.isInteger(e.units));
  assert.equal(e.total, 79.509);
  assert.equal(KpiScore.pay(6000000, e.units, 1), 4770540);
  // 1,15 × 100 = 114,99999999999999 trong số thực: vẫn phải ra 115
  const s = KpiScore.evaluate(parts(75, 1.15, 100, 100, 100), { pass: PASS });
  assert.equal(s.units, 7500 * 40 + 115 * 24 + 10000 * 18 + 10000 * 12 + 10000 * 6);
  assert.ok(Number.isInteger(s.units));
});

test('biên Base Wework: 74,99 không qua cổng (KPI 0), 75,00 qua cổng, dù bốn điểm còn lại 100', () => {
  const below = KpiScore.evaluate(parts(74.99, 100, 100, 100, 100), { pass: PASS });
  assert.equal(below.weworkOk, false);
  assert.equal(below.reason, 'wework');
  assert.equal(below.pass, false);
  const at = KpiScore.evaluate(parts(75, 100, 100, 100, 100), { pass: PASS });
  assert.equal(at.weworkOk, true);
  assert.equal(at.pass, true);
  assert.equal(KpiScore.pay(6000000, at.units, 1), 5400000);
});

test('biên tổng đạt: tổng đúng 75,00 là đạt, thiếu 0,004 điểm là không đạt (so sánh số nguyên)', () => {
  // 90/70/70/70/20: 9000×40 + 7000×24 + 7000×18 + 7000×12 + 2000×6 = 750000 đúng mốc
  const exact = KpiScore.evaluate(parts(90, 70, 70, 70, 20), { pass: PASS });
  assert.equal(exact.units, 750000);
  assert.equal(exact.reason, 'ok');
  assert.equal(exact.pass, true);
  assert.equal(KpiScore.pay(6000000, exact.units, 1), 4500000);
  // Wework 89,99 -> 749960 < 750000
  const under = KpiScore.evaluate(parts(89.99, 70, 70, 70, 20), { pass: PASS });
  assert.equal(under.units, 749960);
  assert.equal(under.weworkOk, true);
  assert.equal(under.reason, 'below-pass');
  assert.equal(under.pass, false);
});

test('mốc đạt lấy từ tham số pass, không cố định trong module (một nơi định nghĩa: TYPES[type].kpiPass)', () => {
  const p = parts(80, 70, 70, 70, 70); // tổng 74
  assert.equal(KpiScore.evaluate(p, { pass: 75 }).pass, false);
  assert.equal(KpiScore.evaluate(p, { pass: 74 }).pass, true);
});

// ================= trần level và công thức pay =================

test('pay: mức × units / 1.000.000 × hệ số; units 1.000.000 và hệ số 1 trả đúng mức', () => {
  assert.equal(KpiScore.pay(6000000, 1000000, 1), 6000000);
  assert.equal(KpiScore.pay(6000000, 922000, 1), 5532000);
  assert.equal(KpiScore.pay(0, 1000000, 1), 0);
  assert.equal(KpiScore.pay(6000000, 0, 1), 0);
  assert.equal(KpiScore.pay(6000000, 1000000, 0.5), 3000000);
});

test('K2: tổng dưới 75% thì KPI = 0 (đề xuất, chờ lead): 74,00% là không đạt dù qua cổng Wework', () => {
  const e = KpiScore.evaluate(parts(80, 70, 70, 70, 70), { pass: PASS });
  assert.equal(e.weworkOk, true);
  assert.equal(e.units, 740000);
  assert.equal(e.pass, false);
  assert.equal(e.reason, 'below-pass');
});

test('K3: Wework dưới 75 thì KPI tháng 0 kể cả khi bốn thành phần còn lại 100 (đề xuất, chờ lead)', () => {
  const e = KpiScore.evaluate(parts(74, 100, 100, 100, 100), { pass: PASS });
  assert.equal(e.total, 89.6);
  assert.equal(e.reason, 'wework');
  assert.equal(e.pass, false);
});

// ================= phương pháp theo tháng =================

// ================= trường hợp biên bổ sung =================

test('checkScore: từ chối điểm có nhiều hơn 2 chữ số thập phân dù rất sát số nguyên (74,999999999 không được thành 75,00 qua cổng Wework)', () => {
  for (const v of [74.999999999, 80.000000001, 99.9999995, 0.0000001]) {
    assert.equal(KpiScore.checkScore(v).ok, false, `phải từ chối ${v}`);
  }
  // điểm thật có 2 chữ số thập phân vẫn qua
  for (const v of [1.15, 0.29, 4.35, 80.07, 74.99, 75, 87.5, 92.25]) {
    assert.equal(KpiScore.checkScore(v).ok, true, `phải nhận ${v}`);
  }
});
