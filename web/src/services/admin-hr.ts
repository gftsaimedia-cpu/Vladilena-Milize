// Dịch vụ màn Nhân sự (danh sách, hồ sơ, thêm nhân sự, khoá/mở khoá, gán ca hàng loạt) nối máy chủ thật.
// Hình dạng dữ liệu trả về do builders/admin-hr/staff.js dựng; màn không đọc phản hồi thô.
import { api, ApiError, qs } from './http';
import {
  buildLeaveBalances,
  buildProfile,
  buildStaffOptions,
  buildStaffRows,
  filterStaffRows,
  requireRev,
  toNewStaffBody,
  toShiftBulkBody,
  toStaffPutBody,
  vnDate
} from '../builders/admin-hr/staff';

// Nguồn phụ (chức vụ, ca): người xem không có quyền đọc thì coi như không có; lỗi khác nổi lên.
const optional = (path?) =>
  api('GET', path).catch(e => {
    if (e instanceof ApiError && e.status === 403) return null;
    throw e;
  });
const seg = (u?) => encodeURIComponent(u);

const readLists = () =>
  Promise.all([
    api('GET', '/staff'),
    optional('/positions'),
    optional('/catalog/shifts'),
    optional('/settings/shifts')
  ]);

/** Danh sách nhân sự. loc: all | tts | ctv | nv | chua-co-ca | thieu-ngay | da-khoa. Lọc, tìm và chia trang làm ở máy khách. */
export async function getStaffList({ loc = 'all', q = '', page = 1 }: any = {}) {
  const [staff, positions, catalog, settingsShifts] = await readLists();
  const built = buildStaffRows(staff, positions, catalog, settingsShifts);
  return { summary: built.summary, counts: built.counts, ...filterStaffRows(built.rows, { loc, q, page }) };
}

/** Các lựa chọn của form hồ sơ: loại, bậc theo loại, ca, hợp đồng, bảo hiểm. */
export async function getStaffOptions() {
  const [positions, catalog, settingsShifts] = await Promise.all([
    api('GET', '/positions'),
    api('GET', '/catalog/shifts'),
    optional('/settings/shifts')
  ]);
  return buildStaffOptions(positions, catalog, settingsShifts);
}

/** Hồ sơ đầy đủ của một người (kèm ver.rev để lưu); null nếu không có người này. */
export async function getStaffProfile(username?) {
  const [staff, positions, catalog] = await Promise.all([
    api('GET', '/staff'),
    optional('/positions'),
    optional('/catalog/shifts')
  ]);
  const raw = ((staff && staff.staff) || []).find(s => s.username === String(username).toLowerCase());
  if (!raw) return null;
  const schedule = await optional(`/staff/${seg(raw.username)}/schedule`).catch(() => null);
  return { ...buildProfile(raw, positions, catalog, schedule), uuid: raw.uuid || null };
}

const catalogShifts = async () => {
  const res = await optional('/catalog/shifts');
  return (res && res.shifts) || [];
};

/** Tạo nhân sự: hồ sơ và tài khoản đăng nhập vai trò Nhân viên. */
export async function createStaff(form?) {
  const body = toNewStaffBody(form, await catalogShifts());
  const res = await api('POST', '/staff', body);
  let staff = res.staff || null;
  let leaveLookupFailed = false;
  if (!Number.isFinite(staff?.leave?.balance) && res.credentials?.username) {
    try {
      const current = await api('GET', '/staff');
      const persisted = ((current && current.staff) || []).find(s => s.username === res.credentials.username);
      if (persisted) staff = persisted;
      else leaveLookupFailed = true;
    } catch {
      leaveLookupFailed = true;
    }
  }
  return {
    ok: true,
    staff,
    leaveLookupFailed,
    created: !!res.created,
    credentials: res.credentials || null
  };
}

/** Lưu hồ sơ; form mang ver.rev của lần đọc hồ sơ. */
export async function saveStaffProfile(username?, form?) {
  requireRev(form.ver);
  const body = toStaffPutBody(form, form.ver, await catalogShifts());
  await api('PUT', `/staff/${seg(username)}`, body);
  return { ok: true };
}

/** Khoá tài khoản; ver là ver của hồ sơ đang mở. */
export async function lockStaff(username?, ver?) {
  await api('PUT', `/staff/${seg(username)}`, { locked: true, expectedRev: requireRev(ver) });
  return { ok: true };
}

/** Mở khoá tài khoản; ver là ver của hồ sơ đang mở. */
export async function unlockStaff(username?, ver?) {
  await api('PUT', `/staff/${seg(username)}`, { locked: false, expectedRev: requireRev(ver) });
  return { ok: true };
}

/** Gán cùng một ca (mã ngắn n1..g2) cho nhiều người; hiệu lực ngay. */
export async function assignShifts(usernames?, shift?) {
  const res = await api('PUT', '/staff/shift-bulk', toShiftBulkBody(usernames, shift));
  return { ok: true, updated: res.updated, unchanged: res.unchanged };
}

/** Tab Phép còn lại: phép năm tới hôm nay của mọi người có sổ phép (không phụ thuộc tháng). filter: all | neg | zero | adj. */
export async function getLeaveBalances(_month?, { filter = 'all', q = '', page = 1 }: any = {}) {
  const [staff, positions, me] = await Promise.all([api('GET', '/staff'), optional('/positions'), api('GET', '/me')]);
  return buildLeaveBalances(staff, positions, vnDate(me && me.serverNow), { filter, q, page });
}

/** Lịch sử thay đổi của một người, mới nhất trước: GET /employees/:uuid/trace?beforeId=&limit= -> { items: [{ id, at, actor, action, subject, before, after, reason }] }. */
export async function getEmployeeTrace(uuid?, { beforeId, limit }: any = {}) {
  const res = await api('GET', `/employees/${seg(uuid)}/trace${qs({ beforeId, limit })}`);
  return { items: res.items || [] };
}
