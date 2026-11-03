CREATE TABLE IF NOT EXISTS punch_events (
  id UUID PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES staff(uuid),
  punched_at TIMESTAMPTZ NOT NULL,
  work_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_meters REAL NOT NULL,
  distance_meters REAL NOT NULL,
  is_within_office BOOLEAN NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_punch_events_emp_date ON punch_events(employee_id, work_date);

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id UUID PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES staff(uuid),
  work_date DATE NOT NULL,
  shift_type TEXT NOT NULL,
  shift_start_time TEXT NOT NULL,
  shift_end_time TEXT NOT NULL,
  shift_allowance_pct INTEGER NOT NULL,
  actual_check_in TIMESTAMPTZ,
  actual_check_out TIMESTAMPTZ,
  work_hours REAL NOT NULL DEFAULT 0,
  work_units REAL NOT NULL DEFAULT 0,
  ot_hours REAL NOT NULL DEFAULT 0,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_timesheet_emp_date UNIQUE(employee_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_emp_date ON timesheet_entries(employee_id, work_date);

CREATE TABLE IF NOT EXISTS system_requests (
  id UUID PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES staff(uuid),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('LEAVE', 'TIME_CORRECTION', 'OVERTIME', 'ADVANCE')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by TEXT REFERENCES staff(uuid),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  leave_type TEXT CHECK (leave_type IS NULL OR leave_type IN ('PAID', 'UNPAID')),
  leave_start_date DATE,
  leave_end_date DATE,
  leave_days_count REAL,
  correction_date DATE,
  correction_punch_type TEXT CHECK (correction_punch_type IS NULL OR correction_punch_type IN ('IN', 'OUT')),
  correction_actual_time TEXT,
  ot_date DATE,
  ot_start_time TEXT,
  ot_end_time TEXT,
  ot_hours REAL,
  advance_amount BIGINT,
  advance_period TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_requests_emp ON system_requests(employee_id, status);
