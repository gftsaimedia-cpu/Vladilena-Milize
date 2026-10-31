'use strict';
// Lớp gốc của mọi repository trong lib/domain: gom phần giống nhau (truy vấn, giao dịch, ghi có khoá lạc quan `rev`) vào một chỗ,
// để repository con chỉ còn ánh xạ dòng ↔ đối tượng. Không giữ bản sao dữ liệu giữa các lần gọi.
const { DomainError } = require('./domain-error');

const IDENT_RE = /^[a-z_][a-z0-9_]*$/;
// Tên bảng/cột ghép vào câu SQL chỉ được là định danh đơn giản (do mã viết ra, không bao giờ từ người dùng)
const ident = name => {
  if (!IDENT_RE.test(name)) throw new Error(`Tên SQL không hợp lệ: ${name}`);
  return name;
};

class Repository {
  // db: kết nối node:sqlite; transaction: store.transaction (SAVEPOINT, lồng được)
  constructor({ db, transaction }) {
    this.db = db;
    this.transactionFn = transaction || (fn => fn());
  }

  async one(sql, ...args) {
    return await this.db.prepare(sql).get(...args) || null;
  }

  async all(sql, ...args) {
    return await this.db.prepare(sql).all(...args);
  }

  async run(sql, ...args) {
    return await this.db.prepare(sql).run(...args);
  }

  async transaction(fn) {
    return await this.transactionFn(fn);
  }

  // Ghi một dòng có cột `rev`: chỉ ghi khi rev trong DB bằng expectedRev (thiếu expectedRev = ghi đè như các màn cũ), rồi tăng rev.
  // sets: { cột: giá trị }. Không có dòng → 404; lệch rev → 409 <stale>. Trả rev mới.
  async updateWithRev({ table, key, id, expectedRev, sets, stale, notFound, label }) {
    const columns = Object.keys(sets);
    const assign = columns.map(c => `${ident(c)} = ?`).concat('rev = rev + 1');
    const guard = expectedRev == null ? '' : ' AND rev = ?';
    const args = [...columns.map(c => sets[c]), id, ...(expectedRev == null ? [] : [Number(expectedRev)])];
    const done = await this.run(`UPDATE ${ident(table)} SET ${assign.join(', ')} WHERE ${ident(key)} = ?${guard}`, ...args);
    if (done.changes === 1) return (await this.one(`SELECT rev FROM ${ident(table)} WHERE ${ident(key)} = ?`, id)).rev;
    const row = await this.one(`SELECT rev FROM ${ident(table)} WHERE ${ident(key)} = ?`, id);
    if (!row) throw DomainError.notFound(notFound, `Không có ${label} này`);
    throw DomainError.conflict(stale, `${label} vừa được người khác sửa, hãy tải lại rồi làm lại`, {
      current: row.rev
    });
  }
}

module.exports = { Repository };
