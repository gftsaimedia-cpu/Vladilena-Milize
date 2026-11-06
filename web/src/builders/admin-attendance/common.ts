// Hằng và hàm thuần dùng chung cho các builder chấm công của Admin (không đọc đồng hồ máy, không gọi mạng).
export const PAGE_SIZE = 20;
export const TYPE_LABEL = { tts: 'Thực tập sinh', ctv: 'Chuyên trách viên', nv: 'Nhân viên' };
export const TYPE_SHORT = { tts: 'TTS', ctv: 'CTV', nv: 'NV' };

// Sáu nhãn chấm công theo mã của máy chủ.
export const STATUS_LABEL = {
  'checked-in': 'Đã Check-in',
  'checked-out': 'Đã Check-out',
  pending: 'Chờ xử lý',
  approved: 'Được phê duyệt',
  rejected: 'Bị từ chối',
  admin: 'Đã chấm công (Admin)'
};

export const fold = (s?) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

/** Giờ Việt Nam HH:MM của một mốc ISO (UTC+7, không đổi theo múi giờ máy). */
export function hhmm(iso?) {
  if (!iso) return null;
  return new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(11, 16);
}

/** Ngày công của một lượt: ngày của ca đã gán nếu có, ngược lại ngày của lượt. */
export const dayKeyOf = (s?) => (s.entry && s.entry.plannedShift && s.entry.plannedShift.date) || (s.entry && s.entry.date) || s.date;

export function paginate(list?, page = 1) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: list.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), total, page: p, pages };
}

export const shiftIndex = (resp?) => {
  const map = new Map<any, any>();
  for (const s of (resp && resp.shifts) || []) {
    map.set(s.code, s);
    if (s.preset) map.set(s.preset, s);
  }
  return map;
};
export const shiftLine = (idx?, code?) => {
  const s = idx.get(code);
  return s ? `${s.name} ${s.in}–${s.out}` : '';
};
/** Số phút trễ trong ghi chú trạng thái 'Vào trễ N phút' (0 nếu không có). */
export const lateMinOf = (note?) => Number((/Vào trễ (\d+)/.exec(note || '') || [])[1]) || 0;
