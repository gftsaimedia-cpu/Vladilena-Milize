-- Dữ liệu gieo sẵn của bản mới (danh mục quyền lợi/chức vụ/ca và các mốc đã chạy), chụp từ DB SQLite mới tinh ở G2.
-- Mốc trong settings báo "không còn gì để nâng cấp": PostgreSQL bắt đầu từ lược đồ cuối cùng, không chạy các bước nâng cấp SQLite cũ.

-- benefit_types: 14 dòng
INSERT INTO benefit_types (code, label) VALUES ('ot', NULL);
INSERT INTO benefit_types (code, label) VALUES ('makeup', NULL);
INSERT INTO benefit_types (code, label) VALUES ('kpi', NULL);
INSERT INTO benefit_types (code, label) VALUES ('paidHoliday', NULL);
INSERT INTO benefit_types (code, label) VALUES ('paidLeave', NULL);
INSERT INTO benefit_types (code, label) VALUES ('isat', NULL);
INSERT INTO benefit_types (code, label) VALUES ('absenceDeclarable', NULL);
INSERT INTO benefit_types (code, label) VALUES ('approvedLeave', NULL);
INSERT INTO benefit_types (code, label) VALUES ('leaveAccount', NULL);
INSERT INTO benefit_types (code, label) VALUES ('makeupHours', NULL);
INSERT INTO benefit_types (code, label) VALUES ('makeupDay', NULL);
INSERT INTO benefit_types (code, label) VALUES ('holidayWork', NULL);
INSERT INTO benefit_types (code, label) VALUES ('idorm', NULL);
INSERT INTO benefit_types (code, label) VALUES ('breakPay', NULL);

-- position_types: 3 dòng
INSERT INTO position_types (id, code, effective_month, name, workdays, flex_pct, night_pct, travel_pct, attendance_pct, regular_dows, makeup_dows, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (1, 'ctv', '2000-01', 'Chuyên trách viên', 26, 10, 30, 0, 0, '[1,2,3,4,5,6]', '[]', 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_types (id, code, effective_month, name, workdays, flex_pct, night_pct, travel_pct, attendance_pct, regular_dows, makeup_dows, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (2, 'nv', '2000-01', 'Nhân viên', 26, 20, 40, 15, 25, '[1,2,3,4,5,6]', '[]', 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_types (id, code, effective_month, name, workdays, flex_pct, night_pct, travel_pct, attendance_pct, regular_dows, makeup_dows, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (3, 'tts', '2000-01', 'Thực tập sinh', 22, 10, 30, 0, 0, '[1,2,3,4,5]', '[]', 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
SELECT setval(pg_get_serial_sequence('position_types', 'id'), (SELECT MAX(id) FROM position_types));

-- position_type_benefits: 42 dòng
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'ot', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'makeup', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'kpi', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'paidHoliday', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'paidLeave', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'isat', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'absenceDeclarable', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'approvedLeave', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'leaveAccount', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'makeupHours', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'makeupDay', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'holidayWork', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'idorm', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (1, 'breakPay', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'ot', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'makeup', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'kpi', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'paidHoliday', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'paidLeave', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'isat', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'absenceDeclarable', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'approvedLeave', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'leaveAccount', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'makeupHours', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'makeupDay', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'holidayWork', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'idorm', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (2, 'breakPay', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'ot', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'makeup', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'kpi', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'paidHoliday', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'paidLeave', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'isat', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'absenceDeclarable', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'approvedLeave', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'leaveAccount', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'makeupHours', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'makeupDay', 1);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'holidayWork', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'idorm', 0);
INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES (3, 'breakPay', 0);

-- position_levels: 14 dòng
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (1, 'ctv', 1, '2000-01', 'Fresher', 6000000, 1500000, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (2, 'ctv', 2, '2000-01', 'Practitioner', 6000000, 3000000, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (3, 'ctv', 3, '2000-01', 'Advanced Practitioner', 6000000, 4500000, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (4, 'ctv', 4, '2000-01', 'Senior Practitioner', 6000000, 6000000, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (5, 'nv', 1, '2000-01', 'Nhân viên', 6000000, 6000000, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (6, 'nv', 2, '2000-01', 'Chuyên viên', 6500000, 6500000, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (7, 'nv', 3, '2000-01', 'Lead', 7000000, 7000000, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (8, 'nv', 4, '2000-01', 'Advisor', 7500000, 7500000, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (9, 'tts', 1, '2000-01', 'Explorer', 1000000, NULL, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (10, 'tts', 2, '2000-01', 'Learner', 1500000, NULL, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (11, 'tts', 3, '2000-01', 'Trainee', 2000000, NULL, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (12, 'tts', 4, '2000-01', 'Advanced Trainee', 3000000, NULL, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (13, 'tts', 5, '2000-01', 'Senior Trainee', 4000000, NULL, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO position_levels (id, type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct, reason, updated_by, updated_at, rev) OVERRIDING SYSTEM VALUE VALUES (14, 'tts', 6, '2000-01', 'Practitioner in Training', 5000000, NULL, NULL, 'Nạp từ mặc định', 'system', '2026-10-31T08:38:56.093Z', 0);
SELECT setval(pg_get_serial_sequence('position_levels', 'id'), (SELECT MAX(id) FROM position_levels));

-- work_shifts: 6 dòng
INSERT INTO work_shifts (code, preset, name, kind, sort, deprecated, updated_by, updated_at, rev) VALUES ('Normal1', 'n1', 'Normal 1', 'normal', 1, 0, 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO work_shifts (code, preset, name, kind, sort, deprecated, updated_by, updated_at, rev) VALUES ('Normal2', 'n2', 'Normal 2', 'normal', 2, 0, 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO work_shifts (code, preset, name, kind, sort, deprecated, updated_by, updated_at, rev) VALUES ('Flex1', 'f1', 'Flex 1', 'flex', 3, 0, 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO work_shifts (code, preset, name, kind, sort, deprecated, updated_by, updated_at, rev) VALUES ('Flex2', 'f2', 'Flex 2', 'flex', 4, 0, 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO work_shifts (code, preset, name, kind, sort, deprecated, updated_by, updated_at, rev) VALUES ('Night1', 'g1', 'Night 1', 'night', 5, 0, 'system', '2026-10-31T08:38:56.093Z', 0);
INSERT INTO work_shifts (code, preset, name, kind, sort, deprecated, updated_by, updated_at, rev) VALUES ('Night2', 'g2', 'Night 2', 'night', 6, 0, 'system', '2026-10-31T08:38:56.093Z', 0);

-- settings: 12 dòng
INSERT INTO settings (key, value_json) VALUES ('attendance_split_v1', '{"at":"2026-10-31T08:38:56.077Z"}');
INSERT INTO settings (key, value_json) VALUES ('params_mode', '"defaults-only"');
INSERT INTO settings (key, value_json) VALUES ('backend_v4_v1a_v1', '{"at":"2026-10-31T08:38:56.081Z"}');
INSERT INTO settings (key, value_json) VALUES ('staff_payroll_subject_v1', '{"at":"2026-10-31T08:38:56.081Z"}');
INSERT INTO settings (key, value_json) VALUES ('staff_identity_v1', '{"at":"2026-10-31T08:38:56.086Z"}');
INSERT INTO settings (key, value_json) VALUES ('position_catalog_v1', '{"at":"2026-10-31T08:38:56.094Z"}');
INSERT INTO settings (key, value_json) VALUES ('staff_shift_codes_v1', '{"at":"2026-10-31T08:38:56.096Z"}');
INSERT INTO settings (key, value_json) VALUES ('attendance_sessions_v1', '{"at":"2026-10-31T08:38:56.105Z"}');
INSERT INTO settings (key, value_json) VALUES ('sheet_approvals_v1', '{"at":"2026-10-31T08:38:56.105Z","cutoffMonth":"2026-10","approved":0,"pending":0}');
INSERT INTO settings (key, value_json) VALUES ('sheet_approvals_v2', '{"at":"2026-10-31T08:38:56.106Z","cutoffMonth":"2026-10","approved":0,"pending":0}');
INSERT INTO settings (key, value_json) VALUES ('sheet_approvals_v3', '{"at":"2026-10-31T08:38:56.106Z","cutoffMonth":"2026-10","approved":0,"pending":0}');
INSERT INTO settings (key, value_json) VALUES ('sheet_approvals_v4', '{"at":"2026-10-31T08:38:56.106Z","cutoffMonth":"2026-10","approved":0,"pending":0}');
