'use strict';
// Lớp gốc của mọi repository trong src/domain: gom phần giống nhau (giao dịch, ghi có khoá lạc quan `rev`) vào một chỗ,
// để repository con chỉ còn ánh xạ dòng ↔ đối tượng. Truy vấn nằm ở các repository Kysely trong src/data. Không giữ bản sao dữ liệu giữa các lần gọi.
const { RevisionedWrites } = require('../../data');
const { DomainError } = require('./domain-error');

class Repository {
  declare queryBuilder: any;
  declare transactionFn: any;
  declare revisioned: any;

  // queryBuilder: trình dựng truy vấn Kysely của store; transaction: store.transaction (SAVEPOINT, lồng được)
  constructor({ queryBuilder, transaction }: any) {
    this.queryBuilder = queryBuilder;
    this.transactionFn = transaction || (fn => fn());
    this.revisioned = new RevisionedWrites(queryBuilder);
  }

  async transaction(fn?) {
    return await this.transactionFn(fn);
  }

  // Ghi một dòng có cột `rev`: chỉ ghi khi rev trong DB bằng expectedRev (thiếu expectedRev = ghi đè như các màn cũ), rồi tăng rev.
  // sets: { cột: giá trị }. Không có dòng → 404; lệch rev → 409 <stale>. Trả rev mới.
  async updateWithRev({ table, key, id, expectedRev, sets, stale, notFound, label }: any) {
    const done = await this.revisioned.update(table, key, id, expectedRev, sets);
    if (done.updated) return done.rev;
    if (done.current === null) throw DomainError.notFound(notFound, `Không có ${label} này`);
    throw DomainError.conflict(stale, `${label} vừa được người khác sửa, hãy tải lại rồi làm lại`, {
      current: done.current
    });
  }
}

export = { Repository };
