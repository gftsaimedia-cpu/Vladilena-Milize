import { Client } from 'pg';
import { PostgresDatabase } from '../../src/data/postgres-database';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REAL_DB_URL = process.env.DATABASE_URL || 'postgres://luong:1FC62A1EB342AED2682F9F844F4B0CB4C8DA1791401E1816D2FEBED157037AF9@127.0.0.1:5432/luong_local';

const STAFF_DATA = [
  {
    username: 'admin',
    family_name: '',
    given_name: 'Admin',
    name: 'Admin',
    birthday: null,
    dependants: 0,
    role: 'admin',
    type: 'tts',
    level: 0,
    job_title: 'Quản trị hệ thống',
    shift_type: 'NORMAL',
    shift_start_time: '08:00',
    shift_end_time: '17:00',
    shift_allowance_pct: 0,
    leave_total_days: 0,
    leave_used_days: 0,
    leave_balance: null,
    leave_balance_on: null,
    contract_status: null,
    start_date: null,
    contract: null,
    resigned_on: null,
    insured: null,
    deduct_on: null,
    tax_on: null,
    advance_on: null,
    idorm: 0,
    payroll_subject: 0,
    uuid: '5b3d5d2e-8279-4fc8-a0a5-49fa03878c65',
    pass_hash: 'scrypt$2612a16968b18b4de56fa8e10f142b51$74a7c3e95649ee888a3fa6c69c2de44411f78694dba858b35b44a1cc7b82d4b677dc916073b2886d709e11dfc7471ec504cfe87b07ad45bd44edf93e0637a2bd',
    created_at: '2026-11-02T05:26:46.508Z',
    session_version: 0
  },
  {
    username: 'le-thanh-thao',
    family_name: 'Lê Thanh',
    given_name: 'Thảo',
    name: 'Lê Thanh Thảo',
    birthday: '2000-04-12',
    dependants: 0,
    role: 'staff',
    type: 'ctv',
    level: 2,
    job_title: 'Chuyên trách viên QC',
    shift_type: 'FLEX',
    shift_start_time: '06:00',
    shift_end_time: '15:00',
    shift_allowance_pct: 10,
    leave_total_days: 6,
    leave_used_days: 1,
    leave_balance: 2,
    leave_balance_on: '2026-11-03',
    contract_status: null,
    start_date: '2026-09-01',
    contract: null,
    resigned_on: null,
    insured: 0,
    deduct_on: 0,
    tax_on: 1,
    advance_on: 1,
    idorm: 0,
    payroll_subject: 1,
    uuid: '2ab6d127-dd19-4cdf-b53c-39335f144d1b',
    pass_hash: 'scrypt$e42fa55daaef16164c5e1b5281d5c2f9$84dab311640f5f771e14882a6cb13a24dda716bf712b62a486f2f46f1aa9650b97fde2cfbfeb3102ed8c18b1df643f8098aab8681dea6f8586a3d4b416ba94a3',
    created_at: '2026-11-03T09:02:42.069Z',
    session_version: 0
  },
  {
    username: 'nguyen-hoang-nam',
    family_name: 'Nguyễn Hoàng',
    given_name: 'Nam',
    name: 'Nguyễn Hoàng Nam',
    birthday: '1997-08-15',
    dependants: 1,
    role: 'staff',
    type: 'nv',
    level: 2,
    job_title: 'Kỹ sư Backend',
    shift_type: 'NORMAL',
    shift_start_time: '08:00',
    shift_end_time: '17:00',
    shift_allowance_pct: 0,
    leave_total_days: 12,
    leave_used_days: 2.5,
    leave_balance: 12,
    leave_balance_on: '2026-11-03',
    contract_status: 'official',
    start_date: '2025-03-01',
    contract: null,
    resigned_on: null,
    insured: 1,
    deduct_on: 1,
    tax_on: 1,
    advance_on: 1,
    idorm: 0,
    payroll_subject: 1,
    uuid: '77115f43-caa3-4a28-b5b6-588ace7af91d',
    pass_hash: 'scrypt$e42fa55daaef16164c5e1b5281d5c2f9$84dab311640f5f771e14882a6cb13a24dda716bf712b62a486f2f46f1aa9650b97fde2cfbfeb3102ed8c18b1df643f8098aab8681dea6f8586a3d4b416ba94a3',
    created_at: '2026-11-03T09:02:42.042Z',
    session_version: 0
  },
  {
    username: 'pham-duc-anh',
    family_name: 'Phạm Đức',
    given_name: 'Anh',
    name: 'Phạm Đức Anh',
    birthday: '2003-01-25',
    dependants: 0,
    role: 'staff',
    type: 'tts',
    level: 1,
    job_title: 'Thực tập sinh Dữ liệu',
    shift_type: 'NORMAL',
    shift_start_time: '10:00',
    shift_end_time: '19:00',
    shift_allowance_pct: 0,
    leave_total_days: 0,
    leave_used_days: 0,
    leave_balance: null,
    leave_balance_on: null,
    contract_status: null,
    start_date: '2026-10-01',
    contract: null,
    resigned_on: null,
    insured: 0,
    deduct_on: 0,
    tax_on: 0,
    advance_on: 1,
    idorm: 0,
    payroll_subject: 1,
    uuid: '7d2b9261-12bd-4d02-bbfd-b7600432e824',
    pass_hash: 'scrypt$e42fa55daaef16164c5e1b5281d5c2f9$84dab311640f5f771e14882a6cb13a24dda716bf712b62a486f2f46f1aa9650b97fde2cfbfeb3102ed8c18b1df643f8098aab8681dea6f8586a3d4b416ba94a3',
    created_at: '2026-11-03T09:02:42.074Z',
    session_version: 0
  },
  {
    username: 'tran-minh-ngoc',
    family_name: 'Trần Minh',
    given_name: 'Ngọc',
    name: 'Trần Minh Ngọc',
    birthday: '1996-11-20',
    dependants: 2,
    role: 'manager',
    type: 'ql',
    level: 3,
    job_title: 'Trưởng ca Vận hành Đêm',
    shift_type: 'NIGHT',
    shift_start_time: '21:00',
    shift_end_time: '06:00',
    shift_allowance_pct: 40,
    leave_total_days: 14,
    leave_used_days: 4,
    leave_balance: null,
    leave_balance_on: null,
    contract_status: 'official',
    start_date: '2024-06-10',
    contract: null,
    resigned_on: null,
    insured: 1,
    deduct_on: 1,
    tax_on: 1,
    advance_on: 1,
    idorm: 1,
    payroll_subject: 1,
    uuid: '11199c8d-b5bf-4b26-b2e7-ffaf0f6868a6',
    pass_hash: 'scrypt$e42fa55daaef16164c5e1b5281d5c2f9$84dab311640f5f771e14882a6cb13a24dda716bf712b62a486f2f46f1aa9650b97fde2cfbfeb3102ed8c18b1df643f8098aab8681dea6f8586a3d4b416ba94a3',
    created_at: '2026-11-03T09:02:42.055Z',
    session_version: 0
  },
  {
    username: 'vu-thi-mai-huong',
    family_name: 'Vũ Thị Mai',
    given_name: 'Hương',
    name: 'Vũ Thị Mai Hương',
    birthday: '1999-12-05',
    dependants: 0,
    role: 'hr',
    type: 'nv',
    level: 1,
    job_title: 'Chuyên viên Nhân sự (HR)',
    shift_type: 'FLEX',
    shift_start_time: '13:00',
    shift_end_time: '22:00',
    shift_allowance_pct: 10,
    leave_total_days: 12,
    leave_used_days: 0,
    leave_balance: 0,
    leave_balance_on: '2026-11-03',
    contract_status: 'probation',
    start_date: '2026-10-15',
    contract: null,
    resigned_on: null,
    insured: 1,
    deduct_on: 0,
    tax_on: 1,
    advance_on: 1,
    idorm: 0,
    payroll_subject: 1,
    uuid: '565fba65-0624-4d61-9736-c76a92c2ab60',
    pass_hash: 'scrypt$e42fa55daaef16164c5e1b5281d5c2f9$84dab311640f5f771e14882a6cb13a24dda716bf712b62a486f2f46f1aa9650b97fde2cfbfeb3102ed8c18b1df643f8098aab8681dea6f8586a3d4b416ba94a3',
    created_at: '2026-11-03T09:02:42.080Z',
    session_version: 0
  }
];

const ROLES_DATA = [
  { username: 'tran-minh-ngoc', role: 'staff', granted_by: 'system', granted_at: '2026-11-03T09:02:42.063Z' },
  { username: 'vu-thi-mai-huong', role: 'staff', granted_by: 'system', granted_at: '2026-11-03T09:02:42.084Z' }
];

async function seedDataToDb(queryFn: (sql: string, params?: any[]) => Promise<any>) {
  // 1. Seed Staff
  for (const s of STAFF_DATA) {
    await queryFn(`
      INSERT INTO staff (
        username, family_name, given_name, name, birthday, dependants,
        role, type, level, job_title, shift_type, shift_start_time, shift_end_time,
        shift_allowance_pct, leave_total_days, leave_used_days, leave_balance,
        leave_balance_on, contract_status, start_date, contract, resigned_on,
        insured, deduct_on, tax_on, advance_on, idorm, payroll_subject,
        uuid, pass_hash, created_at, session_version
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32
      )
    `, [
      s.username, s.family_name, s.given_name, s.name, s.birthday, s.dependants,
      s.role, s.type, s.level, s.job_title, s.shift_type, s.shift_start_time, s.shift_end_time,
      s.shift_allowance_pct, s.leave_total_days, s.leave_used_days, s.leave_balance,
      s.leave_balance_on, s.contract_status, s.start_date, s.contract, s.resigned_on,
      s.insured, s.deduct_on, s.tax_on, s.advance_on, s.idorm, s.payroll_subject,
      s.uuid, s.pass_hash, s.created_at, s.session_version
    ]);
  }

  // 2. Seed Roles
  for (const r of ROLES_DATA) {
    await queryFn(`
      INSERT INTO staff_roles (username, role, granted_by, granted_at)
      VALUES ($1, $2, $3, $4)
    `, [r.username, r.role, r.granted_by, r.granted_at]);
  }

  const emp1 = STAFF_DATA.find(s => s.username === 'le-thanh-thao')!;
  const emp2 = STAFF_DATA.find(s => s.username === 'nguyen-hoang-nam')!;
  const emp3 = STAFF_DATA.find(s => s.username === 'tran-minh-ngoc')!;
  const emp4 = STAFF_DATA.find(s => s.username === 'pham-duc-anh')!;
  const admin = STAFF_DATA.find(s => s.username === 'admin')!;

  // 3. Seed Punch Events
  const punches = [
    {
      id: randomUUID(),
      employee_id: emp1.uuid,
      punched_at: '2026-11-03T05:55:12.000Z',
      work_date: '2026-11-03',
      type: 'IN',
      latitude: 10.77689,
      longitude: 106.70092,
      accuracy_meters: 8.5,
      distance_meters: 15.2,
      is_within_office: true,
      note: 'Chấm công vào đúng giờ ca Flex sáng tại sảnh văn phòng'
    },
    {
      id: randomUUID(),
      employee_id: emp1.uuid,
      punched_at: '2026-11-03T15:05:00.000Z',
      work_date: '2026-11-03',
      type: 'OUT',
      latitude: 10.77695,
      longitude: 106.70105,
      accuracy_meters: 9.1,
      distance_meters: 18.0,
      is_within_office: true,
      note: 'Chấm công kết thúc ca làm việc Flex'
    },
    {
      id: randomUUID(),
      employee_id: emp2.uuid,
      punched_at: '2026-11-03T08:24:10.000Z',
      work_date: '2026-11-03',
      type: 'IN',
      latitude: 10.77680,
      longitude: 106.70110,
      accuracy_meters: 12.0,
      distance_meters: 22.4,
      is_within_office: true,
      note: 'Đến muộn 24 phút do tắc đường cầu Sài Gòn'
    },
    {
      id: randomUUID(),
      employee_id: emp4.uuid,
      punched_at: '2026-11-03T08:02:00.000Z',
      work_date: '2026-11-03',
      type: 'IN',
      latitude: 10.82310,
      longitude: 106.62970,
      accuracy_meters: 25.0,
      distance_meters: 12450.0,
      is_within_office: false,
      note: 'Chấm công ngoài văn phòng (đi gặp khách hàng KCN Tân Bình)'
    }
  ];

  for (const p of punches) {
    await queryFn(`
      INSERT INTO punch_events (
        id, employee_id, punched_at, work_date, type, latitude, longitude,
        accuracy_meters, distance_meters, is_within_office, note, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    `, [
      p.id, p.employee_id, p.punched_at, p.work_date, p.type,
      p.latitude, p.longitude, p.accuracy_meters, p.distance_meters,
      p.is_within_office, p.note
    ]);
  }

  // 4. Seed Timesheet Entries
  const timesheets = [
    {
      id: randomUUID(),
      employee_id: emp1.uuid,
      work_date: '2026-11-03',
      shift_type: 'FLEX',
      shift_start_time: '06:00',
      shift_end_time: '15:00',
      shift_allowance_pct: 10,
      actual_check_in: '2026-11-03T05:55:12.000Z',
      actual_check_out: '2026-11-03T15:05:00.000Z',
      work_hours: 8.0,
      work_units: 1.0,
      ot_hours: 0.0,
      late_minutes: 0,
      early_minutes: 0,
      status: 'PRESENT',
      is_locked: false
    },
    {
      id: randomUUID(),
      employee_id: emp2.uuid,
      work_date: '2026-11-03',
      shift_type: 'NORMAL',
      shift_start_time: '08:00',
      shift_end_time: '17:00',
      shift_allowance_pct: 0,
      actual_check_in: '2026-11-03T08:24:10.000Z',
      actual_check_out: '2026-11-03T17:00:00.000Z',
      work_hours: 7.6,
      work_units: 1.0,
      ot_hours: 0.0,
      late_minutes: 24,
      early_minutes: 0,
      status: 'PRESENT',
      is_locked: false
    },
    {
      id: randomUUID(),
      employee_id: emp3.uuid,
      work_date: '2026-11-03',
      shift_type: 'NIGHT',
      shift_start_time: '21:00',
      shift_end_time: '06:00',
      shift_allowance_pct: 40,
      actual_check_in: null,
      actual_check_out: null,
      work_hours: 0.0,
      work_units: 0.0,
      ot_hours: 0.0,
      late_minutes: 0,
      early_minutes: 0,
      status: 'ON_LEAVE',
      is_locked: false
    }
  ];

  for (const t of timesheets) {
    await queryFn(`
      INSERT INTO timesheet_entries (
        id, employee_id, work_date, shift_type, shift_start_time, shift_end_time,
        shift_allowance_pct, actual_check_in, actual_check_out, work_hours,
        work_units, ot_hours, late_minutes, early_minutes, status, is_locked,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
    `, [
      t.id, t.employee_id, t.work_date, t.shift_type, t.shift_start_time,
      t.shift_end_time, t.shift_allowance_pct, t.actual_check_in,
      t.actual_check_out, t.work_hours, t.work_units, t.ot_hours,
      t.late_minutes, t.early_minutes, t.status, t.is_locked
    ]);
  }

  // 5. Seed System Requests
  const requests = [
    {
      id: randomUUID(),
      employee_id: emp3.uuid,
      title: 'Nghỉ phép năm giải quyết việc gia đình',
      type: 'LEAVE',
      reason: 'Về quê xử lý việc gia đình ở Đà Nẵng',
      status: 'APPROVED',
      reviewed_by: admin.uuid,
      reviewed_at: '2026-11-02T10:00:00.000Z',
      review_note: 'Đã duyệt nghỉ phép năm 2 ngày',
      leave_type: 'PAID',
      leave_start_date: '2026-11-03',
      leave_end_date: '2026-11-04',
      leave_days_count: 2.0,
      correction_date: null,
      correction_punch_type: null,
      correction_actual_time: null,
      ot_date: null,
      ot_start_time: null,
      ot_end_time: null,
      ot_hours: null,
      advance_amount: null,
      advance_period: null
    },
    {
      id: randomUUID(),
      employee_id: emp4.uuid,
      title: 'Giải trình chấm công ngoài văn phòng do gặp đối tác',
      type: 'TIME_CORRECTION',
      reason: 'Đi gặp khách hàng tại KCN Tân Bình lúc 8h sáng, GPS ngoài văn phòng',
      status: 'PENDING',
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      leave_type: null,
      leave_start_date: null,
      leave_end_date: null,
      leave_days_count: null,
      correction_date: '2026-11-03',
      correction_punch_type: 'IN',
      correction_actual_time: '08:00:00',
      ot_date: null,
      ot_start_time: null,
      ot_end_time: null,
      ot_hours: null,
      advance_amount: null,
      advance_period: null
    },
    {
      id: randomUUID(),
      employee_id: emp2.uuid,
      title: 'Đăng ký tăng ca hoàn thiện module tính lương',
      type: 'OVERTIME',
      reason: 'Trực ca tối kiểm thử hệ thống mới và tính thử kỳ lương',
      status: 'APPROVED',
      reviewed_by: admin.uuid,
      reviewed_at: '2026-11-02T16:30:00.000Z',
      review_note: 'Đã phê duyệt kế hoạch OT 3 giờ',
      leave_type: null,
      leave_start_date: null,
      leave_end_date: null,
      leave_days_count: null,
      correction_date: null,
      correction_punch_type: null,
      correction_actual_time: null,
      ot_date: '2026-11-03',
      ot_start_time: '18:00',
      ot_end_time: '21:00',
      ot_hours: 3.0,
      advance_amount: null,
      advance_period: null
    },
    {
      id: randomUUID(),
      employee_id: emp1.uuid,
      title: 'Đề nghị tạm ứng lương tháng 11/2026',
      type: 'ADVANCE',
      reason: 'Chi trả tiền viện phí điều trị cho người thân tại bệnh viện',
      status: 'PENDING',
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      leave_type: null,
      leave_start_date: null,
      leave_end_date: null,
      leave_days_count: null,
      correction_date: null,
      correction_punch_type: null,
      correction_actual_time: null,
      ot_date: null,
      ot_start_time: null,
      ot_end_time: null,
      ot_hours: null,
      advance_amount: 5000000,
      advance_period: '2026-11'
    }
  ];

  for (const r of requests) {
    await queryFn(`
      INSERT INTO system_requests (
        id, employee_id, title, type, reason, status, reviewed_by, reviewed_at,
        review_note, leave_type, leave_start_date, leave_end_date, leave_days_count,
        correction_date, correction_punch_type, correction_actual_time, ot_date,
        ot_start_time, ot_end_time, ot_hours, advance_amount, advance_period,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, NOW(), NOW()
      )
    `, [
      r.id, r.employee_id, r.title, r.type, r.reason, r.status, r.reviewed_by,
      r.reviewed_at, r.review_note, r.leave_type, r.leave_start_date,
      r.leave_end_date, r.leave_days_count, r.correction_date,
      r.correction_punch_type, r.correction_actual_time, r.ot_date,
      r.ot_start_time, r.ot_end_time, r.ot_hours, r.advance_amount,
      r.advance_period
    ]);
  }

  // 6. Seed Work Schedules
  const schedules = [
    {
      id: randomUUID(),
      employee_id: emp1.uuid,
      work_date: '2026-11-03',
      shift_type: 'FLEX',
      planned_start_time: '06:00:00',
      planned_end_time: '15:00:00',
      approved_ot_hours: 0,
      schedule_type: 'REGULAR',
      status: 'COMPLETED'
    },
    {
      id: randomUUID(),
      employee_id: emp2.uuid,
      work_date: '2026-11-03',
      shift_type: 'NORMAL',
      planned_start_time: '08:00:00',
      planned_end_time: '21:00:00',
      approved_ot_hours: 3.0,
      schedule_type: 'OVERTIME',
      status: 'COMPLETED'
    },
    {
      id: randomUUID(),
      employee_id: emp3.uuid,
      work_date: '2026-11-03',
      shift_type: 'NIGHT',
      planned_start_time: '21:00:00',
      planned_end_time: '06:00:00',
      approved_ot_hours: 0,
      schedule_type: 'REGULAR',
      status: 'ON_LEAVE'
    },
    {
      id: randomUUID(),
      employee_id: emp4.uuid,
      work_date: '2026-11-03',
      shift_type: 'NORMAL',
      planned_start_time: '10:00:00',
      planned_end_time: '19:00:00',
      approved_ot_hours: 0,
      schedule_type: 'REGULAR',
      status: 'PLANNED'
    }
  ];

  for (const sc of schedules) {
    await queryFn(`
      INSERT INTO work_schedules (
        id, employee_id, work_date, shift_type, planned_start_time, planned_end_time,
        approved_ot_hours, schedule_type, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    `, [
      sc.id, sc.employee_id, sc.work_date, sc.shift_type, sc.planned_start_time,
      sc.planned_end_time, sc.approved_ot_hours, sc.schedule_type, sc.status
    ]);
  }
}

async function main() {
  console.log('=== BẮT ĐẦU RESET VÀ KHỞI TẠO LẠI DB THẬT (POSTGRESQL CONTAINER) ===');
  
  // 1. Reset PostgreSQL thật (luong-db trên cổng 5432)
  const client = new Client({ connectionString: REAL_DB_URL });
  await client.connect();
  console.log(`Đã kết nối PostgreSQL thật tại: ${REAL_DB_URL.replace(/:[^:@]+@/, ':***@')}`);

  console.log('Xoá và khởi tạo lại public schema...');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
  await client.query('CREATE SCHEMA public;');
  await client.query('GRANT ALL ON SCHEMA public TO public;');
  await client.query('GRANT ALL ON SCHEMA public TO luong;');
  await client.end();

  // Khởi chạy migration qua PostgresDatabase
  console.log('Chạy 0001_baseline.sql và 0002_seed.sql...');
  const pgDb = new PostgresDatabase({ url: REAL_DB_URL });
  await pgDb.ready;
  console.log('Migrations hoàn tất trên PostgreSQL thật!');

  // Nạp dữ liệu nhân sự và V2 demo
  console.log('Nạp dữ liệu nhân sự và demo V2 vào PostgreSQL thật...');
  await pgDb.close();
  const seedClient = new Client({ connectionString: REAL_DB_URL });
  await seedClient.connect();
  await seedDataToDb((sql, params) => seedClient.query(sql, params || []));
  console.log('Đã nạp xong PostgreSQL thật!');

  // Kiểm tra danh sách bảng trên PostgreSQL thật
  const tablesRes = await seedClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const tables = tablesRes.rows.map((r: any) => r.table_name);
  console.log(`\nTổng số bảng trong PostgreSQL thật: ${tables.length}`);
  console.log(tables.join(', '));
  await seedClient.end();

  console.log('\n=== HOÀN TẤT RESET VÀ TÁI CẤU TRÚC HỆ THỐNG THÀNH CÔNG ===');
}

main().catch(err => {
  console.error('Lỗi thực thi:', err);
  process.exit(1);
});
