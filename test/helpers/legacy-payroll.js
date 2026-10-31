'use strict';
// Bộ máy lương CŨ làm chuẩn so sánh: khối công thức đã đóng băng trong
// test/fixtures/legacy-payroll-block.js, cộng chuỗi đầy đủ của lib/ai/review.js → payResult:
//   lịch → ApprovalView.payView → (ActualHours.apply từ ngày bật) → calcMonth.
// Đây là "hợp đồng" mà bộ máy mới (public/payroll-engine.js) phải khớp: computeMonth(input) trả
// { m, payDays, pendingItems, actualReport } và m phải bằng m của bản này đến từng trường, kể cả rows và m.net.
// Mỗi lần gọi createLegacyEngine() nạp một vm mới nên hai bộ máy không dùng chung trạng thái.
const ApprovalView = require('../../public/approval-view.js');
const ActualHours = require('../../public/actual-hours.js');
const { loadPayroll } = require('./payroll-vm');

const LEGACY_EXPORTS = [
  'TYPES',
  'TAX_RULES',
  'OVER_LIMIT',
  'HOURS',
  'NIGHT_BREAK',
  'MAX_SPAN',
  'calcDay',
  'calcMonth',
  'calcNet',
  'taxFrom',
  'progressiveTax',
  'workedHours',
  'breakSlots'
];

function loadLegacyPayroll() {
  return loadPayroll({
    libs: ['payroll-calendar', 'kpi-score'],
    exports: LEGACY_EXPORTS,
    timeout: 5000
  }).api;
}

function createLegacyEngine() {
  const api = loadLegacyPayroll();
  // input: xem test/helpers/payroll-cases.js. kpi đã được chọn cách tính (số, { pct, ... } hoặc { method: 'five', parts, ... }).
  function computeMonth(input) {
    const { staff, days, approvals, sessions, kpi, holidays, month, upTo, asOf } = input;
    const { payDays: viewed, pendingItems } = ApprovalView.payView(days, approvals, undefined, {
      holidays,
      staffType: staff.type
    });
    const applied = ActualHours.apply(viewed, sessions, { asOf, staff, holidays, month });
    const payDays = applied.days;
    const actualReport = { report: applied.report, missing: applied.missing, absent: applied.absent };
    const m = api.calcMonth(staff, payDays, kpi, holidays, month, upTo);
    return { m, payDays, pendingItems, actualReport };
  }
  return { ...api, computeMonth, ENGINE_VERSION: 'legacy-frozen-2026-10-15' };
}

module.exports = { createLegacyEngine, loadLegacyPayroll, LEGACY_EXPORTS };
