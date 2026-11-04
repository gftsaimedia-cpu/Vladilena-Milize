-- Đơn theo định dạng cũ không chuyển được. DB hiện chỉ có dữ liệu giả và seed không có đơn nào.
UPDATE work_schedules SET source_request_id = NULL
 WHERE source_request_id IN (SELECT id FROM system_requests
   WHERE type IN ('TIME_CORRECTION','LEAVE_WITH_MAKEUP')
      OR (type = 'SHIFT_CHANGE' AND (new_shift_type IS NULL OR new_shift_type NOT IN ('NORMAL','FLEX','NIGHT'))));
DELETE FROM system_requests
 WHERE type IN ('TIME_CORRECTION','LEAVE_WITH_MAKEUP')
    OR (type = 'SHIFT_CHANGE' AND (new_shift_type IS NULL OR new_shift_type NOT IN ('NORMAL','FLEX','NIGHT')));

ALTER TABLE system_requests DROP CONSTRAINT system_requests_type_check;
ALTER TABLE system_requests ADD CONSTRAINT system_requests_type_check
  CHECK (type IN ('LEAVE','OVERTIME','ADVANCE','SHIFT_CHANGE','LEAVE_WITH_MAKEUP','EXPLANATION','ISAT'));

ALTER TABLE system_requests DROP CONSTRAINT system_requests_leave_type_check;
UPDATE system_requests SET leave_type = 'ANNUAL' WHERE leave_type = 'PAID';
ALTER TABLE system_requests ADD CONSTRAINT system_requests_leave_type_check
  CHECK (leave_type IS NULL OR leave_type IN
    ('ANNUAL','PERSONAL_PAID','PERSONAL_UNPAID','SOCIAL_INSURANCE','WELFARE','UNPAID'));

-- Giải trình
ALTER TABLE system_requests RENAME COLUMN correction_date TO explanation_date;
ALTER TABLE system_requests RENAME COLUMN correction_actual_time TO actual_check_in;
ALTER TABLE system_requests ADD COLUMN actual_check_out TEXT;
ALTER TABLE system_requests DROP COLUMN correction_punch_type;

-- Đổi ca: khoảng ngày riêng, không mượn leave_start_date nữa
ALTER TABLE system_requests ADD COLUMN change_start_date DATE;
ALTER TABLE system_requests ADD COLUMN change_end_date DATE;
UPDATE system_requests
   SET change_start_date = leave_start_date, change_end_date = leave_start_date, leave_start_date = NULL
 WHERE type = 'SHIFT_CHANGE';
ALTER TABLE system_requests ADD CONSTRAINT system_requests_new_shift_type_check
  CHECK (new_shift_type IS NULL OR new_shift_type IN ('NORMAL','FLEX','NIGHT'));

-- Khung bù chuyển sang bảng con
ALTER TABLE system_requests DROP COLUMN makeup_start_time;
ALTER TABLE system_requests DROP COLUMN makeup_end_time;

CREATE TABLE makeup_slots (
  request_id   UUID    NOT NULL REFERENCES system_requests(id),
  work_date    DATE    NOT NULL,
  start_time   TEXT    NOT NULL,                          -- 'HH:mm', từ '06:00'
  end_time     TEXT    NOT NULL,                          -- 'HH:mm', đến '22:00', sau start_time
  work_minutes INTEGER NOT NULL CHECK (work_minutes > 0), -- giờ thực làm (§5.4)
  PRIMARY KEY (request_id, work_date, start_time)
);
CREATE INDEX idx_makeup_slots_work_date ON makeup_slots (work_date);

CREATE TABLE explanation_cases (
  request_id UUID NOT NULL REFERENCES system_requests(id),
  case_code  TEXT NOT NULL CHECK (case_code IN ('LATE_CHECK_IN','EARLY_CHECK_OUT','MISSING_CHECK_IN',
               'MISSING_CHECK_OUT','EARLY_CHECK_IN','LATE_CHECK_OUT','FORGOT_CHECK_OUT')),
  PRIMARY KEY (request_id, case_code)
);

CREATE TABLE company_holidays (
  holiday_date DATE PRIMARY KEY,
  name         TEXT NOT NULL CHECK (length(name) > 0),
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
