'use strict';
const { AsyncList } = require('../../shared/async-list');
// Danh mục chức vụ và bậc trong DB (bảng ở schema.js). Đọc theo tháng: mỗi chức vụ / bậc lấy phiên bản có tháng áp dụng mới nhất không quá tháng hỏi.
// Ghi: Admin sửa một phần trường kèm tháng áp dụng; phiên bản của đúng tháng đó có rồi thì sửa (khoá lạc quan rev), chưa có thì thêm dòng mới
// chép từ phiên bản đang hiệu lực. Không giữ bản sao giữa các lần gọi.
// paramRows() đổi toàn bộ danh mục thành các dòng tham số (type.<mã>.*, level.<mã>.<bậc>.*) để src/params/store.ts trộn vào bộ tham số của tháng.
const config = require('../../platform/config');
const { PositionRepository } = require('../../data');
const { Repository } = require('../shared/repository');
const { DomainError } = require('../shared/domain-error');
const { Position } = require('./position');
const { RETIRED_BENEFITS } = require('./benefits');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DOW_MAX = 6;
const PCT_MAX = 100;
const WORKDAYS_MAX = 31;
const HUNDRED = 100;
const CODE_RE = /^[a-z][a-z0-9]{1,15}$/;
// Trường Admin sửa được (camelCase của API → cột)
const TYPE_FIELDS = Object.freeze({
  name: 'name',
  workdays: 'workdays',
  flexPct: 'flex_pct',
  nightPct: 'night_pct',
  travelPct: 'travel_pct',
  attendancePct: 'attendance_pct',
  regularDows: 'regular_dows'
});
const LEVEL_FIELDS = Object.freeze({
  name: 'name',
  baseSalary: 'base_salary',
  kpiMax: 'kpi_max',
  nightPct: 'night_pct'
});

const bad = (code?, message?) => DomainError.invalid(code, message);
const isPct = (v?) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= PCT_MAX;
const isMoney = (v?) => Number.isSafeInteger(v) && v >= 0;
const isDows = (v?) =>
  Array.isArray(v) && v.every(d => Number.isInteger(d) && d >= 0 && d <= DOW_MAX) && new Set<any>(v).size === v.length;
const ratio = (pct?) => pct / HUNDRED; // % trong bảng → tỉ lệ của bộ tham số (đúng một chỗ đổi đơn vị)

class PositionCatalog extends Repository {
  declare table: any;

  constructor(deps?) {
    super(deps);
    this.table = new PositionRepository(this.queryBuilder);
  }

  // Mã các chức vụ có trong danh mục
  async typeCodes() {
    return await this.table.typeCodes();
  }

  // Bỏ qua quyền lợi đã bỏ (RETIRED_BENEFITS): dòng lưu của nó trong benefit_types, position_type_benefits không được đọc
  async benefitCodes() {
    return (await this.table.benefitCodes()).filter(code => !RETIRED_BENEFITS.includes(code));
  }

  // Phiên bản chức vụ hiệu lực của tháng (dòng thô) hoặc null
  async typeRowAt(code?, month?) {
    return (await this.table.typeAt(code, month)) || null;
  }

  async levelRowAt(type?, level?, month?) {
    return (await this.table.levelAt(type, level, month)) || null;
  }

  async #benefitsOf(typeId?) {
    const out = Object.fromEntries((await this.benefitCodes()).map(code => [code, false]));
    for (const row of await this.table.benefitsOf(typeId))
      if (Object.hasOwn(out, row.benefit)) out[row.benefit] = row.enabled === 1;
    return out;
  }

  async #levelsAt(type?, month?) {
    const numbers = await this.table.levelNumbersAt(type, month);
    return (await AsyncList.map(numbers, async no => await this.levelRowAt(type, no, month))).filter(Boolean);
  }

  static typeView(row?, benefits?) {
    return {
      code: row.code,
      name: row.name,
      effectiveMonth: row.effective_month,
      workdays: row.workdays,
      flexPct: row.flex_pct,
      nightPct: row.night_pct,
      travelPct: row.travel_pct,
      attendancePct: row.attendance_pct,
      regularDows: JSON.parse(row.regular_dows),
      benefits,
      rev: row.rev,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at
    };
  }

  static levelView(row?) {
    return {
      level: row.level_no,
      name: row.name,
      effectiveMonth: row.effective_month,
      baseSalary: row.base_salary,
      kpiMax: row.kpi_max,
      nightPct: row.night_pct,
      rev: row.rev,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at
    };
  }

  // Toàn bộ danh mục hiệu lực của tháng (màn Admin)
  async forMonth(month?) {
    return await AsyncList.map(
      (await Promise.all((await this.typeCodes()).map(async code => await this.typeRowAt(code, month)))).filter(
        Boolean
      ),
      async row => ({
        ...PositionCatalog.typeView(row, await this.#benefitsOf(row.id)),
        levels: (await this.#levelsAt(row.code, month)).map(PositionCatalog.levelView)
      })
    );
  }

  // Vị trí (chức vụ + bậc) của một người ở tháng; không có trong danh mục thì null
  async position(type?, level?, month?) {
    const typeRow = await this.typeRowAt(type, month);
    const levelRow = typeRow && (await this.levelRowAt(type, Number(level), month));
    if (!levelRow) return null;
    const schedule: Record<string, any> = {};
    for (const dow of JSON.parse(typeRow.regular_dows)) schedule[dow] = 'regular';
    return new Position({
      type,
      typeName: typeRow.name,
      level: levelRow.level_no,
      name: levelRow.name,
      baseSalary: levelRow.base_salary,
      kpiMax: levelRow.kpi_max,
      standardWorkdays: typeRow.workdays,
      flexPct: typeRow.flex_pct,
      nightPct: levelRow.night_pct ?? typeRow.night_pct,
      travelPct: typeRow.travel_pct,
      attendancePct: typeRow.attendance_pct,
      benefits: await this.#benefitsOf(typeRow.id),
      schedule
    });
  }

  /* ---------- ghi ---------- */
  static #checkMonth(month?) {
    if (!MONTH_RE.test(String(month))) throw bad('BAD_MONTH', 'Tháng áp dụng phải có dạng YYYY-MM');
  }

  async #checkType(changes?) {
    for (const key of Object.keys(changes))
      if (!Object.hasOwn(TYPE_FIELDS, key) && key !== 'benefits')
        throw bad(
          'CATALOG_FIELD_UNKNOWN',
          `Không sửa được trường "${String(key).slice(0, config.ERROR_ECHO_FIELD_MAX)}"`
        );
    const c = changes;
    if (
      c.name !== undefined &&
      (typeof c.name !== 'string' || !c.name.trim() || c.name.length > config.POSITION_LABEL_MAX)
    )
      throw bad('CATALOG_BAD_NAME', `Tên chức vụ từ 1 đến ${config.POSITION_LABEL_MAX} ký tự`);
    if (c.workdays !== undefined && !(Number.isInteger(c.workdays) && c.workdays >= 1 && c.workdays <= WORKDAYS_MAX))
      throw bad('CATALOG_BAD_WORKDAYS', `Ngày công chuẩn là số nguyên từ 1 đến ${WORKDAYS_MAX}`);
    for (const key of ['flexPct', 'nightPct', 'travelPct', 'attendancePct'])
      if (c[key] !== undefined && !isPct(c[key]))
        throw bad('CATALOG_BAD_PCT', `${key} phải là số phần trăm từ 0 đến ${PCT_MAX}`);
    if (c.regularDows !== undefined && !isDows(c.regularDows))
      throw bad(
        'CATALOG_BAD_DOWS',
        `regularDows phải là mảng thứ trong tuần (0 = Chủ nhật … ${DOW_MAX} = thứ Bảy), không trùng`
      );
    if (c.benefits !== undefined) {
      const known = await this.benefitCodes();
      if (!c.benefits || typeof c.benefits !== 'object' || Array.isArray(c.benefits))
        throw bad('CATALOG_BAD_BENEFITS', 'benefits phải là { tên quyền lợi: true/false }');
      for (const [benefit, on] of Object.entries<any>(c.benefits))
        if (!known.includes(benefit) || typeof on !== 'boolean')
          throw bad('CATALOG_BAD_BENEFITS', `Quyền lợi lạ hoặc giá trị không phải true/false: ${benefit.slice(0, 40)}`);
    }
  }

  // Sửa chức vụ `code` từ tháng `effectiveMonth`. changes: một phần TYPE_FIELDS và/hoặc benefits. Trả { before, after } dạng xem
  async saveType(code, changes, { effectiveMonth, by, at, reason, expectedRev }: any) {
    PositionCatalog.#checkMonth(effectiveMonth);
    await this.#checkType(changes);
    return await this.transaction(async () => {
      const current = await this.typeRowAt(code, effectiveMonth);
      if (!current) throw DomainError.notFound('POSITION_NOT_FOUND', 'Không có chức vụ này trong danh mục');
      this.#guardRev(current, expectedRev, 'POSITION_STALE', 'Chức vụ');
      const merged: Record<string, any> = {};
      for (const [key, column] of Object.entries<any>(TYPE_FIELDS)) {
        const value = changes[key] === undefined ? current[column] : changes[key];
        merged[column] =
          key.endsWith('Dows') && Array.isArray(value)
            ? JSON.stringify([...value].sort((a: any, b: any) => a - b))
            : value;
        if (key === 'name') merged[column] = String(merged[column]).trim();
      }
      const benefits = { ...(await this.#benefitsOf(current.id)), ...(changes.benefits || {}) };
      const before = PositionCatalog.typeView(current, await this.#benefitsOf(current.id));
      let id = current.id;
      if (current.effective_month === effectiveMonth) {
        await this.updateWithRev({
          table: 'position_types',
          key: 'id',
          id,
          expectedRev: current.rev,
          sets: { ...merged, reason: reason || null, updated_by: by, updated_at: at },
          stale: 'POSITION_STALE',
          notFound: 'POSITION_NOT_FOUND',
          label: 'Chức vụ'
        });
      } else {
        id = await this.table.insertType({
          code,
          effective_month: effectiveMonth,
          name: merged.name,
          workdays: merged.workdays,
          flex_pct: merged.flex_pct,
          night_pct: merged.night_pct,
          travel_pct: merged.travel_pct,
          attendance_pct: merged.attendance_pct,
          regular_dows: merged.regular_dows,
          makeup_dows: '[]',
          reason: reason || null,
          updated_by: by,
          updated_at: at,
          rev: current.rev + 1 // dòng tháng mới nối tiếp số phiên bản: ai còn cầm số cũ (của tháng trước) thì bị chặn ghi đè
        });
      }
      for (const [benefit, on] of Object.entries<any>(benefits)) await this.table.setBenefit(id, benefit, on);
      return { before, after: PositionCatalog.typeView(await this.table.type(id), await this.#benefitsOf(id)) };
    });
  }

  #checkLevel(changes?, creating?) {
    for (const key of Object.keys(changes))
      if (!Object.hasOwn(LEVEL_FIELDS, key))
        throw bad(
          'CATALOG_FIELD_UNKNOWN',
          `Không sửa được trường "${String(key).slice(0, config.ERROR_ECHO_FIELD_MAX)}"`
        );
    const c = changes;
    if (
      (creating || c.name !== undefined) &&
      (typeof c.name !== 'string' || !c.name.trim() || c.name.length > config.POSITION_LABEL_MAX)
    )
      throw bad('CATALOG_BAD_NAME', `Tên bậc từ 1 đến ${config.POSITION_LABEL_MAX} ký tự`);
    if ((creating || c.baseSalary !== undefined) && !isMoney(c.baseSalary))
      throw bad('CATALOG_BAD_MONEY', 'Lương cơ bản phải là số đồng nguyên không âm');
    if (c.kpiMax !== undefined && c.kpiMax !== null && !isMoney(c.kpiMax))
      throw bad(
        'CATALOG_BAD_MONEY',
        'Lương KPI tối đa phải là số đồng nguyên không âm (hoặc để trống nếu bậc không có KPI)'
      );
    if (c.nightPct !== undefined && c.nightPct !== null && !isPct(c.nightPct))
      throw bad('CATALOG_BAD_PCT', `Phụ cấp đêm của bậc là số phần trăm từ 0 đến ${PCT_MAX} (để trống = theo chức vụ)`);
  }

  // Sửa (hoặc thêm) bậc `level` của chức vụ `type` từ tháng `effectiveMonth`. Thêm bậc chỉ được thêm bậc kế tiếp (không chừa lỗ)
  async saveLevel(type, level, changes, { effectiveMonth, by, at, reason, expectedRev }: any) {
    PositionCatalog.#checkMonth(effectiveMonth);
    if (!Number.isInteger(level) || level < 1) throw bad('CATALOG_BAD_LEVEL', 'Bậc phải là số nguyên từ 1');
    return await this.transaction(async () => {
      if (!(await this.typeRowAt(type, effectiveMonth)))
        throw DomainError.notFound('POSITION_NOT_FOUND', 'Không có chức vụ này trong danh mục');
      const current = await this.levelRowAt(type, level, effectiveMonth);
      if (!current) {
        const count = (await this.#levelsAt(type, effectiveMonth)).length;
        if (level !== count + 1)
          throw bad('CATALOG_BAD_LEVEL', `Chỉ thêm được bậc kế tiếp (bậc ${count + 1}) của chức vụ này`);
      }
      this.#checkLevel(changes, !current);
      if (current) this.#guardRev(current, expectedRev, 'LEVEL_STALE', 'Bậc');
      const merged: Record<string, any> = {};
      for (const [key, column] of Object.entries<any>(LEVEL_FIELDS))
        merged[column] = changes[key] === undefined ? (current ? current[column] : null) : changes[key];
      merged.name = String(merged.name).trim();
      const before = current ? PositionCatalog.levelView(current) : null;
      let id;
      if (current && current.effective_month === effectiveMonth) {
        id = current.id;
        await this.updateWithRev({
          table: 'position_levels',
          key: 'id',
          id,
          expectedRev: current.rev,
          sets: { ...merged, reason: reason || null, updated_by: by, updated_at: at },
          stale: 'LEVEL_STALE',
          notFound: 'LEVEL_NOT_FOUND',
          label: 'Bậc'
        });
      } else {
        id = await this.table.insertLevel({
          type_code: type,
          level_no: level,
          effective_month: effectiveMonth,
          name: merged.name,
          base_salary: merged.base_salary,
          kpi_max: merged.kpi_max,
          night_pct: merged.night_pct,
          reason: reason || null,
          updated_by: by,
          updated_at: at,
          rev: current ? current.rev + 1 : 0 // như chức vụ: dòng tháng mới nối tiếp số phiên bản
        });
      }
      return {
        before,
        after: PositionCatalog.levelView(await this.table.level(id))
      };
    });
  }

  #guardRev(row?, expectedRev?, code?, label?) {
    if (expectedRev === undefined || expectedRev === null || expectedRev === '') return;
    if (Number(expectedRev) !== row.rev)
      throw DomainError.conflict(code, `${label} vừa được người khác sửa, hãy tải lại rồi làm lại`, {
        current: row.rev
      });
  }

  /* ---------- dòng tham số cho bộ máy lương ---------- */
  // Mỗi phiên bản thành các dòng { key, value, effectiveMonth } như param_versions. Bộ máy đọc khoá nightPct khi
  // shift.allowance.basis = 'assigned'.
  async paramRows() {
    const rows: any[] = [];
    const push = (key?, value?, effectiveMonth?) => rows.push({ key, value, effectiveMonth, createdBy: 'catalog' });
    for (const row of await this.table.allTypes()) {
      const at = row.effective_month,
        p = `type.${row.code}.`;
      push(`${p}workdays`, row.workdays, at);
      push(`${p}flexBonus`, ratio(row.flex_pct), at);
      push(`${p}travel`, ratio(row.travel_pct), at);
      push(`${p}attendance`, ratio(row.attendance_pct), at);
      push(`${p}nightPct`, row.night_pct, at);
      push(`${p}dows`, JSON.parse(row.regular_dows), at);
      for (const b of await this.table.benefitsOf(row.id))
        if (!RETIRED_BENEFITS.includes(b.benefit)) push(`${p}benefit.${b.benefit}`, b.enabled === 1, at);
    }
    for (const row of await this.table.allLevels()) {
      const at = row.effective_month,
        p = `level.${row.type_code}.${row.level_no}.`;
      push(`${p}name`, row.name, at);
      push(`${p}base`, row.base_salary, at);
      if (row.kpi_max !== null) push(`${p}kpi`, row.kpi_max, at);
      if (row.night_pct !== null) push(`${p}nightPct`, row.night_pct, at);
    }
    return rows;
  }
}

export = { PositionCatalog, CODE_RE };
