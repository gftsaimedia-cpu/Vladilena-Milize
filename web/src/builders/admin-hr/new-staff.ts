// Hộp "Thêm nhân sự" (Admin): biểu mẫu → thân POST /api/v2/employees. Hàm thuần, import tương đối để chạy được bằng
// node:test. Nút Tạo chỉ bật khi createProblem trả '' (ngăn trước, không để máy chủ báo lỗi sau).
// BE đọc họ tên ở profile.name { familyName, givenName }; vai trò luôn là Nhân viên (đổi ở Phân quyền › Tài khoản).
import { inForce, type TypeRow } from '../api/catalog';

export type NewStaffForm = {
  name: string;
  username: string;
  password: string;
  type: string; // mã loại: tts | ctv | nv
  level: string; // số bậc dạng chữ ('1'), '' khi chưa chọn
  status: string; // chỉ NV: thuviec | nv
  job: string;
  shift: string; // NORMAL | FLEX | NIGHT
  nightPct: string; // chỉ NV ca đêm: '40' | '60'
  start: string; // 'YYYY-MM-DD'
  birthday: string; // 'YYYY-MM-DD' hoặc ''
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

export const emptyNewStaff = (today: string): NewStaffForm => ({
  name: '',
  username: '',
  password: '',
  type: '',
  level: '',
  status: '',
  job: '',
  shift: 'NORMAL',
  nightPct: '',
  start: today,
  birthday: ''
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

const isNightNv = (f: NewStaffForm) => f.type === 'nv' && f.shift === 'NIGHT';

/**
 * Điều còn thiếu hoặc sai của biểu mẫu, '' khi tạo được. `taken`: tên đăng nhập đã có; `levels`: bậc đang chọn được.
 * Câu trả về chỉ hiện cho tên đăng nhập trùng (người dùng không tự thấy được); các ô khác chỉ làm nút Tạo mờ.
 */
export function createProblem(f: NewStaffForm, taken: string[], levels: Option[]): string {
  if (!f.name.trim()) return 'Nhập họ tên.';
  if (!f.username || !USERNAME.test(f.username)) return 'Nhập tên đăng nhập.';
  if (taken.includes(f.username)) return `Tên đăng nhập ${f.username} đã có người dùng.`;
  if (f.password.length < PASSWORD_MIN) return `Mật khẩu ban đầu cần ít nhất ${PASSWORD_MIN} ký tự.`;
  if (!f.type) return 'Chọn loại nhân sự.';
  if (!levels.some(l => l.value === f.level)) return 'Chọn bậc.';
  if (f.type === 'nv' && !NV_STATUS_OPTIONS.some(o => o.value === f.status)) return 'Chọn trạng thái.';
  if (!SHIFT_OPTIONS.some(o => o.value === f.shift)) return 'Chọn ca làm việc.';
  if (isNightNv(f) && !NIGHT_PCTS.includes(f.nightPct)) return 'Chọn phụ cấp ca đêm.';
  if (!DATE.test(f.start)) return 'Nhập ngày vào làm.';
  if (f.birthday && !DATE.test(f.birthday)) return 'Ngày sinh chưa đúng.';
  return '';
}

/** Thân POST /api/v2/employees. Hợp đồng, bảo hiểm, người phụ thuộc không gửi: BE lấy mặc định của loại. */
export function newStaffBody(f: NewStaffForm) {
  const shift: { type: string; allowancePct?: number } = { type: f.shift };
  if (isNightNv(f)) shift.allowancePct = Number(f.nightPct);
  return {
    account: { username: f.username, password: f.password, roles: ['staff'] },
    profile: { name: splitName(f.name), birthday: f.birthday || null },
    contract: {
      status: f.type === 'nv' ? f.status : f.type,
      effectiveFrom: f.start,
      position: { type: f.type, level: Number(f.level), jobTitle: f.job.trim() || null },
      shift
    }
  };
}
