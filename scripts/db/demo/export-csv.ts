'use strict';
// Xuất dữ liệu demo ra CSV để mở bằng Excel: UTF-8 có BOM (Excel đọc đúng tiếng Việt), xuống dòng CRLF, dấu phẩy phân cách.
// Chỉ đọc DB và scenarios.js; ghi vào thư mục đích (mặc định data/demo/, đã nằm trong .gitignore). Toàn bộ là người giả.
const fs = require('node:fs');
const path = require('node:path');
const S = require('./scenarios');

const cell = (v?) => {
  if (v === null || v === undefined) return '';
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
function writeCsv(dir?, file?, header?, rows?) {
  const body = [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  fs.writeFileSync(path.join(dir, file), '﻿' + body, 'utf8');
  return rows.length;
}

async function exportAll({ store, personas, dir, people = personas }: any) {
  const byUser = new Map<any, any>(people.map(p => [p.username, p]));
  fs.mkdirSync(dir, { recursive: true });
  const out: Record<string, any> = {};
  const staff = await store.listStaff();
  out['staff.csv'] = writeCsv(
    dir,
    'staff.csv',
    [
      'username',
      'employee_code',
      'old_employee_code',
      'name',
      'role',
      'type',
      'level',
      'contract_type',
      'nightPct',
      'idorm',
      'shiftCode',
      'startDate',
      'birthday',
      'leaveAdjust',
      'contract',
      'insured',
      'dependants',
      'jobTitle',
      'taxOn',
      'deductOn',
      'advanceOn',
      'locked',
      'lockedAt'
    ],
    staff.map(s => [
      s.username,
      byUser.get(s.username)?.employeeCode,
      byUser.get(s.username)?.oldEmployeeCode,
      s.name,
      s.role,
      s.type,
      s.level,
      byUser.get(s.username)?.contractType,
      s.nightPct,
      s.idorm ? 1 : 0,
      s.shiftCode,
      s.startDate,
      s.birthday,
      s.leaveAdjust,
      s.contract,
      s.insured ? 1 : 0,
      s.dependants,
      s.jobTitle,
      s.taxOn ? 1 : 0,
      s.deductOn ? 1 : 0,
      s.advanceOn ? 1 : 0,
      s.locked ? 1 : 0,
      s.lockedAt
    ])
  );
  const sheetRows: any[] = [],
    kpiRows: any[] = [];
  const KNOWN = ['kind', 'shift', 'in', 'out', 'extraKind', 'extraIn', 'extraOut', 'preset', 'breakMin'];
  for (const s of staff.filter(x => x.role !== 'admin'))
    for (const { month } of (await store.listSheets(s.username)).sort((a: any, b: any) =>
      a.month.localeCompare(b.month)
    )) {
      const sheet = await store.getSheet(s.username, month);
      for (const [date, d] of Object.entries<any>(sheet.days).sort(([a]: any, [b]: any) => a.localeCompare(b))) {
        const rest = Object.fromEntries(Object.entries<any>(d).filter(([k]: any) => !KNOWN.includes(k)));
        sheetRows.push([
          s.username,
          month,
          date,
          d.kind ?? '',
          d.shift,
          d.in,
          d.out,
          d.extraKind,
          d.extraIn,
          d.extraOut,
          d.preset,
          d.breakMin,
          Object.keys(rest).length ? rest : ''
        ]);
      }
      kpiRows.push([s.username, month, sheet.kpiPct, sheet.kpiAmt, sheet.kpiAdmPct, sheet.kpiAdmAmt]);
    }
  out['sheets.csv'] = writeCsv(
    dir,
    'sheets.csv',
    [
      'username',
      'month',
      'date',
      'kind',
      'shift',
      'in',
      'out',
      'extraKind',
      'extraIn',
      'extraOut',
      'preset',
      'breakMin',
      'otherFields'
    ],
    sheetRows
  );
  out['kpi_legacy.csv'] = writeCsv(
    dir,
    'kpi_legacy.csv',
    ['username', 'month', 'selfPct', 'selfAmt', 'adminPct', 'adminAmt'],
    kpiRows
  );
  out['approvals.csv'] = writeCsv(
    dir,
    'approvals.csv',
    ['username', 'date', 'item', 'fingerprint', 'status', 'rev', 'submittedAt', 'decidedBy', 'decidedAt', 'note'],
    (await store.approvals.list({ status: 'all' })).map(a => [
      a.username,
      a.date,
      a.item,
      a.fingerprint,
      a.status,
      a.rev,
      a.submittedAt,
      a.decidedBy,
      a.decidedAt,
      a.note
    ])
  );
  out['sessions.csv'] = writeCsv(
    dir,
    'sessions.csv',
    [
      'id',
      'username',
      'date',
      'state',
      'kind',
      'reason',
      'shiftCode',
      'presIn',
      'presOut',
      'src',
      'outsideShift',
      'version'
    ],
    (await store.listSessions()).map(s => [
      s.id,
      s.username,
      s.date,
      s.state,
      s.entry.kind,
      s.entry.reason,
      s.entry.plannedShift && s.entry.plannedShift.code,
      s.entry.presIn,
      s.entry.presOut,
      s.entry.src,
      s.entry.outsideShift ? 1 : 0,
      s.version
    ])
  );
  out['kpi_scores.csv'] = writeCsv(
    dir,
    'kpi_scores.csv',
    ['username', 'month', 'wework', 'user', 'peer', 'manager', 'self', 'complete', 'updatedBy', 'updatedAt'],
    [...new Set<any>(['2026-10', '2026-11'])].flatMap(month =>
      store
        .listKpiScores(month)
        .map(r => [
          r.username,
          r.month,
          ...['wework', 'user', 'peer', 'manager', 'self'].map(k => (r.scores[k] == null ? '' : r.scores[k] / 100)),
          r.complete ? 1 : 0,
          r.updatedBy,
          r.updatedAt
        ])
    )
  );
  out['corrections.csv'] = writeCsv(
    dir,
    'corrections.csv',
    ['id', 'username', 'date', 'reqIn', 'reqOut', 'reason', 'status', 'decidedBy', 'decidedAt', 'sessionId'],
    (await store.listCorrections()).map(c => [
      c.id,
      c.username,
      c.date,
      c.req_in,
      c.req_out,
      c.reason,
      c.status,
      c.decided_by,
      c.decided_at,
      c.session_id
    ])
  );
  const slips: any[] = [];
  for (const s of staff.filter(x => x.role !== 'admin'))
    for (const month of ['2026-09', '2026-10', '2026-11']) {
      const o = await store.getSlipOverride(s.username, month);
      if (Object.keys(o.values).length) slips.push([s.username, month, o.values, o.updatedBy, o.updatedAt]);
    }
  out['slip_overrides.csv'] = writeCsv(
    dir,
    'slip_overrides.csv',
    ['username', 'month', 'values', 'updatedBy', 'updatedAt'],
    slips
  );
  out['settings.csv'] = writeCsv(
    dir,
    'settings.csv',
    ['key', 'value_json'],
    store.db
      .prepare('SELECT key, value_json FROM settings ORDER BY key')
      .all()
      .map(r => [r.key, r.value_json])
  );
  out['scenarios.csv'] = writeCsv(
    dir,
    'scenarios.csv',
    [
      'username',
      'covers',
      'expect',
      'unreasonable',
      'group',
      'employee_code',
      'old_employee_code',
      'contract_type',
      'name',
      'type',
      'level',
      'aiMustFlag',
      'aiMustNotFlag'
    ],
    personas.map(p => [
      p.username,
      p.covers.join(' '),
      p.expect,
      p.unreasonable ? 'có' : 'không',
      p.group,
      p.employeeCode,
      p.oldEmployeeCode,
      p.contractType,
      p.name,
      p.type,
      p.level,
      ((p.ai && p.ai.fire) || []).map(i => (typeof i === 'string' ? i : `${i.rule}@${i.date}`)).join(' '),
      ((p.ai && p.ai.miss) || []).map(i => (typeof i === 'string' ? i : `${i.rule}@${i.date}`)).join(' ')
    ])
  );
  const coverMap = new Map<any, any>();
  for (const p of personas) for (const id of p.covers) coverMap.set(id, [...(coverMap.get(id) || []), p.username]);
  out['cases.csv'] = writeCsv(
    dir,
    'cases.csv',
    ['id', 'title', 'personas'],
    S.CASES.map(([id, title]: any) => [id, title, (coverMap.get(id) || []).join(' ')])
  );
  return out;
}

module.exports = { exportAll };
