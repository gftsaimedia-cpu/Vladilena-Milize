'use strict';
// Bộ nhớ đệm cho phép tính nặng chỉ-đọc: ước tính cả kỳ, soát AI cả tháng... mỗi lần tính lại cả bảng lương
// trên MỘT luồng, nên 50 Admin cùng mở một màn là 50 lần tính y hệt nhau, chặn vòng lặp và làm mọi người chậm.
//
// Khoá hợp lệ = (khoá tuỳ ý) + (số lần ghi của kết nối này, PostgresDatabase.writes) + (tuổi < TTL).
// - số lần ghi đếm MỌI lệnh đã chèn/sửa/xoá qua kết nối duy nhất của tiến trình (kể cả lệnh ghi lẻ ngoài transaction và trigger), nên bất kỳ
//   thay đổi dữ liệu nào cũng làm số này tăng và bỏ kết quả cũ. Giao dịch bị hoàn tác vẫn làm số tăng: chỉ bỏ cache thừa, không bao giờ sai.
// - TTL chặn phần phụ thuộc vào GIỜ chứ không phải dữ liệu (ví dụ ca đang mở tính đến bây giờ), nên số cũ tối đa vài giây.
// - Tính xong mà trong lúc tính số lần ghi đã đổi (không xảy ra với tính toán đồng bộ, nhưng giữ cho chắc) thì không lưu.
const config = require('../platform/config');

class ComputeCache {
  declare revision: any;
  declare now: any;
  declare ttlMs: any;
  declare maxEntries: any;
  declare entries: any;
  declare hits: any;
  declare misses: any;

  // revision: () => số; now: () => ms. Tiêm vào để test không cần DB thật.
  constructor({
    revision,
    now = () => Date.now(),
    ttlMs = config.COMPUTE_CACHE_TTL_MS,
    maxEntries = config.COMPUTE_CACHE_MAX_ENTRIES
  }: any) {
    this.revision = revision;
    this.now = now;
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.entries = new Map(); // khoá → { rev, at, value }
    this.hits = 0;
    this.misses = 0;
  }

  async get(key?, compute?) {
    const rev = await this.revision();
    const at = this.now();
    const hit = this.entries.get(key);
    const age = hit ? at - hit.at : -1; // đồng hồ lùi (age < 0) coi như hết hạn
    if (hit && hit.rev === rev && age >= 0 && age < this.ttlMs) {
      this.hits++;
      return hit.value;
    }
    this.misses++;
    const value = await compute();
    this.entries.delete(key); // đưa xuống cuối thứ tự chèn
    if ((await this.revision()) === rev) this.entries.set(key, { rev, at, value });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    return value;
  }

  clear() {
    this.entries.clear();
  }

  stats() {
    return { hits: this.hits, misses: this.misses, size: this.entries.size };
  }
}

export = { ComputeCache };
