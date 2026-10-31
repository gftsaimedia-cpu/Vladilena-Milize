'use strict';
// Tra nhân viên theo uuid (truy vết bằng uuid, không bằng tài khoản).
//   GET /api/employees/:uuid?month=          hồ sơ + chức vụ/bậc của tháng + ca được xếp (Employee.view), che trường theo quyền như GET /api/staff
//   GET /api/employees/:uuid/trace?beforeId=&limit=   nhật ký kiểm toán về người này, mới nhất trước (gộp cả dòng cũ ghi theo tài khoản)
// Sửa hồ sơ vẫn qua PUT /api/staff/:u (một đường ghi).
const authz = require('../../authz');
const config = require('../../config');
const audit = require('../../audit');
const { HttpError, send } = require('../../http');
const { validMonth } = require('../input');
const { vnToday } = require('../../request-rules');
const { container } = require('../container');
const { UUID_RE } = require('./employee-repository');

const bad = (message, code) => new HttpError(400, message, { code });
const notFound = () => new HttpError(404, 'Không có nhân viên này', { code: 'EMPLOYEE_NOT_FOUND' });

// Che như lib/domain/staff.js → staffForViewer: lương bậc cần salary.read, ngày sinh cần profile.read.pii
async function forViewer(me, view) {
  const target = { username: view.username };
  const out = { ...view, position: view.position ? { ...view.position } : null };
  if (!await authz.can(me, 'salary.read', target) && out.position) {
    delete out.position.baseSalary;
    delete out.position.kpiMax;
  }
  if (!await authz.can(me, 'profile.read.pii', target)) delete out.birthday;
  return out;
}

async function handle({ res, seg, url, me }) {
  const uuid = String(seg[2] || '').toLowerCase();
  if (!UUID_RE.test(uuid)) throw bad('uuid không hợp lệ', 'BAD_UUID');
  if (seg.length === 3) {
    const month = url.searchParams.get('month') || vnToday().slice(0, 7);
    if (!validMonth(month)) throw bad('month phải dạng YYYY-MM', 'BAD_MONTH');
    const employee = await container.employees.byUuid(uuid, month);
    if (!employee) throw notFound();
    return send(res, 200, { month, employee: await forViewer(me, employee.view()) });
  }
  if (seg.length === 4 && seg[3] === 'trace') {
    const beforeId = url.searchParams.get('beforeId');
    if (beforeId !== null && !/^\d+$/.test(beforeId)) throw bad('beforeId phải là số nguyên không âm', 'BAD_CURSOR');
    const trace = await container.employees.trace(uuid, {
      limit: Math.min(Number(url.searchParams.get('limit')) || config.AUDIT_PAGE_DEFAULT, config.AUDIT_PAGE_MAX),
      beforeId: beforeId === null ? undefined : Number(beforeId),
      sensitivities: await authz.auditSensitivities(me) // mức nhạy cảm theo năng lực người xem, như GET /api/audit
    });
    if (!trace) throw notFound();
    return send(res, 200, { ...trace, items: trace.items.map(audit.publicRow) });
  }
  throw new HttpError(404, 'Không có đường dẫn này');
}

module.exports = { handle };
