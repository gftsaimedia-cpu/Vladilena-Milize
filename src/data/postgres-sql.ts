'use strict';
// Cầu nối cho lời gọi prepare(sql).get/all/run (test, script, src/ops): các lời gọi này viết dấu `?` cho tham số và đọc
// `lastInsertRowid` của lệnh INSERT. PostgreSQL cần `$1, $2, ...` và trả id qua RETURNING, nên ở đây chỉ làm đúng hai việc đó:
//   ?                        → $1, $2, ...   (chuỗi trong nháy đơn, tên trong nháy kép và chú thích được giữ nguyên)
//   INSERT INTO <bảng có id> → thêm RETURNING id khi lệnh chưa có (để run() trả lastInsertRowid)
// Cú pháp SQL còn lại phải là PostgreSQL thật. Mã sản xuất không đi qua đây: truy vấn của ứng dụng là Kysely ở src/data, biên dịch
// thẳng ra PostgreSQL (PostgresDatabase.native).
class PostgresSql {
  declare identityTables: any;

  // identityTables: tên bảng có cột id tự tăng
  constructor({ identityTables = new Set() }: any = {}) {
    this.identityTables = identityTables;
  }

  // Tách thành các đoạn { code: bool, text } để chỉ sửa phần mã
  static #segments(sql?) {
    const out: any[] = [];
    let i = 0;
    let start = 0;
    const push = (end?, code?) => {
      if (end > start) out.push({ code, text: sql.slice(start, end) });
      start = end;
    };
    while (i < sql.length) {
      const c = sql[i];
      const two = sql.slice(i, i + 2);
      if (c === "'" || c === '"') {
        push(i, true);
        i++;
        while (i < sql.length) {
          if (sql[i] === c && sql[i + 1] === c) i += 2;
          else if (sql[i] === c) {
            i++;
            break;
          } else i++;
        }
        push(i, false);
      } else if (two === '--') {
        push(i, true);
        while (i < sql.length && sql[i] !== '\n') i++;
        push(i, false);
      } else if (two === '/*') {
        push(i, true);
        const end = sql.indexOf('*/', i + 2);
        i = end < 0 ? sql.length : end + 2;
        push(i, false);
      } else i++;
    }
    push(sql.length, true);
    return out;
  }

  // → { text, params: số tham số, write: có ghi không, wantsId: cần RETURNING id }
  translate(sql?) {
    let n = 0;
    const parts = PostgresSql.#segments(String(sql)).map(segment =>
      segment.code ? segment.text.replace(/\?/g, () => `$${++n}`) : segment.text
    );
    let text = parts.join('').trim().replace(/;+\s*$/, '');
    const insert = /^\s*INSERT\s+INTO\s+"?(\w+)"?/i.exec(text);
    const write = /^\s*(INSERT|UPDATE|DELETE)\b/i.test(text);
    const wantsId = !!insert && this.identityTables.has(insert[1].toLowerCase()) && !/\bRETURNING\b/i.test(text);
    if (wantsId) text += ' RETURNING id';
    return { text, params: n, write, wantsId };
  }
}

export = { PostgresSql };
