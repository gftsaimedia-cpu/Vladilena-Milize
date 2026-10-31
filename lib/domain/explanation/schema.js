'use strict';
// Bảng giải trình. Bảng dạng cũ (có cột closed_by) đổi bằng RENAME → chép → DROP trong MỘT giao dịch, để tiến trình chết giữa
// chừng không để lại bảng rỗng; còn explanations_v1 mồ côi từ lần chạy dở trước thì chép nốt phần thiếu rồi bỏ.
const COPY_FROM_V1 = `
  INSERT OR IGNORE INTO explanations (id, username, date, kind, session_id, prompt, rule_id, requested_by, requested_at, status, answer,
    answered_at, decided_by, decided_at)
  SELECT id, username, date, kind, session_id, prompt, rule_id, requested_by, requested_at,
         CASE WHEN status = 'closed' THEN 'approved' ELSE status END, answer, answered_at, closed_by, closed_at
  FROM explanations_v1;
  DROP TABLE explanations_v1;`;

// helpers: transaction, addColumn của lib/db.js
function ensureExplanationSchema(db, { transaction, addColumn }) {
  const tableSql = name => {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
    return row ? row.sql : null;
  };
  transaction(() => {
    const legacy = /closed_by/.test(tableSql('explanations') || '');
    if (legacy)
      db.exec(`
        ALTER TABLE explanations RENAME TO explanations_v1;
        DROP INDEX IF EXISTS explanations_user_status;
        DROP INDEX IF EXISTS explanations_status;
        DROP INDEX IF EXISTS explanations_session;
      `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS explanations (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL,
        date          TEXT NOT NULL,
        kind          TEXT NOT NULL CHECK (kind IN ('late-checkout', 'admin', 'ai')),
        session_id    INTEGER,
        prompt        TEXT NOT NULL DEFAULT '',
        rule_id       TEXT,
        requested_by  TEXT NOT NULL,
        requested_at  TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'answered', 'approved', 'rejected')),
        answer        TEXT,
        answered_at   TEXT,
        decided_by    TEXT,
        decided_at    TEXT,
        decision_note TEXT,
        rev           INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS explanations_user_status ON explanations (username, status);
      CREATE INDEX IF NOT EXISTS explanations_status ON explanations (status, id);
      CREATE INDEX IF NOT EXISTS explanations_session ON explanations (session_id);
    `);
    if (tableSql('explanations_v1') && /closed_by/.test(tableSql('explanations_v1'))) db.exec(COPY_FROM_V1);
  });
  // Bảng tạo trước khi có khoá lạc quan
  addColumn('explanations', 'rev', 'INTEGER NOT NULL DEFAULT 0');
}

module.exports = { ensureExplanationSchema };
