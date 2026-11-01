'use strict';
// Danh mục ca làm (bảng work_shifts, tạo và nạp ở src/domain/position/schema.js cùng danh mục chức vụ).
// Mã ca mới (Normal1…Night2) là mã lưu trong hồ sơ; mã cũ n1 n2 f1 f2 g1 g2 vẫn được nhận ở mọi đầu vào và đổi sang mã mới (canonicalOf).
// paramRows() đưa loại ca và bảng đổi mã vào bộ tham số của tháng, để bộ máy lương (phụ cấp theo ca được xếp) và src/engine/punch.ts
// (giờ ca theo mã mới) đọc được mà không cần biết tới DB.
const config = require('../../platform/config');
const { WorkShiftsRepository } = require('../../data');
const { Repository } = require('../shared/repository');
const { DomainError } = require('../shared/domain-error');
const { Shift, KINDS } = require('./shift');

class ShiftCatalog extends Repository {
  declare table: any;

  constructor(deps?) {
    super(deps);
    this.table = new WorkShiftsRepository(this.queryBuilder);
  }

  async list({ includeDeprecated = true }: any = {}) {
    return (await this.table.list(includeDeprecated)).map(Shift.fromRow);
  }

  // Ca theo mã mới hoặc mã cũ; không có thì null
  async find(code?) {
    if (typeof code !== 'string' || !code) return null;
    const row = await this.table.find(code);
    return row ? Shift.fromRow(row) : null;
  }

  // Mã mới của một mã bất kỳ (mới hoặc cũ); mã lạ trả null
  async canonicalOf(code?) {
    const shift = await this.find(code);
    return shift ? shift.code : null;
  }

  // Khoá giờ ca trong bộ tham số của một mã bất kỳ; mã lạ trả null
  async presetOf(code?) {
    const shift = await this.find(code);
    return shift ? shift.preset : null;
  }

  // Admin sửa tên, loại phụ cấp, thứ tự hoặc ngưng dùng một ca. Loại ca đổi tiền từ tháng áp dụng phụ cấp theo ca được xếp, không có tháng áp dụng riêng
  async save(code, changes, { by, at, expectedRev }: any) {
    const current = await this.find(code);
    if (!current) throw DomainError.notFound('SHIFT_UNKNOWN', 'Không có ca này trong danh mục');
    const allowed = ['name', 'kind', 'sort', 'deprecated'];
    for (const key of Object.keys(changes))
      if (!allowed.includes(key))
        throw DomainError.invalid(
          'CATALOG_FIELD_UNKNOWN',
          `Không sửa được trường "${String(key).slice(0, config.ERROR_ECHO_FIELD_MAX)}" của ca`
        );
    if (
      changes.name !== undefined &&
      (typeof changes.name !== 'string' || !changes.name.trim() || changes.name.length > config.POSITION_LABEL_MAX)
    )
      throw DomainError.invalid('SHIFT_BAD_NAME', `Tên ca từ 1 đến ${config.POSITION_LABEL_MAX} ký tự`);
    if (changes.kind !== undefined && !KINDS.includes(changes.kind))
      throw DomainError.invalid('SHIFT_BAD_KIND', `Loại ca phải là một trong: ${KINDS.join(', ')}`);
    if (changes.sort !== undefined && !Number.isSafeInteger(changes.sort))
      throw DomainError.invalid('SHIFT_BAD_SORT', 'Thứ tự phải là số nguyên');
    if (changes.deprecated !== undefined && typeof changes.deprecated !== 'boolean')
      throw DomainError.invalid('SHIFT_BAD_FLAG', 'deprecated phải là true hoặc false');
    const sets: Record<string, any> = { updated_by: by, updated_at: at };
    if (changes.name !== undefined) sets.name = changes.name.trim();
    if (changes.kind !== undefined) sets.kind = changes.kind;
    if (changes.sort !== undefined) sets.sort = changes.sort;
    if (changes.deprecated !== undefined) sets.deprecated = changes.deprecated ? 1 : 0;
    await this.updateWithRev({
      table: 'work_shifts',
      key: 'code',
      id: current.code,
      expectedRev,
      sets,
      stale: 'SHIFT_STALE',
      notFound: 'SHIFT_UNKNOWN',
      label: 'Ca làm'
    });
    return { before: current, after: await this.find(current.code) };
  }

  // Dòng tham số (áp mọi tháng, tháng nền CATALOG_BASE_MONTH): shift.kind.<mã> (cả mã mới và mã cũ, vì lượt chấm công cũ chụp mã cũ)
  // và shift.alias.<mã mới> = <mã cũ> để src/engine/punch.ts, src/engine/actual-hours.ts tra giờ ca bằng mã mới
  async paramRows() {
    const at = config.CATALOG_BASE_MONTH;
    const rows: any[] = [];
    for (const shift of await this.list()) {
      rows.push({ key: `shift.kind.${shift.code}`, value: shift.kind, effectiveMonth: at, createdBy: 'catalog' });
      if (shift.preset !== shift.code) {
        rows.push({ key: `shift.kind.${shift.preset}`, value: shift.kind, effectiveMonth: at, createdBy: 'catalog' });
        rows.push({ key: `shift.alias.${shift.code}`, value: shift.preset, effectiveMonth: at, createdBy: 'catalog' });
      }
    }
    return rows;
  }
}

export = { ShiftCatalog };
