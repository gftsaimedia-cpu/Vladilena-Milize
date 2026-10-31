// Đánh giá KPI tháng 11/2026: 5 điểm thành phần (0–100) × tỉ lệ → tổng điểm; máy chủ tính tổng và kết quả.
import { matches, pageOf, pagesOf } from './util.js';

export const KPI_WEIGHTS = [
  { key: 'base', label: 'Base Wework', pct: 40, note: 'Phải từ 75 điểm mới xét' },
  { key: 'user', label: 'Người dùng', pct: 24, note: '' },
  { key: 'peer', label: 'Đồng nghiệp', pct: 18, note: '' },
  { key: 'manager', label: 'Quản lý trực tiếp', short: 'Quản lý', pct: 12, note: '' },
  { key: 'self', label: 'Tự đánh giá', pct: 6, note: '' }
];
const BASE_MIN = 75; // "Phải từ 75 điểm mới xét" (thiết kế)

export const KPI_SUMMARY = {
  passed: 2,
  incomplete: 56,
  failed: 2,
  failedNote: '1 có Base Wework dưới 75 · 1 có tổng điểm chưa đạt',
  salaryTotal: 10032000,
  salaryNote: 'Chưa chốt',
  scoreWindow: '02/12 đến 05/12',
  weights: KPI_WEIGHTS,
  example: { text: 'Ví dụ Hồ Phương Lam: 80, 70, 70, 70, 70', total: 74 },
  tabs: { scores: 60, history: 5 }
};

// [id, họ tên, bậc, KPI tối đa, điểm[5] | null]
const RAW = [
  ['k01', 'Bùi Đức Khoa', 'Advanced Practitioner', 4500000],
  ['k02', 'Chu Đức Nga', 'Senior Practitioner', 6000000],
  ['k03', 'Hoàng Bảo An', 'Fresher', 1500000],
  ['k04', 'Hồ Phương Lam', 'Practitioner', 3000000, [80, 70, 70, 70, 70]],
  ['k05', 'La Nhật Oanh', 'Practitioner', 3000000],
  ['k06', 'Lý Phương Mai', 'Practitioner', 3000000],
  ['k07', 'Lương Minh My', 'Fresher', 1500000],
  ['k08', 'Lương Quang Khôi', 'Practitioner', 3000000],
  ['k09', 'Nguyễn Anh Bình', 'Practitioner', 3000000],
  ['k10', 'Ngô Khánh Đạt', 'Advanced Practitioner', 4500000],
  ['k11', 'Ngô Thu Yến', 'Advanced Practitioner', 4500000],
  ['k12', 'Phan Mỹ Uyên', 'Advanced Practitioner', 4500000],
  ['k13', 'Phan Thanh Trang', 'Fresher', 1500000],
  ['k14', 'Phạm Gia Sơn', 'Practitioner', 3000000],
  ['k15', 'Phạm Mỹ Thảo', 'Fresher', 1500000],
  ['k16', 'Trần Ngọc Thảo', 'Fresher', 1500000],
  ['k17', 'Tạ Quang Quân', 'Practitioner', 3000000],
  ['k18', 'Võ Anh Uyên', 'Practitioner', 3000000],
  ['k19', 'Võ Nhật Vy', 'Practitioner', 3000000],
  ['k20', 'Đinh Khánh Khôi', 'Advanced Practitioner', 4500000]
];

// Tính lại một dòng như máy chủ: tổng = Σ điểm × tỉ lệ. Base Wework dưới mốc 75 → Chưa đạt (lương KPI 0).
// Mốc tổng điểm "đạt" chưa có trong thiết kế nên bản giả chỉ ghi "Đã chấm đủ" cho dòng còn lại.
function settle(row) {
  const done = row.scores.every(s => s != null);
  row.total = done ? Math.round(row.scores.reduce((sum, v, i) => sum + v * KPI_WEIGHTS[i].pct, 0)) / 100 : null;
  if (!done) row.result = null;
  else if (row.scores[0] < BASE_MIN) row.result = { cls: 'p-err', label: 'Chưa đạt' };
  else row.result = { cls: 'p-draft', label: 'Đã chấm đủ' };
  row.bonus = done && row.result.cls === 'p-err' ? 0 : null;
  return row;
}

const rows = RAW.map(([id, name, level, max, scores]) =>
  settle({ id, name, sub: `CTV · ${level}`, scores: scores || [null, null, null, null, null], max })
);
// Thiết kế ghi sẵn kết quả của Hồ Phương Lam: tổng 74, Chưa đạt, lương KPI 0.
Object.assign(rows[3], { result: { cls: 'p-err', label: 'Chưa đạt' }, bonus: 0 });
const FILTERS = {
  all: () => true,
  incomplete: r => r.scores.some(s => s == null),
  'base-thap': r => r.scores[0] != null && r.scores[0] < BASE_MIN,
  'tong-thap': r => r.result?.cls === 'p-err',
  dat: r => r.result?.cls === 'p-done'
};

export function listKpi({ filter = 'all', q = '', page = 1 }) {
  const list = rows.filter(r => (FILTERS[filter] || FILTERS.all)(r) && matches(r.name, q));
  const total = filter === 'all' && !q ? 60 : list.length;
  return {
    counts: { all: 60, incomplete: 56, 'base-thap': 1, 'tong-thap': 1, dat: 2 },
    rows: pageOf(list, page),
    total,
    page,
    pages: pagesOf(total)
  };
}

/** Lưu một điểm; trả lại cả dòng đã tính lại như máy chủ. */
export function saveKpiRow(id, index, value) {
  const r = rows.find(x => x.id === id);
  if (!r) return null;
  r.scores[index] = value;
  return settle(r);
}

export const KPI_HISTORY = [
  ['2026-11-20T10:00', 'Hồ Phương Lam', 'CTV · Practitioner'],
  ['2026-11-20T10:00', 'Chu Anh Trí', 'NV · Nhân viên'],
  ['2026-11-20T10:00', 'Lê Khánh Châu', 'NV · Nhân viên'],
  ['2026-11-20T10:00', 'Vũ Đức Hà', 'NV · Nhân viên'],
  ['2026-11-20T10:00', 'Đinh Thanh My', 'NV · Nhân viên']
].map(([at, name, sub], i) => ({
  id: `h${i + 1}`,
  at,
  name,
  sub,
  by: { name: 'Quản trị demo', username: 'demo_admin' }
}));
