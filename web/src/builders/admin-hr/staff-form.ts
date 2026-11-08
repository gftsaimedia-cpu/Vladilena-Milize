// Hộp Thêm nhân sự và Sửa hồ sơ (Admin): biểu mẫu ↔ thân POST / PUT /api/v2/employees. Hàm thuần, import tương đối để
// chạy được bằng node. Nút Tạo / Lưu chỉ bật khi createProblem / editProblem trả '' (ngăn trước, không để máy chủ báo lỗi sau).
// BE đọc họ tên ở profile.name { familyName, givenName }; vai trò của người mới luôn là Nhân viên (đổi ở Phân quyền ›
// Tài khoản). Sửa hồ sơ không gửi phần account: tên đăng nhập, mật khẩu, vai trò giữ nguyên (BE gộp từng ô với hồ sơ cũ).
import { inForce, type TypeRow } from '../api/catalog';
import type { EmployeeDTO } from '../api/staff';

export type StaffForm = {
  name: string;
  username: string;
  password: string; // chỉ khi thêm
  type: string; // mã loại: tts | ctv | nv
  level: string; // số bậc dạng chữ ('1'), '' khi chưa chọn
  status: string; // chỉ NV: thuviec | nv
  job: string;
  shift: string; // NORMAL | FLEX | NIGHT
  nightPct: string; // chỉ NV ca đêm: '40' | '60'
  shiftFrom: string; // chỉ khi Sửa và đổi ca: ngày áp ca mới 'YYYY-MM-DD', '' = hôm nay
  start: string; // 'YYYY-MM-DD'
  birthday: string; // 'YYYY-MM-DD' hoặc ''
  dept: string; // id phòng ban dạng chữ, '' = chưa xếp phòng
};
export type Option = { value: string; label: string };

export const PASSWORD_MIN = 6;
export const NIGHT_PCTS = ['40', '60']; // ca đêm Nhân viên theo từng người (spec chức vụ, P3)
const TYPE_ORDER = ['tts', 'ctv', 'nv'];
const USERNAME = /^[a-z0-9._-]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const SHIFT_OPTIONS: Option[] = [
  { value: 'NORMAL', label: 'Hành chính' },
  { value: 'FLEX', label: 'Linh hoạt' },
  { value: 'NIGHT', label: 'Ca đêm' }
];
export const NV_STATUS_OPTIONS: Option[] = [
  { value: 'thuviec', label: 'Thử việc' },
  { value: 'nv', label: 'Chính thức' }
];

export const emptyStaffForm = (today: string): StaffForm => ({
  name: '',
  username: '',
  password: '',
  type: '',
  level: '',
  status: '',
  job: '',
  shift: 'NORMAL',
  nightPct: '',
  shiftFrom: '',
  start: today,
  birthday: '',
  dept: ''
});

const fold = (text: string) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/** Tên đăng nhập gợi ý từ họ tên: bỏ dấu, chữ thường, các từ nối bằng '-' ("Phan Thị Hai" → phan-thi-hai). */
export const suggestUsername = (name: string) =>
  fold(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Lúc gõ tên đăng nhập: chữ thường, chỉ giữ a–z, 0–9, '.', '_', '-'. */
export const cleanUsername = (raw: string) =>
  String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');

/** Họ tên → họ đệm và tên (tên là từ cuối). */
export function splitName(name: string) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return { familyName: words.slice(0, -1).join(' '), givenName: words[words.length - 1] || '' };
}

/** Các loại nhân sự có hiệu lực ở `month`, theo thứ tự TTS, CTV, NV. */
export function typeOptions(rows: TypeRow[], month: string): Option[] {
  const rank = (code: string) => (TYPE_ORDER.includes(code) ? TYPE_ORDER.indexOf(code) : TYPE_ORDER.length);
  return inForce(rows, r => r.code, month)
    .sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code))
    .map(t => ({ value: t.code, label: t.name }));
}

/** Các bậc của loại `type` có hiệu lực ở `month`. */
export function levelOptions(rows: TypeRow[], type: string, month: string): Option[] {
  if (!type) return [];
  const levels = rows.flatMap(r => r.levels || []).filter(l => l.type_code === type);
  return inForce(levels, l => String(l.level_no), month)
    .sort((a, b) => a.level_no - b.level_no)
    .map(l => ({ value: String(l.level_no), label: `Bậc ${l.level_no} · ${l.name}` }));
}

const isNightNv = (f: StaffForm) => f.type === 'nv' && f.shift === 'NIGHT';

/** Điều còn thiếu hoặc sai ở các ô chung của Thêm và Sửa; '' khi đủ. */
export function editProblem(f: StaffForm, levels: Option[]): string {
  if (!f.name.trim()) return 'Nhập họ tên.';
  if (!f.type) return 'Chọn loại nhân sự.';
  if (!levels.some(l => l.value === f.level)) return 'Chọn bậc.';
  if (f.type === 'nv' && !NV_STATUS_OPTIONS.some(o => o.value === f.status)) return 'Chọn trạng thái.';
  if (!SHIFT_OPTIONS.some(o => o.value === f.shift)) return 'Chọn ca làm việc.';
  if (isNightNv(f) && !NIGHT_PCTS.includes(f.nightPct)) return 'Chọn phụ cấp ca đêm.';
  if (!DATE.test(f.start)) return 'Nhập ngày vào làm.';
  if (f.birthday && !DATE.test(f.birthday)) return 'Ngày sinh chưa đúng.';
  return '';
}

/**
 * Điều còn thiếu hoặc sai của biểu mẫu Thêm, '' khi tạo được. `taken`: tên đăng nhập đã có; `levels`: bậc đang chọn được.
 * Câu trả về chỉ hiện cho tên đăng nhập trùng (người dùng không tự thấy được); các ô khác chỉ làm nút Tạo mờ.
 */
export function createProblem(f: StaffForm, taken: string[], levels: Option[]): string {
  if (!f.name.trim()) return 'Nhập họ tên.';
  if (!f.username || !USERNAME.test(f.username)) return 'Nhập tên đăng nhập.';
  if (taken.includes(f.username)) return `Tên đăng nhập ${f.username} đã có người dùng.`;
  if (f.password.length < PASSWORD_MIN) return `Mật khẩu ban đầu cần ít nhất ${PASSWORD_MIN} ký tự.`;
  return editProblem(f, levels);
}

// Phần hồ sơ và hợp đồng chung của thân POST và PUT.
function profileAndContract(f: StaffForm) {
  const shift: { type: string; allowancePct?: number } = { type: f.shift };
  if (isNightNv(f)) shift.allowancePct = Number(f.nightPct);
  return {
    profile: { name: splitName(f.name), birthday: f.birthday || null },
    contract: {
      status: f.type === 'nv' ? f.status : f.type,
      effectiveFrom: f.start,
      position: { type: f.type, level: Number(f.level), jobTitle: f.job.trim() || null },
      shift
    },
    departmentId: f.dept ? Number(f.dept) : null
  };
}

/** Thân POST /api/v2/employees. Hợp đồng, bảo hiểm, người phụ thuộc không gửi: BE lấy mặc định của loại. */
export function newStaffBody(f: StaffForm) {
  const { profile, contract, departmentId } = profileAndContract(f);
  return { account: { username: f.username, password: f.password, roles: ['staff'] }, profile, contract, departmentId };
}

/** Thân PUT /api/v2/employees/:username: không có phần account nên tên đăng nhập, mật khẩu, vai trò giữ nguyên. */
export function editStaffBody(f: StaffForm) {
  const body = profileAndContract(f);
  if (f.shiftFrom) (body.contract.shift as { effectiveFrom?: string }).effectiveFrom = f.shiftFrom;
  return body;
}

/** Biểu mẫu Sửa hồ sơ dựng từ hồ sơ BE trả (GET /api/v2/employees/:username). */
export function formFromEmployee(e: EmployeeDTO): StaffForm {
  const { position, shift, status } = e.contract;
  const pct = String((shift as { allowancePct?: number }).allowancePct ?? '');
  const nightNv = position.type === 'nv' && shift.type === 'NIGHT';
  return {
    name: e.profile.fullName || '',
    username: e.account.username,
    password: '',
    type: position.type,
    level: String(position.level),
    status: position.type === 'nv' && (status === 'thuviec' || status === 'nv') ? status : '',
    job: position.jobTitle || '',
    shift: shift.type,
    nightPct: nightNv && NIGHT_PCTS.includes(pct) ? pct : '',
    shiftFrom: '',
    start: e.contract.effectiveFrom || e.account.createdAt.slice(0, 10),
    birthday: e.profile.birthday || '',
    dept: e.departmentId ? String(e.departmentId) : ''
  };
}
