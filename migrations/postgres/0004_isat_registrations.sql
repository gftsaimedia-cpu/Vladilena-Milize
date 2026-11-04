-- Đơn đăng ký iSAT (nghỉ Thứ Bảy): thêm loại đơn ISAT, bảng đăng ký và bảng điều kiện tự đánh giá chụp lúc nộp.

ALTER TABLE system_requests DROP CONSTRAINT system_requests_type_check;
ALTER TABLE system_requests ADD CONSTRAINT system_requests_type_check
  CHECK (type IN ('LEAVE','TIME_CORRECTION','OVERTIME','ADVANCE','SHIFT_CHANGE','LEAVE_WITH_MAKEUP','EXPLANATION','ISAT'));

CREATE TABLE isat_registrations (
  request_id       UUID PRIMARY KEY REFERENCES system_requests(id),
  saturday         DATE NOT NULL,     -- Thứ Bảy đăng ký
  full_name        TEXT NOT NULL,     -- chụp từ hồ sơ lúc nộp
  team             TEXT NOT NULL,     -- người nộp gõ
  position_type    TEXT NOT NULL,     -- chụp: 'nv'
  position_level   BIGINT NOT NULL,   -- chụp: 2
  level_name       TEXT,              -- chụp: 'Chuyên viên' (NULL nếu danh mục không có)
  shift_type       TEXT NOT NULL,     -- chụp: 'NORMAL'
  shift_start_time TEXT NOT NULL,     -- '08:00'
  shift_end_time   TEXT NOT NULL      -- '17:00'
);
CREATE INDEX idx_isat_registrations_saturday ON isat_registrations (saturday);

CREATE TABLE isat_registration_conditions (
  request_id UUID    NOT NULL REFERENCES isat_registrations(request_id),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 1),  -- thứ tự hiển thị 1..4
  code       TEXT    NOT NULL CHECK (length(code) > 0),  -- 'NO_VIOLATION'
  label      TEXT    NOT NULL,                           -- nội dung lúc nộp
  passed     BOOLEAN NOT NULL,
  PRIMARY KEY (request_id, code)
);
