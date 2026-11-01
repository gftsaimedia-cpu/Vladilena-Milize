// Tạo dòng attendance_days kiểu cũ (không gắn phiên chấm công) để thử luồng di chuyển dữ liệu và xoá lịch sử.
// Ghi thẳng vào bảng vì production không có hàm ghi tay cho bảng này.
const LEGACY_UPDATED_AT = '2026-10-07T12:00:00.000Z';
async function insertLegacyAttendanceDay(store?, username?, date?, entry?, updatedAt = LEGACY_UPDATED_AT) {
  await store.db
    .prepare(
      'INSERT INTO attendance_days (username,date,entry_json,updated_at) VALUES (?,?,?,?) ' +
        'ON CONFLICT(username,date) DO UPDATE SET entry_json=excluded.entry_json, updated_at=excluded.updated_at'
    )
    .run(username, date, JSON.stringify(entry), updatedAt);
}
module.exports = { insertLegacyAttendanceDay, LEGACY_UPDATED_AT };
