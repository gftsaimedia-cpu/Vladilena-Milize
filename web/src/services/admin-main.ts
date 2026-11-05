// Dịch vụ của nhóm admin-main: Tổng quan và các lớp nổi của vỏ Admin (chuông, xử lý việc chờ).
// Máy chủ thật: chuông và việc chờ đọc GET /api/v2/requests, duyệt qua PATCH /requests/:id/review;
// Tổng quan ghép từ các API đó. Dữ liệu giả: mock/.
import { inboxFromRequests, type PersonInfo } from '@/builders/api/inbox';
import { overviewFrom, recentWorkdays } from '@/builders/api/overview';
import { peopleOf, type EmployeeDTO } from '@/builders/api/staff';
import { SYSTEM_NOTES, pendingInbox, resolveInboxItem, type InboxItem, type SystemNote } from '@/mock/inbox';
import { overviewView, type OverviewView } from '@/mock/overview';
import { respond } from '@/mock/respond';
import { usePeriodStore } from '@/stores/period';
import { getPayroll } from './admin-payroll';
import { notConnected } from './data-mode';
import { ApiError, api, qs } from './http';
import { changePassword as sessionChangePassword, logout as sessionLogout } from './session';

const fetchEmployees = (): Promise<EmployeeDTO[]> =>
  api('GET', '/employees').then(
    r => r.employees || [],
    () => []
  );

export type DecisionVerb = 'approve' | 'reject' | 'remind' | 'declare';

// Việc chờ của lần đọc chuông gần nhất (máy chủ thật), để trả lại việc vừa xử lý cho câu báo.
const lastInbox = new Map<string, InboxItem>();

// Xử lý một việc chờ; mọi nơi gọi qua useShellStore().decide. Trả việc vừa xử lý, hoặc null nếu việc đã được xử lý.
// Dữ liệu giả: bỏ việc khỏi mock/inbox (bốn động từ như nhau), ghi chú không lưu. Máy chủ thật: duyệt / từ chối qua
// PATCH /requests/:id/review, kèm `note` khi Admin có ghi chú cho nhân viên; "nhắc" và "khai thay" chưa có API.
export async function resolveRequest(
  id: string,
  verb: DecisionVerb = 'approve',
  note?: string
): Promise<InboxItem | null> {
  if (__MOCK__) return respond(resolveInboxItem(id));
  if (verb !== 'approve' && verb !== 'reject') return notConnected();
  const body: { action: 'APPROVE' | 'REJECT'; note?: string } = { action: verb === 'approve' ? 'APPROVE' : 'REJECT' };
  const text = note?.trim();
  if (text) body.note = text;
  try {
    await api.patch(`/requests/${encodeURIComponent(id)}/review`, body);
  } catch (e) {
    // 404 hoặc 400 "không còn chờ duyệt": người khác vừa xử lý
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    // Duyệt bị chặn (409 DAY_CONFLICT) hoặc lỗi khác của máy chủ: hiện nguyên văn câu báo rồi ném lại
    if (e instanceof ApiError) toast.error(e.message);
    throw e;
  }
  const hit = lastInbox.get(id) ?? null;
  lastInbox.delete(id);
  return hit ?? ({ id, name: 'nhân viên' } as InboxItem);
}
export const ALREADY_HANDLED = 'Yêu cầu này đã được xử lý.';
const DECISION_TEXT: Record<DecisionVerb, (name: string) => string> = {
  approve: name => `Đã duyệt yêu cầu của ${name}.`,
  reject: name => `Đã từ chối yêu cầu của ${name}.`,
  remind: name => `Đã nhắc ${name} giải trình.`,
  declare: name => `Đã ghi nhận khai thay cho ${name}.`
};
/** Câu báo sau khi xử lý một việc (spec mục 1.3). */
export const decisionText = (verb: DecisionVerb, name: string) => DECISION_TEXT[verb](name);

// ---------- Tổng quan ----------
// Máy chủ thật: ghép từ bảng lương tháng, nhân sự, bảng công 6 ngày làm việc gần nhất, đơn đang chờ và trạng thái kỳ.
export async function getOverview(month: string): Promise<OverviewView> {
  if (__MOCK__) return respond(overviewView(month));
  const vn = new Date(Date.now() + 7 * 3600000).toISOString();
  const today = vn.slice(0, 10);
  const days = recentWorkdays(today);
  const [payroll, employees, ts, inbox] = await Promise.all([
    getPayroll(month),
    fetchEmployees(),
    api('GET', `/attendance/timesheets${qs({ startDate: days[0], endDate: today })}`),
    getInbox()
  ]);
  return overviewFrom({
    month,
    today,
    now: vn.slice(11, 16),
    payroll,
    employees,
    timesheets: ts.timesheets || [],
    approvals: inbox.items,
    periodState: usePeriodStore().strip.state
  });
}

// ---------- Lớp nổi của vỏ Admin ----------
// Chuông: mọi việc còn chờ. Dữ liệu giả kèm 3 tin hệ thống tĩnh; máy chủ thật chưa có tin hệ thống.
const INBOX_LIMIT = 200;
export async function getInbox(): Promise<{ items: InboxItem[]; notes: SystemNote[] }> {
  if (__MOCK__) return respond({ items: pendingInbox(), notes: SYSTEM_NOTES });
  const [res, people] = await Promise.all([
    api.get(`/requests${qs({ status: 'PENDING', limit: INBOX_LIMIT })}`),
    peopleIndex()
  ]);
  const items = inboxFromRequests(res.items || [], people, Date.now());
  lastInbox.clear();
  for (const item of items) lastInbox.set(item.id, item);
  return { items, notes: [] };
}

/** Số việc đang chờ (số trên chuông). */
export async function countPending(): Promise<number> {
  const res = await api.get(`/requests${qs({ status: 'PENDING', limit: 1 })}`);
  return Number(res.total) || 0;
}

// Họ tên và chức danh theo tên đăng nhập và uuid (đơn iSAT lưu theo uuid).
async function peopleIndex(): Promise<Map<string, PersonInfo>> {
  return peopleOf(await fetchEmployees());
}

export const changePassword = ({ current, next }: any) => sessionChangePassword(current, next);

export const logout = () => sessionLogout();
