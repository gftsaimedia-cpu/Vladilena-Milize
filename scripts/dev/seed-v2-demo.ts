import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

async function seed() {
  const url = process.env.DATABASE_URL || 'postgres://luong:1FC62A1EB342AED2682F9F844F4B0CB4C8DA1791401E1816D2FEBED157037AF9@127.0.0.1:5432/luong_local';
  const db: any = process.env.DB_PATH ? new PGlite(process.env.DB_PATH) : new Pool({ connectionString: url });

  // Verify staff
  const staff = await db.query(`SELECT uuid, username, name FROM staff ORDER BY username;`);
  const rows = staff.rows as any[];
  const admin = rows.find(s => s.username === 'admin') || rows[0];
  const staffMembers = rows.filter(s => s.uuid !== admin.uuid);
  const emp1 = staffMembers[0] || admin;
  const emp2 = staffMembers[1] || emp1;
  const emp3 = staffMembers[2] || emp1;
  const emp4 = staffMembers[3] || emp1;

  console.log(`Seeding demo data for V2 Attendance and System Requests into ${url}...`);
  console.log(`Admin: ${admin.username} (${admin.uuid})`);
  console.log(`Employees: ${staffMembers.map(s => s.username).join(', ')}`);

  // 1. PUNCH EVENTS
  await db.query(`DELETE FROM punch_events;`);
  const punches = [
    {
      id: randomUUID(),
      employee_id: emp1.uuid,
      punched_at: '2026-11-03T07:56:45.000Z',
      work_date: '2026-11-03',
      type: 'IN',
      latitude: 10.77689,
      longitude: 106.70092,
      accuracy_meters: 8.5,
      distance_meters: 15.2,
      is_within_office: true,
      note: 'Chấm công vào đúng giờ tại sảnh văn phòng'
    },
    {
      id: randomUUID(),
      employee_id: emp1.uuid,
      punched_at: '2026-11-03T17:04:12.000Z',
      work_date: '2026-11-03',
      type: 'OUT',
      latitude: 10.77695,
      longitude: 106.70105,
      accuracy_meters: 9.1,
      distance_meters: 18.0,
      is_within_office: true,
      note: 'Chấm công ra về'
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
      note: 'Đến muộn do tắc đường cầu Sài Gòn'
    },
    {
      id: randomUUID(),
      employee_id: emp3.uuid,
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
    await db.query(`
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
  console.log(`Inserted ${punches.length} punch_events.`);

  // 2. TIMESHEET ENTRIES
  await db.query(`DELETE FROM timesheet_entries;`);
  const timesheets = [
    {
      id: randomUUID(),
      employee_id: emp1.uuid,
      work_date: '2026-11-03',
      shift_type: 'NORMAL',
      shift_start_time: '08:00',
      shift_end_time: '17:00',
      shift_allowance_pct: 0,
      actual_check_in: '2026-11-03T07:56:45.000Z',
      actual_check_out: '2026-11-03T17:04:12.000Z',
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
      shift_type: 'NORMAL',
      shift_start_time: '08:00',
      shift_end_time: '17:00',
      shift_allowance_pct: 0,
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
    await db.query(`
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
  console.log(`Inserted ${timesheets.length} timesheet_entries.`);

  // 3. SYSTEM REQUESTS (All 4 types with mandatory header + flat specific fields)
  await db.query(`DELETE FROM system_requests;`);
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
      title: 'Đăng ký tăng ca triển khai cơ sở dữ liệu V2',
      type: 'OVERTIME',
      reason: 'Trực ca tối bảo trì và kiểm thử hệ thống mới',
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
      reason: 'Chi trả tiền viện phí phẫu thuật cho người thân',
      status: 'APPROVED',
      reviewed_by: admin.uuid,
      reviewed_at: '2026-11-01T14:00:00.000Z',
      review_note: 'Đã duyệt tạm ứng, phòng kế toán sẽ chi trả',
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
    await db.query(`
      INSERT INTO system_requests (
        id, employee_id, title, type, reason, status, reviewed_by, reviewed_at, review_note,
        leave_type, leave_start_date, leave_end_date, leave_days_count,
        correction_date, correction_punch_type, correction_actual_time,
        ot_date, ot_start_time, ot_end_time, ot_hours,
        advance_amount, advance_period,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22,
        NOW(), NOW()
      )
    `, [
      r.id, r.employee_id, r.title, r.type, r.reason, r.status, r.reviewed_by, r.reviewed_at, r.review_note,
      r.leave_type, r.leave_start_date, r.leave_end_date, r.leave_days_count,
      r.correction_date, r.correction_punch_type, r.correction_actual_time,
      r.ot_date, r.ot_start_time, r.ot_end_time, r.ot_hours,
      r.advance_amount, r.advance_period
    ]);
  }
  console.log(`Inserted ${requests.length} system_requests.`);
  console.log('Seeding completed successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
