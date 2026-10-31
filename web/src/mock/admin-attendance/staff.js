// Nhân sự: trang 1 (20 người xếp theo loại rồi theo tên) + 2 người chưa có ca. Danh sách sống trong bộ nhớ để
// tạo/sửa/khoá/gán ca có hiệu lực trên màn (máy chủ thật sẽ lưu và trả lại).
import { SHIFTS, shiftOf } from './shifts.js';
import { fold, matches, pageOf, pagesOf } from './util.js';

export const TYPES = [
  { value: 'tts', label: 'Thực tập sinh' },
  { value: 'ctv', label: 'Chuyên trách viên' },
  { value: 'nv', label: 'Nhân viên' }
];
export const LEVELS = {
  tts: [1, 2, 3, 4, 5, 6].map(n => ({ value: `b${n}`, label: `Bậc ${n}` })),
  ctv: [
    { value: 'fresher', label: 'Fresher' },
    { value: 'practitioner', label: 'Practitioner' },
    { value: 'advanced', label: 'Advanced Practitioner' },
    { value: 'senior', label: 'Senior Practitioner' }
  ],
  nv: [{ value: 'b1', label: 'Bậc 1 · Nhân viên' }]
};
export const CONTRACTS = [
  { value: '3m', label: 'HĐLĐ từ 3 tháng' },
  { value: 'u3', label: 'Dưới 3 tháng' }
];
export const INSURANCE = [
  { value: 'default', label: 'Theo mặc định của hợp đồng (Có)' },
  { value: 'yes', label: 'Có' },
  { value: 'no', label: 'Không' }
];

const typeLabel = v => TYPES.find(t => t.value === v)?.label || '';
const levelLabel = (t, v) => LEVELS[t]?.find(l => l.value === v)?.label || '';
const contractLabel = v => CONTRACTS.find(c => c.value === v)?.label || '';
const insuranceLine = (contract, insurance, dependents) => {
  const pays = insurance === 'yes' || (insurance !== 'no' && contract === '3m');
  if (!pays) return 'Không đóng bảo hiểm';
  return dependents ? `Đóng bảo hiểm · ${dependents} người phụ thuộc` : 'Đóng bảo hiểm';
};
const dependentsOf = line => Number((/(\d+) người phụ thuộc/.exec(line) || [])[1] || 0);

// [họ tên, tên đăng nhập, [loại, bậc, loại sai?], ca, bắt đầu, hợp đồng, dòng bảo hiểm, việc cần sửa, đã khoá]
const TTS = 'Thực tập sinh';
const CTV = 'Chuyên trách viên';
const INS3 = 'Đóng bảo hiểm';
const INSU = 'Không đóng bảo hiểm';
const D = '2025-08-04';
const RAW = [
  [
    'Dương Bảo Lam',
    'demo_bad_type',
    ['Loại "intern" không hợp lệ', 'Bậc 1', true],
    'n1',
    D,
    '3m',
    INS3,
    'Sửa loại nhân sự'
  ],
  ['Bùi Quang Hạnh', 'demo_tts3', [TTS, 'Bậc 3'], 'f1', D, 'u3', INSU],
  ['Huỳnh Khánh Giang', 'demo_type_change', [TTS, 'Bậc 2'], 'n1', D, 'u3', INSU],
  ['Huỳnh Thu Dũng', 'demo_tts2', [TTS, 'Bậc 2'], 'n2', D, 'u3', INSU],
  ['Lý Ngọc Linh', 'demo_tts4', [TTS, 'Bậc 4'], 'f2', D, 'u3', INSU],
  ['Mai Anh Linh', 'demo_tts_odd', [TTS, 'Bậc 3'], 'n1', null, '3m', `${INS3} · 3 người phụ thuộc`],
  ['Nguyễn Minh An', 'demo_tts1', [TTS, 'Bậc 1'], 'n1', D, 'u3', INSU],
  ['Tạ Bảo Oanh', 'demo_tts5', [TTS, 'Bậc 5'], 'g1', D, 'u3', INSU],
  ['Trần Hải Sơn', 'demo_tts6', [TTS, 'Bậc 6'], 'g2', D, 'u3', INSU],
  ['Vũ Quang Giang', 'demo_tts_sat', [TTS, 'Bậc 2'], 'n1', D, 'u3', INSU],
  ['Bùi Đức Khoa', 'demo_level_change', [CTV, 'Advanced Practitioner'], 'n1', D, '3m', INS3],
  ['Chu Đức Nga', 'demo_ctv4', [CTV, 'Senior Practitioner'], 'f2', D, '3m', INS3],
  ['Đinh Khánh Khôi', 'demo_ctv3', [CTV, 'Advanced Practitioner'], 'f1', D, '3m', INS3],
  ['Đỗ Anh Yến', 'demo_ctv2', [CTV, 'Practitioner'], 'n2', D, '3m', INS3],
  ['Đỗ Hải Hiếu', 'demo_kpi_cap', [CTV, 'Practitioner'], 'n1', D, '3m', INS3],
  ['Đỗ Nhật Đạt', 'demo_unpaid_days', [CTV, 'Fresher'], 'n1', '2025-03-03', '3m', INS3],
  ['Hoàng Bảo An', 'demo_newhire', [CTV, 'Fresher'], 'n1', '2026-10-15', '3m', INS3],
  ['Hồ Phương Lam', 'demo_k5_below', [CTV, 'Practitioner'], 'n2', D, '3m', INS3],
  [
    'La Nhật Oanh',
    'demo_hd_long',
    [CTV, 'Practitioner · Chuyên trách viên nội dung'],
    'n1',
    D,
    '3m',
    `${INS3} · 2 người phụ thuộc`
  ],
  ['Lương Minh My', 'demo_a_broken', [CTV, 'Fresher'], 'n1', D, '3m', INS3]
];
const EXTRA = [
  ['Lương Quang Khôi', 'demo_locked_clean', [CTV, 'Practitioner'], '', D, '3m', INS3, 'Gán ca', true],
  ['Đặng Tuấn Giang', 'demo_over_hours', ['Nhân viên', 'Nhân viên'], '', D, '3m', INS3, 'Gán ca']
];

function toRow([name, username, [tl, level, bad], shift, start, contract, insLabel, issue, locked]) {
  const s = shiftOf(shift);
  return {
    username,
    name,
    type: TYPES.find(t => t.label === tl)?.value || '',
    typeLabel: tl,
    typeBad: !!bad,
    level,
    shift,
    shiftName: s ? s.name : 'Chưa có ca',
    shiftHours: s ? `${s.from}–${s.to}` : '—',
    start,
    contract,
    contractLabel: contractLabel(contract),
    insuranceLabel: insLabel,
    issue: issue || null,
    locked: !!locked
  };
}

let page1 = RAW.map(toRow);
let extra = EXTRA.map(toRow);
const all = () => [...page1, ...extra];
const find = username => all().find(r => r.username === username) || null;

const FILTERS = {
  tts: r => r.type === 'tts',
  ctv: r => r.type === 'ctv',
  nv: r => r.type === 'nv',
  'chua-co-ca': r => !r.shift,
  'thieu-ngay': r => !r.start,
  'da-khoa': r => r.locked
};

export function listStaff({ loc = 'all', q = '', page = 1 }) {
  const base = loc === 'all' ? page1 : all().filter(FILTERS[loc] || (() => true));
  const rows = base.filter(r => matches(r.name, q) || fold(r.username).includes(fold(q)));
  const everyone = 71 + page1.length - RAW.length;
  const total = loc === 'all' && !q ? everyone : rows.length;
  const noShift = all().filter(FILTERS['chua-co-ca']).length;
  return {
    summary: { total: everyone, active: everyone - 2, noShift, noStart: 1 },
    counts: { all: everyone, tts: 9, ctv: 23, nv: 38, 'chua-co-ca': noShift, 'thieu-ngay': 1, 'da-khoa': 2 },
    rows: pageOf(rows, page),
    total,
    page,
    pages: pagesOf(total),
    lockedNote: loc === 'chua-co-ca' && find('demo_locked_clean')?.locked ? 'Lương Quang Khôi đã khoá tài khoản' : ''
  };
}

export function staffOptions() {
  const shifts = [
    { value: '', label: 'Chưa có ca' },
    ...SHIFTS.map(s => ({ value: s.code, label: `${s.name} · ${s.from}–${s.to}` }))
  ];
  return { types: TYPES, levels: LEVELS, shifts, contracts: CONTRACTS, insurance: INSURANCE };
}

/** Hồ sơ đầy đủ của một người (Đặng Tuấn Giang theo thiết kế; người khác suy ra từ dòng danh sách). */
export function profileOf(username) {
  const r = find(username);
  if (!r) return null;
  const lv =
    LEVELS[r.type]?.find(l => l.label === r.level || l.value === r.level) ||
    (r.type === 'nv' ? LEVELS.nv[0] : undefined);
  const lvl = lv?.value || '';
  return {
    username: r.username,
    name: r.name,
    title: '',
    type: r.type,
    level: lvl,
    subtitle: [typeLabel(r.type) || r.typeLabel, lv?.label || r.level].join(' · '),
    shift: r.shift,
    start: r.start,
    birth: r.username === 'demo_over_hours' ? '1994-10-19' : null,
    leaveAdjust: 0,
    iDorm: false,
    scheduleText: 'theo loại nhân sự, T2 – T7',
    contract: r.contract,
    dependents: dependentsOf(r.insuranceLabel),
    insurance: 'default',
    taxDeduct: true,
    familyDeduct: true,
    advance: true,
    accountState: r.locked ? 'Đã khoá' : 'Đang dùng',
    createdAt: r.start ? `08:00 ${r.start.slice(8)}/${r.start.slice(5, 7)}/${r.start.slice(0, 4)}` : '—',
    leave: r.username === 'demo_over_hours' ? 'cộng 18 · dùng 0 · còn 18' : '—',
    locked: r.locked
  };
}

function applyForm(r, f) {
  const lv = LEVELS[f.type]?.find(l => l.value === f.level);
  const s = shiftOf(f.shift);
  Object.assign(r, {
    name: f.name,
    type: f.type,
    typeLabel: typeLabel(f.type),
    typeBad: false,
    level: f.type === 'nv' ? 'Nhân viên' : lv?.label || '',
    shift: f.shift || '',
    shiftName: s ? s.name : 'Chưa có ca',
    shiftHours: s ? `${s.from}–${s.to}` : '—',
    start: f.start || null,
    contract: f.contract || r.contract,
    contractLabel: contractLabel(f.contract || r.contract),
    insuranceLabel: insuranceLine(f.contract || r.contract, f.insurance, f.dependents || 0)
  });
  if (r.shift) r.issue = r.issue === 'Gán ca' ? null : r.issue;
  if (r.type) r.issue = r.issue === 'Sửa loại nhân sự' ? null : r.issue;
}

export function createStaffRow(f) {
  const row = toRow([f.name, f.username, ['', ''], f.shift, f.start || null, '3m', INS3]);
  applyForm(row, { ...f, contract: '3m', insurance: 'default' });
  page1 = [row, ...page1];
  return row;
}

export function updateStaffRow(username, f) {
  const r = find(username);
  if (r) applyForm(r, f);
  return r;
}

export function lockStaffRow(username) {
  const r = find(username);
  if (r) r.locked = true;
  return r;
}

export function assignShiftRows(usernames, shift) {
  const s = shiftOf(shift);
  for (const u of usernames) {
    const r = find(u);
    if (!r) continue;
    r.shift = shift;
    r.shiftName = s.name;
    r.shiftHours = `${s.from}–${s.to}`;
    if (r.issue === 'Gán ca') r.issue = null;
  }
  extra = extra.filter(r => !r.shift);
}
