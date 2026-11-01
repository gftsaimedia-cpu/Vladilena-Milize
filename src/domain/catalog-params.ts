'use strict';
// Danh mục chức vụ, bậc, ca (bảng trong DB) → dòng tham số { key, value, effectiveMonth, id } để src/params/store.ts
// chồng lên bộ tham số của tháng. Tách khỏi src/domain/container.ts để src/params/store.ts không require ngược vào container
// (container nạp các mô-đun đọc tham số; test/unit/require-cycles.test.ts cấm vòng require, kể cả require trong hàm).
// Chỉ phụ thuộc src/platform/db, src/platform/config và các lớp danh mục (không đọc tham số).
const store = require('../platform/db');
const config = require('../platform/config');
const { PositionCatalog } = require('./position/position-catalog');
const { ShiftCatalog } = require('./shift/shift-catalog');

const REV_KEY = 'catalog_rev';

class CatalogParams {
  declare store: any;

  #db: any = null;
  #cache: any = { stamp: null, rows: null };

  constructor(source?) {
    this.store = source;
  }

  // Số phiên bản của danh mục (tăng mỗi lần Admin sửa chức vụ, bậc, ca): src/params/store.ts gộp vào khoá bộ nhớ đệm
  async rev() {
    const value = await this.store.getSetting(REV_KEY, 0);
    return Number.isSafeInteger(value) ? value : 0;
  }

  // Gọi bên trong giao dịch của thao tác sửa danh mục
  async bump() {
    const next = (await this.rev()) + 1;
    await this.store.setSetting(REV_KEY, next);
    return next;
  }

  // Dòng tham số của danh mục, id lớn (config.CATALOG_ROW_ID_BASE) để thắng dòng param_versions cùng tháng áp dụng.
  // Nhớ theo (kết nối DB, số phiên bản danh mục).
  async rows() {
    if (this.#db !== this.store.db) {
      this.#db = this.store.db;
      this.#cache = { stamp: null, rows: null };
    }
    const stamp = await this.rev();
    if (this.#cache.stamp === stamp && this.#cache.rows) return this.#cache.rows;
    const deps = { queryBuilder: this.store.queryBuilder, transaction: this.store.transaction };
    const rows = [...(await new PositionCatalog(deps).paramRows()), ...(await new ShiftCatalog(deps).paramRows())].map(
      (row, index) => Object.freeze({ ...row, id: config.CATALOG_ROW_ID_BASE + index + 1 })
    );
    this.#cache = { stamp, rows: Object.freeze(rows) };
    return this.#cache.rows;
  }
}

const catalogParams = new CatalogParams(store);

export = { CatalogParams, catalogParams };
