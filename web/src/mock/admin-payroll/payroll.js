// Máy chủ giả của Bảng lương: ghép dữ liệu một kịch bản (?kb=) của tháng 10 hoặc tháng 11/2026.
// Mọi số tiền và số phiếu là số có sẵn như máy chủ trả; hàm ở đây chỉ chọn bộ số theo kịch bản,
// lọc/tìm/phân trang và áp các thao tác đã làm trong phiên (overlay).
import { PEOPLE_T10, PEOPLE_T11, failedPeople } from './people.js';

export const KB_T10 = [
  'tam-tinh',
  'da-chot-cong',
  'ban-nhap',
  'cho-phe-duyet',
  'chon-phieu',
  'da-duyet-50',
  'can-tinh-lai',
  'da-phe-duyet',
  'da-tra-luong'
];
export const KB_T11 = ['du-cot'];
export const DEFAULT_KB_T10 = 'da-tra-luong';

const REVIEW = ['cho-phe-duyet', 'chon-phieu', 'da-duyet-50', 'can-tinh-lai'];
const FINAL = ['da-phe-duyet', 'da-tra-luong'];

/** Chuẩn hoá ?kb= theo tháng; kịch bản lạ thì về mặc định của tháng. */
export function normalizeKb(month, kb) {
  if (month === '2026-10') return KB_T10.includes(kb) ? kb : DEFAULT_KB_T10;
  if (month === '2026-11') return KB_T11.includes(kb) ? kb : '';
  return '';
}

// ---- Thanh kỳ lương (null = mặc định của tháng) ----
const STEPS = ['Chấm công', 'Chốt công', 'Tính lương', 'AI kiểm tra', 'Phê duyệt', 'Trả lương'];
const stripOf = (state, stateCls, cur, notes = {}) => ({
  month: 'Tháng 10/2026',
  state,
  stateCls,
  steps: STEPS.map((label, i) =>
    [i < cur ? 'done' : i === cur ? 'cur' : '', label, notes[i]].filter(x => x !== undefined)
  )
});

function stripFor(kb, f) {
  if (kb === 'tam-tinh') return stripOf('Chưa tính lương', '', 1, { 1: 'hạn 03/11', 5: '10/11' });
  if (kb === 'da-chot-cong') return stripOf('Đã chốt công', '', 2, { 5: '10/11' });
  if (kb === 'ban-nhap') return stripOf('Bản nháp', 'draft', 3, { 5: '10/11' });
  if (REVIEW.includes(kb)) {
    const state = kb === 'can-tinh-lai' ? 'Chờ phê duyệt · cần tính lại' : 'Chờ phê duyệt';
    return stripOf(state, 'draft', 4, { 4: `${f.approved}/${f.total}`, 5: '10/11' });
  }
  if (kb === 'da-phe-duyet') return stripOf('Đã phê duyệt', 'ok', 5, { 5: '10/11' });
  if (kb === 'da-tra-luong') return stripOf('Đã trả lương', 'ok', 6, { 5: '26/11' });
  return null;
}

// ---- Số tổng của kỳ ----
const FACTS_T10 = {
  total: 70,
  calculated: 68,
  failed: 2,
  pending: 0,
  approved: 0,
  aiCards: 0,
  aiFindings: null,
  run: 1,
  deadline: '03/11',
  closedAt: '12:01 26/11',
  approvedAt: '12:03 26/11',
  paidDate: '2026-11-26',
  selectable: 0,
  selectedOtherNames: [],
  selectedOtherMore: 0
};
const FINDINGS_SUM_1 = { total: 31, high: 12, mid: 16, low: 3 };
const FINDINGS_SUM_2 = { total: 32, high: 12, mid: 17, low: 3 };

const FACTS_BY_KB = {
  'cho-phe-duyet': { pending: 68, aiCards: 18, aiFindings: FINDINGS_SUM_1, selectable: 50 },
  'chon-phieu': { pending: 68, aiCards: 18, aiFindings: FINDINGS_SUM_1, selectable: 50 },
  'da-duyet-50': { pending: 18, approved: 50, aiCards: 18, aiFindings: FINDINGS_SUM_1 },
  'can-tinh-lai': { pending: 1, approved: 67, aiFindings: FINDINGS_SUM_2 },
  'da-phe-duyet': { approved: 68, aiFindings: FINDINGS_SUM_2 },
  'da-tra-luong': { approved: 68, aiFindings: FINDINGS_SUM_2 }
};

// ---- Dải công thức: quỹ lương − bảo hiểm − thuế − tạm ứng = thực nhận ----
const FORMULA_T10_DRAFT = {
  income: 770462859,
  insurance: 36540000,
  tax: 5051702,
  advance: 142317308,
  net: 586553849,
  notes: {
    income: 'Tổng thu nhập của 68 phiếu có số',
    insurance: 'Phần nhân viên đóng',
    tax: 'Thuế thu nhập cá nhân',
    advance: 'Ứng giữa tháng 10',
    net: 'Chuyển khoản ngày 10/11'
  },
  locked: false
};
const FORMULA_T10_FINAL = {
  ...FORMULA_T10_DRAFT,
  advance: 140655770,
  net: 588215387,
  notes: { ...FORMULA_T10_DRAFT.notes, income: 'Tổng thu nhập của 68 phiếu chính thức' },
  locked: true
};
const FORMULA_T11 = {
  income: 404461658,
  insurance: 36645000,
  tax: 1276902,
  advance: 136779731,
  net: 229760025,
  notes: {
    income: 'Tổng thu nhập của 68 phiếu',
    insurance: 'Phần nhân viên đóng',
    tax: 'Thuế thu nhập cá nhân',
    advance: 'Đã ứng 16/11 – 20/11',
    net: 'Chuyển khoản ngày 10/12'
  },
  locked: false
};

function formulaFor(kb) {
  if (kb === 'can-tinh-lai') return { ...FORMULA_T10_DRAFT, advance: 140655770, net: 588215387 };
  if (kb === 'da-phe-duyet') return FORMULA_T10_FINAL;
  if (kb === 'da-tra-luong') {
    return { ...FORMULA_T10_FINAL, notes: { ...FORMULA_T10_FINAL.notes, net: 'Đã chuyển ngày 26/11' } };
  }
  return FORMULA_T10_DRAFT;
}

// ---- Các ô lọc: [khoá, nhãn, số phiếu | null] ----
function chipsFor(kb, f) {
  const all = ['all', 'Tất cả', f.total];
  const err = ['err', 'Chưa tính được', f.failed];
  if (kb === 'ban-nhap') return [all, ['draft', 'Bản nháp', f.calculated], err];
  if (kb === 'cho-phe-duyet' || kb === 'chon-phieu' || kb === 'da-duyet-50') {
    return [
      all,
      ['pending', 'Chờ phê duyệt', f.pending],
      ['ai', 'Có cảnh báo AI', f.aiCards],
      err,
      ['approved', 'Đã phê duyệt', f.approved]
    ];
  }
  if (kb === 'can-tinh-lai') {
    return [
      all,
      ['pending', 'Chờ phê duyệt', f.pending],
      ['ai', 'Có cảnh báo AI', null],
      err,
      ['approved', 'Đã phê duyệt', f.approved]
    ];
  }
  if (FINAL.includes(kb)) {
    return [
      all,
      ['approved', 'Đã phê duyệt', f.approved],
      ['excluded', 'Loại khỏi kỳ', f.failed],
      ['ai', 'Có cảnh báo AI', null]
    ];
  }
  return [all, err, ['tts', 'Thực tập sinh', null], ['ctv', 'Chuyên trách viên', null], ['nv', 'Nhân viên', null]];
}

// ---- Dòng bảng ----
function rowsFor(month, kb, overlay) {
  const t11 = month === '2026-11';
  const people = (t11 ? PEOPLE_T11 : PEOPLE_T10).map(p => ({ ...p }));
  const failed = failedPeople(t11 ? 11 : 10);
  for (const p of people) {
    if (REVIEW.includes(kb)) {
      const ok = kb === 'can-tinh-lai' || (kb === 'da-duyet-50' && !p.ai) || overlay.approved.has(p.username);
      p.status = ok ? 'approved' : 'pending';
    } else if (FINAL.includes(kb)) {
      p.status = 'approved';
    } else {
      p.status = 'draft';
    }
  }
  return [...failed, ...people];
}

function matches(row, filter) {
  if (filter === 'err' || filter === 'excluded') return row.status === 'failed';
  if (filter === 'tts' || filter === 'ctv' || filter === 'nv') return row.kind === filter;
  if (filter === 'ai') return row.ai > 0;
  if (filter === 'draft' || filter === 'pending' || filter === 'approved') return row.status === filter;
  return true;
}

/** Bảng lương một kỳ. opts: { kb, wide, filter, q, page }. overlay: thao tác đã làm trong phiên. */
export function buildPayroll(month, opts, overlay) {
  const kb = normalizeKb(month, opts.kb);
  if (month !== '2026-10' && month !== '2026-11') return { month, kb: '', empty: true };
  const t11 = month === '2026-11';
  const facts = t11 ? { ...FACTS_T10, deadline: '', openFrom: '01/12' } : { ...FACTS_T10, ...(FACTS_BY_KB[kb] || {}) };

  // Phê duyệt riêng trong phiên: phiếu chờ → đã duyệt, số tổng đổi theo
  if (REVIEW.includes(kb) && kb !== 'can-tinh-lai') {
    const done = [...overlay.approved].length;
    const pendingAi = kb === 'da-duyet-50' ? facts.pending : facts.aiCards;
    const moved = Math.min(done, pendingAi);
    facts.pending -= moved;
    facts.approved += moved;
    facts.aiCards -= moved;
  }
  if (kb === 'chon-phieu' || kb === 'cho-phe-duyet') {
    facts.selectedOtherNames = ['Phan Thanh Trang'];
    facts.selectedOtherMore = 42;
  }

  const all = rowsFor(month, kb, overlay);
  const wide = Boolean(opts.wide);
  const perPage = wide ? 9 : 14;
  const pageCount = Math.ceil(facts.total / perPage);
  const q = (opts.q || '').trim().toLowerCase();
  const filter = opts.filter || 'all';
  const found = all.filter(
    r => matches(r, filter) && (!q || r.name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q))
  );
  const filtered = filter !== 'all' || q;
  const total = filtered ? found.length : facts.total;
  const page = filtered ? 1 : Math.min(Math.max(Number(opts.page) || 1, 1), pageCount);
  const rows = found.slice(0, perPage);
  const from = rows.length ? (page - 1) * perPage + 1 : 0;

  return {
    month,
    kb,
    wide,
    strip: t11 ? null : stripFor(kb, facts),
    facts,
    formula: t11 ? FORMULA_T11 : formulaFor(kb),
    chips: chipsFor(kb, facts),
    rows,
    failed: all.filter(r => r.status === 'failed'),
    paging: { from, to: from ? from + rows.length - 1 : 0, total, page, pageCount: filtered ? 1 : pageCount }
  };
}
