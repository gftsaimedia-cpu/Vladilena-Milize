'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPeriodView, buildRow } = require('../../web/src/builders/admin-payroll/payroll');
const { buildDrawer } = require('../../web/src/builders/payslip/drawer');
const { describeScenario } = require('../../web/src/views/admin/payroll/scenarios');
const { getPeriodApprovalSummary, approvePeriod } = require('../../web/src/services/admin-payroll');

test('buildPeriodView: phiếu draft không tính vào facts.pending gây chặn duyệt kỳ', () => {
  const period = {
    status: 'calculated',
    rev: 7,
    run: { runNo: 1 },
    totals: { people: 10, gross: 100, insurance: 10, tax: 5, advance: 0, net: 85, approved: 0, pending: 0, draft: 9, error: 1 },
    stages: { attendanceLocked: { at: null }, approved: { at: null }, paid: { at: null } }
  };
  const list = { total: 10, page: 1, rows: [{ username: 'u1', name: 'A', type: 'nv', level: 1, status: 'draft' }] };
  const view = buildPeriodView('2026-11', period, list, { filter: 'all', pageSize: 14 });
  assert.equal(view.facts.pending, 0);
  assert.equal(view.facts.draft, 9);
  assert.equal(view.facts.unapproved, 9);
});

test('buildRow: gán shortProblem từ errorMessage, problem hoặc câu mặc định', () => {
  const r1 = buildRow({ username: 'u1', name: 'A', type: 'nv', level: 1, status: 'error', errorMessage: 'Thiếu CCCD' });
  assert.equal(r1.shortProblem, 'Thiếu CCCD');

  const r2 = buildRow({ username: 'u2', name: 'B', type: 'nv', level: 1, status: 'error', problem: 'Chưa chấm công' });
  assert.equal(r2.shortProblem, 'Chưa chấm công');

  const r3 = buildRow({ username: 'u3', name: 'C', type: 'nv', level: 1, status: 'error' });
  assert.equal(r3.shortProblem, 'Hồ sơ hoặc công chưa hợp lệ');
});

test('buildDrawer: phiếu draft bật canApprove và không lặp 2 pill Bản nháp', () => {
  const drawer = buildDrawer(
    '2026-11',
    'linh',
    { status: 'calculated' },
    {
      source: 'payslip',
      run: { runNo: 2 },
      payslip: { username: 'linh', name: 'Linh', type: 'nv', level: 1, status: 'draft', rev: 1, gross: 100, net: 90, cells: {} }
    }
  );
  assert.equal(drawer.canApprove, true);
  assert.equal(drawer.pills.length, 1);
  assert.equal(drawer.pills[0].label, 'Bản nháp · lần tính 2');
});

test('describeScenario: tháng 2026-11 dùng cùng kịch bản theo trạng thái kỳ, không khoá cứng nút Chốt công', () => {
  const ui = describeScenario('2026-11', 'tam-tinh', { calculated: 10, failed: 0, deadline: '' });
  const closeBtn = ui.actions.find((a: any) => a.key === 'close');
  assert.ok(closeBtn && !closeBtn.off);
  assert.equal(ui.extras, true);
});

test('getPeriodApprovalSummary: gom đủ danh sách phiếu lỗi qua các trang và trả rev + số lượng', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method });
    if (url === '/api/periods/2026-11') {
      return new Response(JSON.stringify({
        rev: 12,
        totals: { people: 205, draft: 190, pending: 5, approved: 8, error: 2 }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/periods/2026-11/payslips') && url.includes('page=1')) {
      return new Response(JSON.stringify({
        total: 2,
        page: 1,
        rows: [
          { username: 'err1', name: 'Error 1', errorMessage: 'Lỗi hồ sơ' },
          { username: 'err2', name: 'Error 2', problem: 'Lỗi chấm công' }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ total: 0, rows: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const summary = await getPeriodApprovalSummary('2026-11');
    assert.equal(summary.rev, 12);
    assert.equal(summary.draft, 190);
    assert.equal(summary.legacyPending, 5);
    assert.equal(summary.approved, 8);
    assert.equal(summary.errors.length, 2);
    assert.deepEqual(summary.errors[0], { username: 'err1', name: 'Error 1', shortProblem: 'Lỗi hồ sơ' });
    assert.deepEqual(summary.errors[1], { username: 'err2', name: 'Error 2', shortProblem: 'Lỗi chấm công' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('approvePeriod: gửi rev và excludeErrors tới POST /periods/:month/approve', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init.method, body });
    return new Response(JSON.stringify({ ok: true, status: 'approved' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const res = await approvePeriod('2026-11', {
      rev: 15,
      excludeErrors: [{ username: 'err1', reason: 'Nghỉ không lương cả tháng' }]
    });
    assert.equal(res.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/periods/2026-11/approve');
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(calls[0].body, {
      rev: 15,
      excludeErrors: [{ username: 'err1', reason: 'Nghỉ không lương cả tháng' }]
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
