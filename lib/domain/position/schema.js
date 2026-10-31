'use strict';
// Danh mục chức vụ, bậc, quyền lợi và ca làm trong DB (Admin sửa trực tiếp ở màn Admin).
// Mỗi thuộc tính là một cột SQL thật. Chức vụ và bậc có THÁNG ÁP DỤNG: sửa là thêm (hoặc sửa) dòng của tháng đó, tháng trước giữ nguyên số cũ,
// nên tính lại kỳ cũ vẫn ra đúng số đã trả. Bộ máy lương đọc danh mục qua bộ tham số của tháng (lib/params/store.js trộn dòng danh mục với
// param_versions theo tháng áp dụng; cùng tháng thì danh mục thắng), và bản chụp lần chạy lương (params_json) giữ luôn số của danh mục.
// Phần trăm lưu dạng số phần trăm (10 = 10%), đổi sang tỉ lệ đúng một chỗ: PositionCatalog.paramRows.
// Các bảng positions, position_benefits, position_schedule, shifts, profiles không được tạo ở đây; DB đã có thì để nguyên.
const config = require('../../config');
const Params = require('../../../public/payroll-params.js');
const { BENEFITS } = require('./benefits');
const { TYPE_NAMES, LEVEL_NAMES, SHIFTS } = require('./seed-data');

const MONTH_CHECK = col => `CHECK (${col} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]')`;
const PCT = col => `${col} REAL NOT NULL CHECK (${col} BETWEEN 0 AND 100)`;

function ensurePositionTables(db) {
  db.exec(`
    -- Danh mục quyền lợi. Thêm quyền lợi mới = thêm một dòng, không sửa cấu trúc bảng
    CREATE TABLE IF NOT EXISTS benefit_types (
      code TEXT PRIMARY KEY CHECK (length(code) > 0),
      label TEXT
    );
    -- Chức vụ (loại nhân sự): một dòng cho mỗi (mã, tháng áp dụng)
    CREATE TABLE IF NOT EXISTS position_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL CHECK (length(code) > 0),
      effective_month TEXT NOT NULL ${MONTH_CHECK('effective_month')},
      name TEXT NOT NULL CHECK (length(name) > 0),
      workdays INTEGER NOT NULL CHECK (workdays BETWEEN 1 AND 31),   -- ngày công chuẩn, mẫu số lương ngày
      ${PCT('flex_pct')},                                              -- phụ cấp ca Flex, % lương ngày
      ${PCT('night_pct')},                                             -- phụ cấp ca Night mặc định của chức vụ, %
      ${PCT('travel_pct')},                                            -- phụ cấp đi lại, %
      ${PCT('attendance_pct')},                                        -- phụ cấp chuyên cần, %
      regular_dows TEXT NOT NULL CHECK (json_valid(regular_dows)),     -- thứ đi làm: mảng JSON, 0 = Chủ nhật … 6 = thứ Bảy
      makeup_dows TEXT NOT NULL CHECK (json_valid(makeup_dows)),       -- thứ chỉ làm bù / nghỉ không lương
      reason TEXT,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      rev INTEGER NOT NULL DEFAULT 0,
      UNIQUE (code, effective_month)
    );
    -- Quyền lợi bật/tắt của từng phiên bản chức vụ (đủ mọi quyền lợi trong danh mục; thiếu dòng = tắt)
    CREATE TABLE IF NOT EXISTS position_type_benefits (
      type_id INTEGER NOT NULL REFERENCES position_types (id),
      benefit TEXT NOT NULL REFERENCES benefit_types (code),
      enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
      PRIMARY KEY (type_id, benefit)
    );
    -- Bậc trong chức vụ: một dòng cho mỗi (chức vụ, bậc, tháng áp dụng)
    CREATE TABLE IF NOT EXISTS position_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type_code TEXT NOT NULL CHECK (length(type_code) > 0),
      level_no INTEGER NOT NULL CHECK (level_no >= 1),
      effective_month TEXT NOT NULL ${MONTH_CHECK('effective_month')},
      name TEXT NOT NULL CHECK (length(name) > 0),
      base_salary INTEGER NOT NULL CHECK (typeof(base_salary) = 'integer' AND base_salary >= 0),  -- VND đồng nguyên
      kpi_max INTEGER CHECK (kpi_max IS NULL OR (typeof(kpi_max) = 'integer' AND kpi_max >= 0)),  -- NULL = không có lương KPI
      night_pct REAL CHECK (night_pct IS NULL OR night_pct BETWEEN 0 AND 100),                     -- NULL = theo chức vụ
      reason TEXT,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      rev INTEGER NOT NULL DEFAULT 0,
      UNIQUE (type_code, level_no, effective_month)
    );
    -- Ca làm. kind quyết định phụ cấp ca từ tháng áp dụng quy tắc mới: normal = không có, flex = phụ cấp Flex, night = phụ cấp Night.
    -- preset: khoá giờ ca trong bộ tham số (shift.preset.<preset>.in | out), giờ ca vẫn sửa ở Cài đặt › Ca làm có tháng áp dụng
    CREATE TABLE IF NOT EXISTS work_shifts (
      code TEXT PRIMARY KEY CHECK (length(code) > 0),
      preset TEXT NOT NULL UNIQUE CHECK (length(preset) > 0),
      name TEXT NOT NULL CHECK (length(name) > 0),
      kind TEXT NOT NULL CHECK (kind IN ('normal','flex','night')),
      sort INTEGER NOT NULL DEFAULT 0,
      deprecated INTEGER NOT NULL DEFAULT 0 CHECK (deprecated IN (0,1)),
      updated_by TEXT,
      updated_at TEXT,
      rev INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// Tỉ lệ của bộ tham số (0.15) → số phần trăm lưu trong bảng (15), làm tròn để 0.15 * 100 không thành 15.000000000000002
const pctOf = ratio => Math.round(Number(ratio || 0) * 10000) / 100;
const builtinTypes = () =>
  Object.keys(Params.DEFAULTS)
    .map(key => /^type\.([a-z0-9]+)\.workdays$/.exec(key))
    .filter(Boolean)
    .map(m => m[1]);

// Nạp dòng nền (tháng CATALOG_BASE_MONTH) từ DEFAULTS: số tiền, ngày công, phụ cấp, lịch và quyền lợi giữ đúng như bộ máy đang dùng (tiền không đổi);
// tên bậc lấy từ seed-data.js. Chạy một lần dưới mốc once.
function seedCatalog(db, at) {
  const D = Params.DEFAULTS;
  const base = config.CATALOG_BASE_MONTH;
  const insertBenefitType = db.prepare('INSERT OR IGNORE INTO benefit_types (code) VALUES (?)');
  for (const benefit of BENEFITS) insertBenefitType.run(benefit);
  const insertType = db.prepare(
    `INSERT OR IGNORE INTO position_types (code, effective_month, name, workdays, flex_pct, night_pct, travel_pct, attendance_pct,
       regular_dows, makeup_dows, reason, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 'Nạp từ mặc định', 'system', ?)`
  );
  const insertBenefit = db.prepare(
    'INSERT OR IGNORE INTO position_type_benefits (type_id, benefit, enabled) VALUES (?, ?, ?)'
  );
  const insertLevel = db.prepare(
    `INSERT OR IGNORE INTO position_levels (type_code, level_no, effective_month, name, base_salary, kpi_max, night_pct,
       reason, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 'Nạp từ mặc định', 'system', ?)`
  );
  for (const code of builtinTypes()) {
    const nightOptions = D[`type.${code}.nightOptions`];
    const night = Array.isArray(nightOptions) && nightOptions.length ? nightOptions[0] : pctOf(D['shift.night.bonus']);
    const done = insertType.run(
      code,
      base,
      TYPE_NAMES[code] || code.toUpperCase(),
      D[`type.${code}.workdays`],
      pctOf(D[`type.${code}.flexBonus`] ?? D['shift.flex.bonus']),
      night,
      pctOf(D[`type.${code}.travel`]),
      pctOf(D[`type.${code}.attendance`]),
      JSON.stringify(D[`type.${code}.dows`] || []),
      at
    );
    const typeId = done.changes
      ? Number(done.lastInsertRowid)
      : db.prepare('SELECT id FROM position_types WHERE code = ? AND effective_month = ?').get(code, base).id;
    for (const benefit of BENEFITS) insertBenefit.run(typeId, benefit, D[`type.${code}.benefit.${benefit}`] ? 1 : 0);
    for (let level = 1; Object.hasOwn(D, `level.${code}.${level}.base`); level++) {
      const kpi = D[`level.${code}.${level}.kpi`];
      insertLevel.run(
        code,
        level,
        base,
        (LEVEL_NAMES[code] && LEVEL_NAMES[code][level]) || D[`level.${code}.${level}.name`] || `Bậc ${level}`,
        D[`level.${code}.${level}.base`],
        kpi == null ? null : kpi,
        at
      );
    }
  }
  const insertShift = db.prepare(
    `INSERT OR IGNORE INTO work_shifts (code, preset, name, kind, sort, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, 'system', ?)`
  );
  SHIFTS.forEach((shift, index) => insertShift.run(shift.code, shift.preset, shift.name, shift.kind, index + 1, at));
}

// helpers: once, now của lib/db.js
function ensureCatalog(db, { once, now }) {
  ensurePositionTables(db);
  once('position_catalog_v1', () => seedCatalog(db, now()));
}

module.exports = { ensureCatalog, ensurePositionTables, seedCatalog };
