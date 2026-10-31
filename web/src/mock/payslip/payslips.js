// Ghép dữ liệu giả của phiếu lương: loại phiếu theo (tháng, kịch bản ?kb của Bảng lương, người), huy hiệu, nút, bản in A4.
// Khi nối máy chủ, máy chủ trả sẵn các trường này; file này bỏ đi.
import { AI_WARNINGS, drawerBody } from './drawer.js';
import { DEMO_OT_CHECK, PEOPLE, findPerson } from './people.js';
import { sheetBody } from './sheets.js';

const OCT = '2026-10';
const OFFICIAL = ['', 'da-phe-duyet', 'da-tra-luong']; // tháng 10: rỗng = đã trả lương
const ESTIMATE_OCT = ['tam-tinh', 'da-chot-cong'];

/** 'official' | 'approved' | 'pending' | 'draft' | 'estimate' */
export function kindOf(month, scenario, username) {
  if (month !== OCT) return 'estimate';
  if (ESTIMATE_OCT.includes(scenario)) return 'estimate';
  if (scenario === 'ban-nhap') return 'draft';
  if (scenario === 'da-duyet-50') return username === DEMO_OT_CHECK ? 'pending' : 'approved';
  if (['cho-phe-duyet', 'chon-phieu', 'can-tinh-lai'].includes(scenario)) return 'pending';
  return 'official';
}

// Huy hiệu, dòng chú thích và nút của ngăn kéo theo loại phiếu.
function badges(kind, month, scenario, username) {
  if (kind === 'official') {
    return {
      pills: [
        { cls: 'p-done', label: 'Đã phê duyệt' },
        { cls: 'p-lock', label: 'Chính thức', icon: 'lock' }
      ],
      meta: 'Khoá cùng kỳ lúc 12:03 26/11/2026 · phiên bản 3',
      canReturn: false,
      canApprove: false,
      canEditNumbers: false
    };
  }
  if (kind === 'estimate') {
    return {
      pills: [
        { cls: 'p-draft', label: 'Chưa tính lương' }
      ],
      meta:
        month === OCT
          ? 'Số tính từ chấm công đến 31/10, chưa phải lương chính thức'
          : 'Số tính từ chấm công đến 26/11, chưa phải lương chính thức',
      canReturn: false,
      canApprove: false,
      canEditNumbers: true
    };
  }
  const draftLabel = scenario === 'can-tinh-lai' ? 'Bản nháp · cần tính lại' : 'Bản nháp · lần tính 1';
  const draft = { cls: 'p-draft', label: draftLabel };
  if (kind === 'approved') {
    return {
      pills: [{ cls: 'p-done', label: 'Đã phê duyệt' }, draft],
      meta: 'Phiên bản 3 · payroll-engine-2 · tham số f2cd83d1',
      canReturn: true,
      canApprove: false,
      canEditNumbers: true
    };
  }
  if (kind === 'pending') {
    return {
      pills: [{ cls: 'p-pend', label: 'Chờ phê duyệt' }, draft],
      meta: `Phiên bản ${username === DEMO_OT_CHECK ? 2 : 3} · payroll-engine-2 · tham số f2cd83d1`,
      canReturn: true,
      canApprove: true,
      canEditNumbers: true
    };
  }
  return {
    pills: [draft],
    meta: 'Mới tính, chưa gửi phê duyệt · payroll-engine-2 · tham số f2cd83d1',
    canReturn: false,
    canApprove: false,
    canEditNumbers: true
  };
}

const who = (username, name) => {
  const person = findPerson(username);
  return { name: name || (person && person.name) || username, role: person ? person.role : 'NV · Bậc 1' };
};

/** Phiếu cho ngăn kéo (GET /api/periods/:month/payslips/:username). */
export function buildPayslip(month, username, name, scenario) {
  const kind = kindOf(month, scenario, username);
  const body = drawerBody(month, username);
  const info = who(username, name);
  const warnings = kind === 'pending' && username === DEMO_OT_CHECK ? AI_WARNINGS : [];
  return {
    month,
    username,
    name: info.name,
    role: info.role,
    kind,
    estimated: kind !== 'official',
    ...badges(kind, month, scenario, username),
    warnings,
    sum: body.sum,
    groups: body.groups,
    totals: body.totals,
    zero: body.zero
  };
}

// Huy hiệu và ghi chú ở dưới tiêu đề của bản in.
function sheetNote(kind, month) {
  if (kind === 'official') return { badge: { cls: 'p-done', label: 'Phiếu lương chính thức' }, note: '' };
  if (kind === 'estimate') {
    return {
      badge: { cls: 'p-pend', label: 'Chưa tính lương' },
      note: month === OCT ? 'số tính đến 31/10' : 'số tính đến 26/11'
    };
  }
  return {
    badge: { cls: 'p-draft', label: 'Bản nháp · chưa phải lương chính thức' },
    note: 'bản nháp, chưa phải lương chính thức'
  };
}

/** Bản in A4 của một người (GET /api/periods/:month/payslips/:username/sheet). */
export function buildSheet(month, username, name, scenario) {
  const kind = kindOf(month, scenario, username);
  const info = who(username, name);
  return {
    month,
    username,
    name: info.name,
    role: info.role,
    status: 'Chính thức',
    kind,
    ...sheetNote(kind, month),
    ...sheetBody(month, username)
  };
}

/** Người có phiếu đã phê duyệt của kỳ: chỉ tháng 10/2026 (đã trả lương 26/11) có 68 phiếu. */
export const approvedPeople = month => (month === OCT ? PEOPLE : []);
export const PAID_ON = { [OCT]: '2026-11-26' };
