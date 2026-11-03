import { Pool } from 'pg';

const REAL_DB_URL = process.env.DATABASE_URL || 'postgres://luong:1FC62A1EB342AED2682F9F844F4B0CB4C8DA1791401E1816D2FEBED157037AF9@127.0.0.1:5432/luong_local';

async function main() {
  const db = new Pool({ connectionString: REAL_DB_URL });

  console.log('\n============================= 1. PUNCH_EVENTS =============================');
  const punches = await db.query(`
    SELECT p.id, s.username, s.name as full_name,
           p.work_date, p.type, p.punched_at, p.latitude, p.longitude, p.accuracy_meters,
           p.distance_meters, p.is_within_office, p.note
    FROM punch_events p
    JOIN staff s ON p.employee_id = s.uuid
    ORDER BY p.punched_at;
  `);
  console.table(punches.rows);

  console.log('\n=========================== 2. TIMESHEET_ENTRIES ===========================');
  const timesheets = await db.query(`
    SELECT t.id, s.username, s.name as full_name,
           t.work_date, t.shift_type, t.actual_check_in, t.actual_check_out,
           t.work_hours, t.work_units, t.ot_hours, t.late_minutes, t.status, t.is_locked
    FROM timesheet_entries t
    JOIN staff s ON t.employee_id = s.uuid
    ORDER BY t.work_date;
  `);
  console.table(timesheets.rows);

  console.log('\n============================= 3. SYSTEM_REQUESTS =============================');
  const reqs = await db.query(`
    SELECT r.id, s.username as requester, r.title, r.type, r.reason, r.status,
           rev.username as reviewer, r.leave_type, r.leave_days_count,
           r.correction_date, r.correction_punch_type, r.correction_actual_time,
           r.ot_date, r.ot_hours, r.advance_amount, r.advance_period
    FROM system_requests r
    JOIN staff s ON r.employee_id = s.uuid
    LEFT JOIN staff rev ON r.reviewed_by = rev.uuid
    ORDER BY r.created_at;
  `);
  console.table(reqs.rows);

  console.log('\n============================= ALL TABLES =============================');
  const allTables = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema='public' 
    ORDER BY table_name;
  `);
  console.log(`Total tables: ${allTables.rows.length}`);
  console.log(allTables.rows.map((r: any) => r.table_name));

  await db.end();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});



