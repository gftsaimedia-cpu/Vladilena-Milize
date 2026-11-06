import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { Client } from 'pg';
import { createKysely, createPgPool } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { hashPassword } from '../../src/modules/employees/employees.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';

// Cần PostgreSQL thật (PG_TEST_URL, vai trò được CREATE/DROP DATABASE): DB tạm, máy chủ HTTP thật cổng ngẫu nhiên.
const CONTROL_URL = process.env.PG_TEST_URL;
const SCHEMA = join(__dirname, '..', '..', 'migrations', 'postgres', 'schema.sql');
const PASS = 'Matkhau@123';
const ADMIN = '00000000-0000-4000-8000-000000000001';
const NV1 = '11111111-1111-4111-8111-111111111111';
const NV2 = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-20T05:00:00Z');
const FIXTURES = join(__dirname, '..', '..', 'web', 'tests', 'fixtures', 'api');

// Phản hồi thật làm mẫu cho test hợp đồng ở FE: so với file đã commit; UPDATE_FIXTURES=1 thì ghi lại.
// Id đơn do DB sinh (uuid ngẫu nhiên) được chuẩn hoá; đồng hồ cố định nên mọi giá trị khác ổn định.
function checkFixture(name: string, body: unknown) {
  const text =
    JSON.stringify(body, null, 2).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '00000000-0000-4000-8000-0000000000aa') +
    '\n';
  const file = join(FIXTURES, `${name}.json`);
  if (process.env.UPDATE_FIXTURES === '1') {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(file, text);
    return;
  }
  assert.ok(existsSync(file), `thiếu ${file}; chạy lại với UPDATE_FIXTURES=1`);
  assert.deepEqual(JSON.parse(text), JSON.parse(readFileSync(file, 'utf8')), `${name}.json lệch phản hồi thật (UPDATE_FIXTURES=1 để ghi lại)`);
}

test('API Admin: chấm công tuần, chi tiết nhân sự, tổng quan', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }
  const dbName = `overview_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;
  const control = new Client({ connectionString: CONTROL_URL });
  await control.connect();
  await control.query(`CREATE DATABASE ${dbName}`);

  let server: any;
  let db: ReturnType<typeof createKysely> | undefined;
  try {
    const client = new Client({ connectionString: tempUrl.toString() });
    await client.connect();
    await client.query(readFileSync(SCHEMA, 'utf8'));
    for (const [username, name, role, uuid, start] of [
      ['admin', 'Quản trị', 'admin', ADMIN, '2026-01-01'],
      ['nv1', 'Nguyễn Văn Một', 'staff', NV1, '2026-01-05'],
      ['nv2', 'Trần Thị Hai', 'staff', NV2, '2026-01-05']
    ]) {
      await client.query(
        `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date)
         VALUES ($1, $2, $3, 'nv', 1, $4, $5, $6, $7)`,
        [username, name, role, hashPassword(PASS), new Date().toISOString(), uuid, start]
      );
    }
    // Chấm công 05–19/10/2026 (thứ Hai–thứ Bảy), vào 08:00 ra 17:00 giờ VN (đúng giờ), trừ các ngày thiếu / trễ dưới đây.
    const SKIP: Record<string, string[]> = {
      [NV1]: ['2026-10-13', '2026-10-15'],
      [NV2]: ['2026-10-15', '2026-10-16'],
      [ADMIN]: []
    };
    const LATE_IN: Record<string, string> = { [`${NV2}|2026-10-13`]: '01:40:00' }; // vào 08:40
    const WORKDAYS: string[] = [];
    for (let d = new Date('2026-10-05T00:00:00Z'); d <= new Date('2026-10-19T00:00:00Z'); d = new Date(d.getTime() + 86400000)) {
      if (d.getUTCDay() !== 0) WORKDAYS.push(d.toISOString().slice(0, 10));
    }
    const punch = (emp: string, day: string, type: 'IN' | 'OUT', time: string) =>
      client.query(
        `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
           accuracy_meters, distance_meters, is_within_office, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
        [emp, `${day}T${time}Z`, day, type]
      );
    for (const emp of [NV1, NV2, ADMIN]) {
      for (const day of WORKDAYS) {
        if (SKIP[emp].includes(day)) continue;
        await punch(emp, day, 'IN', LATE_IN[`${emp}|${day}`] ?? '01:00:00');
        await punch(emp, day, 'OUT', '10:00:00');
      }
    }
    // nv1 hôm nay (thứ Ba 20/10) vào 08:05 chưa ra: đang làm.
    await client.query(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
         accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES (gen_random_uuid(), $1, '2026-10-20T01:05:00Z', '2026-10-20', 'IN', 0, 0, 1, 1, true, now())`,
      [NV1]
    );
    // nv2 có đơn nghỉ chờ duyệt 15–16/10 và một dòng nhật ký trong tháng 10 của nv1.
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, type, reason, status, leave_type, leave_start_date,
         leave_end_date, leave_days_count, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Nghỉ', 'LEAVE', 'việc riêng', 'PENDING', 'ANNUAL', '2026-10-15', '2026-10-16', 2, '2026-10-13T02:00:00Z', '2026-10-13T02:00:00Z')`,
      [NV2]
    );
    await client.query(
      `INSERT INTO audit_log (at, actor, action, entity_kind, entity_id, subject, month, reason, prev_hash, hash)
       VALUES ('2026-10-20T01:00:00.000Z', 'admin', 'attendance.recalculate', 'timesheet', '2026-10-14', 'nv1', '2026-10', 'sửa giờ', 'p', 'h')`
    );
    // Phiếu lương tháng 10: hai phiếu, lớn nhất là nv2.
    await client.query(
      `INSERT INTO payroll_periods (month, status) VALUES ('2026-10', 'calculated')`
    );
    await client.query(
      `INSERT INTO payroll_runs (id, month, run_no, status, engine_version, params_hash, params_rev, params_json, switches_json, created_by, created_at)
       VALUES (1, '2026-10', 1, 'draft', 'x', 'x', 1, '{}', '{}', 'admin', '2026-10-31T00:00:00Z')`
    );
    for (const [username, net] of [['nv1', 7000000], ['nv2', 9000000]] as const) {
      await client.query(
        `INSERT INTO payslips (run_id, username, status, gross, insurance, tax, advance, net, staff_terms_json, snapshot_gz)
         VALUES (1, $1, 'draft', $2, 0, 0, 0, $2, '{}', $3)`,
        [username, net, gzipSync(Buffer.from('{}'))]
      );
    }
    await client.end();

    db = createKysely(createPgPool(tempUrl.toString()));
    const days = new AttendanceDaysService(
      new AttendanceDaysRepository(db),
      new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
      new TransactionCoordinator(db)
    );
    for (const emp of [NV1, NV2, ADMIN]) {
      await days.refreshDays(emp, [...WORKDAYS, '2026-10-20'], { now: NOW });
    }

    // Đồng hồ cố định: "hôm nay" của mọi service là 20/10/2026 (thứ Ba) 12:00 giờ Việt Nam.
    mock.timers.enable({ apis: ['Date'], now: NOW });
    process.env.DATABASE_URL = tempUrl.toString();
    const { createServer } = require('../../src/bootstrap');
    server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const loginAs = async (username: string) => {
      const res = await fetch(base + '/api/v2/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password: PASS })
      });
      assert.equal(res.status, 201);
      return String(res.headers.get('set-cookie')).split(';')[0];
    };
    const admin = await loginAs('admin');
    const staff = await loginAs('nv1');
    const get = async (path: string, cookie = admin) => {
      const res = await fetch(base + path, { headers: { cookie } });
      return { status: res.status, body: (await res.json()) as any };
    };

    // ---- Tuần ----
    const week = await get('/api/v2/attendance/week?from=2026-10-14');
    assert.equal(week.status, 200);
    assert.deepEqual(week.body.days.map((d: any) => d.iso), [
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'
    ]);
    assert.deepEqual(week.body.days[0], { iso: '2026-10-12', dow: 'T2', dm: '12/10', scheduled: true, today: false, monday: true, periodStart: false });
    assert.equal(week.body.days[6].scheduled, false); // Chủ nhật
    assert.equal(week.body.today, '2026-10-20');
    assert.equal(week.body.month, '2026-10');
    assert.equal(week.body.subtitle, 'Kỳ công 01–31/10/2026 · hôm nay Thứ Ba 20/10');
    const row1 = week.body.rows.find((r: any) => r.username === 'nv1');
    assert.equal(row1.name, 'Nguyễn Văn Một');
    assert.equal(row1.initials, 'VM');
    assert.equal(row1.group, 'nv');
    assert.equal(row1.shiftText, 'HC 08:00–17:00');
    assert.equal(row1.days.length, 7);
    assert.equal(row1.days[2].kind, 'work');
    assert.deepEqual([row1.days[2].in, row1.days[2].out, row1.days[2].text], ['08:00', '17:00', '08:00–17:00']);
    assert.equal(row1.days[2].label, 'Đi làm');
    assert.deepEqual([row1.days[3].kind, row1.days[3].base, row1.days[3].itemId], ['todo', 'absent', `due:${NV1}:2026-10-15`]); // vắng chưa giải trình
    assert.equal(row1.days[3].text, '—');
    assert.equal(row1.days[6].kind, 'off'); // Chủ nhật
    assert.equal(row1.days[6].text, '');
    // Tổng cột Công / Trễ / OT của tháng 10: nv1 có 11 ngày công (05–10, 12, 14, 16, 17, 19/10).
    assert.deepEqual(row1.totals, { workDays: 11, lateMinutes: 0, otHours: 0 });
    assert.equal(row1.needsAction, 2); // vắng 13/10 và 15/10 chưa giải trình
    // Đơn nghỉ chờ duyệt của nv2 phủ 15–16/10 thành "cần xử lý".
    const row2 = week.body.rows.find((r: any) => r.username === 'nv2');
    assert.deepEqual([row2.days[3].kind, row2.days[3].base, row2.days[4].kind], ['todo', 'absent', 'todo']);
    assert.ok(row2.days[3].itemId && !row2.days[3].itemId.startsWith('due:')); // đơn nghỉ phủ lên ô vắng
    assert.equal(row2.days[4].itemId, row2.days[3].itemId); // đơn nghỉ phủ cả 15 và 16/10
    assert.equal(row2.days[1].base, 'todo'); // 13/10 vào muộn 40 phút, chưa giải trình
    assert.deepEqual(row2.totals, { workDays: 10, lateMinutes: 40, otHours: 0 });
    assert.equal(row2.needsAction, 3);
    const decide = week.body.pending.filter((p: any) => p.action === 'decide');
    assert.equal(week.body.pending.length, 6);
    assert.deepEqual(week.body.pending.map((p: any) => [p.username, p.date, p.action]), [
      ['nv1', '2026-10-13', 'remind'], ['nv2', '2026-10-13', 'remind'], ['nv1', '2026-10-15', 'remind'],
      ['nv2', '2026-10-15', 'decide'], ['nv2', '2026-10-15', 'remind'], ['nv2', '2026-10-16', 'remind']
    ]);
    assert.deepEqual(
      { ...decide[0], id: undefined },
      { id: undefined, kind: 'leave', group: 'leave', groupLabel: 'Đơn nghỉ', action: 'decide', username: 'nv2', name: 'Trần Thị Hai',
        initials: 'TH', title: null, what: 'Nghỉ phép', when: '15/10–16/10', days: ['2026-10-15', '2026-10-16'], age: '7 ngày', date: '2026-10-15' }
    );
    assert.equal(week.body.total, 3);
    assert.equal(week.body.matched, 3);
    assert.deepEqual(week.body.groups, [{ key: 'nv', count: 3 }]);
    // Thẻ số (hôm nay 20/10 nằm ngoài tuần 12–18 nên thẻ "hôm nay" là 0; tháng 10 vẫn tính).
    assert.equal(week.body.tiles[0].note, '5 chưa giải trình · 1 yêu cầu chờ duyệt');
    assert.deepEqual(week.body.tiles.map((t: any) => [t.key, t.value]), [
      ['todo', 6], ['present', 0], ['late', 0], ['leave', 0], ['absent', 4], ['ot', 0]
    ]);

    // Lưới 4 tuần (không from): tuần cách hôm nay 14 ngày, hôm nay ở tuần thứ ba; hôm nay là "chưa chấm vào", không phải vắng.
    const grid = await get('/api/v2/attendance/week?days=28');
    assert.equal(grid.body.days.length, 28);
    assert.equal(grid.body.days[0].iso, '2026-10-05');
    assert.equal(grid.body.days[15].today, true);
    const g1 = grid.body.rows.find((r: any) => r.username === 'nv1');
    const g2 = grid.body.rows.find((r: any) => r.username === 'nv2');
    assert.equal(g1.days[15].kind, 'work');
    assert.equal(g1.days[15].live, true);
    assert.equal(g1.days[15].text, '08:05–…');
    assert.equal(g2.days[15].kind, 'nocheck');
    assert.equal(g2.days[15].text, 'HC 08:00–17:00');
    assert.equal(g2.days[16].kind, 'fu'); // 21/10 sắp tới
    assert.equal(grid.body.tiles[1].value, 1); // có mặt hôm nay
    assert.equal(grid.body.tiles[1].of, 3);
    assert.equal(grid.body.tiles[1].note, '2 người chưa Check-in');

    const filtered = await get('/api/v2/attendance/week?from=2026-10-14&q=tran');
    assert.deepEqual(filtered.body.rows.map((r: any) => r.username), ['nv2']);
    assert.equal(filtered.body.total, 3);
    assert.equal(filtered.body.matched, 1);
    assert.equal(filtered.body.pending.length, 4); // chỉ việc của nv2
    assert.deepEqual((await get('/api/v2/attendance/week?from=2026-10-14&q=quan')).body.pending, []);
    const none = await get('/api/v2/attendance/week?from=2026-10-14&group=zzz');
    assert.deepEqual(none.body.rows, []);
    assert.equal((await get('/api/v2/attendance/week?from=2026-02-30')).status, 400);
    assert.equal((await get('/api/v2/attendance/week?days=36')).status, 400);
    assert.equal((await get('/api/v2/attendance/week?days=0')).status, 400);
    checkFixture('attendance-week', grid.body);

    // ---- Chi tiết một người ----
    const one = await get('/api/v2/attendance/employees/nv1?month=2026-10');
    assert.equal(one.status, 200);
    assert.equal(one.body.person.username, 'nv1');
    assert.equal(one.body.person.shiftText, 'HC 08:00–17:00');
    assert.equal(one.body.days.length, 31);
    assert.equal(one.body.days[13].kind, 'work');
    assert.equal(one.body.days[19].live, true);
    assert.equal(one.body.days[20].kind, 'fu');
    assert.equal(one.body.days[4].dow, 'T2'); // 05/10
    assert.equal(one.body.days[4].day, '5');
    assert.equal(one.body.days[3].kind, 'off'); // 04/10 là Chủ nhật
    assert.equal(one.body.totals.workDays, 11);
    assert.equal(one.body.totals.standardDays, 26);
    assert.equal(one.body.totals.lateMinutes, 0);
    assert.equal(one.body.locked, true); // kỳ 2026-10 đã tính lương (calculated)
    assert.equal(one.body.periodState, 'locked');
    // Người trước / sau theo tên: nv1 "Nguyễn Văn Một" < admin "Quản trị" < nv2 "Trần Thị Hai".
    assert.deepEqual([one.body.index, one.body.total, one.body.prev, one.body.next], [1, 3, null, 'admin']);
    assert.deepEqual([one.body.pending.count, one.body.pending.date, one.body.pending.text], [5, '2026-10-01', 'Quên chấm công · 01/10']); // 01–03, 13, 15/10
    assert.deepEqual(one.body.stats.map((t: any) => [t.key, t.value]), [['workDays', 11], ['late', 0], ['ot', 0], ['leave', one.body.person.leaveLeftDays]]);
    assert.deepEqual(one.body.chips, { work: 12, late: 0, leave: 0, absent: 0, todo: 5 }); // 11 ngày + hôm nay đang làm; 5 ngày vắng chờ giải trình
    assert.equal(one.body.dayHistory[0].date, '2026-10-20');
    assert.ok(one.body.dayHistory.every((d: any) => d.date <= '2026-10-20' && d.kind !== 'off'));
    assert.deepEqual(one.body.history, [{ at: '2026-10-20T01:00:00.000Z', actor: 'admin', text: 'attendance.recalculate: sửa giờ' }]);
    const two = await get('/api/v2/attendance/employees/nv2?month=2026-10');
    assert.deepEqual(two.body.pending && [two.body.pending.count, two.body.pending.date], [7, '2026-10-01']); // 01–03, 13, 15, 16 + đơn nghỉ
    assert.equal(two.body.next, null);
    assert.equal(two.body.prev, 'admin');
    assert.equal((await get('/api/v2/attendance/employees/khong-co?month=2026-10')).status, 404);
    assert.equal((await get('/api/v2/attendance/employees/nv1?month=2026-13')).status, 400);
    checkFixture('attendance-employee', one.body);

    // ---- Tổng quan ----
    const ov = await get('/api/v2/overview?month=2026-10');
    assert.equal(ov.status, 200);
    assert.equal(ov.body.today, '2026-10-20');
    assert.equal(ov.body.kpis.headcount, 3);
    assert.equal(ov.body.kpis.pendingRequests, 1);
    assert.equal(ov.body.kpis.payrollNet, 16000000);
    assert.equal(ov.body.kpis.payrollGross, 16000000);
    // nv1 đã chấm vào 08:05 nên có mặt; admin và nv2 chưa chấm vào (nocheck, không phải vắng).
    assert.equal(ov.body.kpis.presentToday, 1);
    assert.equal(ov.body.kpis.notCheckedIn, 2);
    assert.equal(ov.body.attendance.notCheckedIn, 2);
    assert.equal(ov.body.attendance.present, 1);
    assert.equal(ov.body.attendance.total, 3);
    assert.equal(ov.body.attendance.todayRate, 33);
    const counts = ov.body.attendance.today;
    assert.equal(Object.values<number>(counts).reduce((a, b) => a + b, 0) + ov.body.attendance.notCheckedIn, 3);
    assert.equal(counts.absent, 0);
    // Sáu ngày làm gần nhất tới 20/10, bỏ Chủ nhật 18/10.
    assert.deepEqual(ov.body.attendance.days.map((d: any) => d.date), ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20']);
    assert.deepEqual(ov.body.attendance.days[0], { date: '2026-10-14', dow: 'T4', dm: '14/10', today: false, present: 3, total: 3, rate: 100 });
    assert.deepEqual([ov.body.attendance.days[5].dow, ov.body.attendance.days[5].today, ov.body.attendance.days[5].present], ['Hôm nay', true, 1]);
    // 15/10: chỉ admin chấm; 16/10: nv1 và admin.
    assert.deepEqual(ov.body.attendance.days.map((d: any) => d.present), [3, 1, 2, 3, 3, 1]);
    assert.equal(ov.body.payroll.status, 'calculated');
    assert.deepEqual(ov.body.payroll.lines.map((l: any) => [l.username, l.name, l.net]), [
      ['nv2', 'Trần Thị Hai', 9000000],
      ['nv1', 'Nguyễn Văn Một', 7000000]
    ]);
    assert.deepEqual(ov.body.payroll.rows.map((r: any) => [r.username, r.net, r.status]), [
      ['nv1', 7000000, 'draft'],
      ['nv2', 9000000, 'draft']
    ]);
    assert.deepEqual(
      [ov.body.payroll.total, ov.body.payroll.gross, ov.body.payroll.deductions, ov.body.payroll.net, ov.body.payroll.netShare, ov.body.payroll.updatedAt],
      [2, 16000000, 0, 16000000, 100, '12:00']
    );
    assert.deepEqual(ov.body.payroll.counts, { all: 2, done: 0, pending: 0, draft: 2, rejected: 0 });
    assert.equal(ov.body.payroll.previous, null);
    assert.deepEqual(ov.body.period, {
      month: '2026-10', state: 'calculated', label: 'Chờ duyệt', from: '2026-10-01', to: '2026-10-31', closeOn: '2026-10-31', payday: '2026-11-10', daysLeft: 11
    });
    assert.deepEqual(ov.body.headline, { blocking: ov.body.approvals.total, closeOn: '2026-10-31', daysLeft: 11 });
    assert.equal(ov.body.approvals.decide, 1);
    assert.equal(ov.body.approvals.total, ov.body.approvals.decide + ov.body.approvals.remind);
    assert.equal(ov.body.approvals.items.length, Math.min(8, ov.body.approvals.total));
    assert.deepEqual(ov.body.approvals.groups.find((g: any) => g.key === 'leave'), { key: 'leave', label: 'Đơn nghỉ', count: 1 });
    assert.equal((await get('/api/v2/overview?month=abc')).status, 400);
    assert.equal((await get('/api/v2/overview?days=99')).status, 400);
    assert.equal((await get('/api/v2/overview?days=2')).body.attendance.days.length, 2);
    checkFixture('overview', ov.body);

    // ---- Quyền ----
    for (const path of ['/api/v2/attendance/week', '/api/v2/attendance/employees/nv1', '/api/v2/overview']) {
      assert.equal((await get(path, staff)).status, 403, path);
    }
  } finally {
    mock.timers.reset();
    if (server) await new Promise(resolve => server.close(resolve));
    await db?.destroy();
    await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await control.end();
  }
});
