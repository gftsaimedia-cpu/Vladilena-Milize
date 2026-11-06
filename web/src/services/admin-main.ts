// Dịch vụ của nhóm admin-main: Tổng quan và các lớp nổi của vỏ Admin (chuông, xử lý việc chờ).
// Máy chủ thật: chuông và việc chờ đọc GET /api/v2/requests và GET /requests/explanations-due (việc "nhắc giải trình"),
// duyệt qua PATCH /requests/:id/review, nhắc qua POST /requests/explanations-due/remind;
// Tổng quan đọc GET /overview. Dữ liệu giả: mock/.
import { inboxFromDue, inboxFromRequests, type DueDTO, type PersonInfo, type RequestDTO } from '@/builders/api/inbox';
import { toast } from '@/components/shell/toast';
import { overviewFrom } from '@/builders/api/overview';
import { peopleOf, type EmployeeDTO } from '@/builders/api/staff';
import {
  SYSTEM_NOTES,
  pendingInbox,
  remindInboxItem,
  resolveInboxItem,
  type InboxItem,
  type SystemNote
} from '@/mock/inbox';
import { overviewDto, type OverviewDTO, type OverviewView } from '@/mock/overview';
import { payrollView } from '@/mock/payroll';
import { personStatusOf } from '@/mock/people-status';
import { respond } from '@/mock/respond';
import { usePeriodStore } from '@/stores/period';
import { ApiError, api, qs } from './http';
import { changePassword as sessionChangePassword, logout as sessionLogout } from './session';

const fetchEmployees = (): Promise<EmployeeDTO[]> =>
  api('GET', '/employees').then(
    r => r.employees || [],
    () => []
  );

export type DecisionVerb = 'approve' | 'reject' | 'remind';

// Việc chờ của lần đọc chuông gần nhất (máy chủ thật), để trả lại việc vừa xử lý cho câu báo.
const lastInbox = new Map<string, InboxItem>();

// Xử lý một việc chờ; mọi nơi gọi qua useShellStore().decide. Trả việc vừa xử lý, hoặc null nếu việc đã được xử lý.
// Dữ liệu giả: duyệt / từ chối bỏ việc khỏi mock/inbox, ghi chú không lưu; "nhắc" ghi giờ nhắc lên việc và việc ở lại.
// Máy chủ thật: duyệt / từ chối qua PATCH /requests/:id/review, kèm `note` khi Admin có ghi chú cho nhân viên;
// "nhắc": POST /requests/explanations-due/remind với { employeeId, date } của việc đã đọc, việc ở lại kèm giờ nhắc mới.
export async function resolveRequest(
  id: string,
  verb: DecisionVerb = 'approve',
  note?: string
): Promise<InboxItem | null> {
  if (__MOCK__) return respond(verb === 'remind' ? remindInboxItem(id) : resolveInboxItem(id));
  if (verb === 'remind') return remindDue(id);
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
// Nhắc giải trình (máy chủ thật): id việc là `due:<employeeId>:<date>`, lấy employeeId và date từ việc đã đọc. Việc không còn trong
// lần đọc gần nhất (chuông chưa tải lại) thì không có gì để nhắc: null như "đã được xử lý". Lỗi của máy chủ (vd. nhân viên vừa
// gửi giải trình nên ngày không còn cần) hiện nguyên văn câu báo rồi ném lại.
async function remindDue(id: string): Promise<InboxItem | null> {
  const item = lastInbox.get(id);
  if (!item || item.action !== 'remind') return null;
  try {
    const { remindedAt } = await api.post('/requests/explanations-due/remind', { employeeId: item.personId, date: item.days[0] });
    const reminded = { ...item, remindedAt };
    lastInbox.set(id, reminded);
    return reminded;
  } catch (e) {
    if (e instanceof ApiError) toast.error(e.message);
    throw e;
  }
}
export const ALREADY_HANDLED = 'Yêu cầu này đã được xử lý.';
const DECISION_TEXT: Record<DecisionVerb, (name: string) => string> = {
  approve: name => `Đã duyệt yêu cầu của ${name}.`,
  reject: name => `Đã từ chối yêu cầu của ${name}.`,
  remind: name => `Đã nhắc ${name} giải trình.`
};
/** Câu báo sau khi xử lý một việc (spec mục 1.3). */
export const decisionText = (verb: DecisionVerb, name: string) => DECISION_TEXT[verb](name);

// ---------- Tổng quan ----------
// Máy chủ thật: GET /overview?month=&days= (BE tính hết số liệu, danh sách và số đếm việc cần duyệt); builder chỉ ánh xạ.
// Chi tiết cửa sổ duyệt (head / sub / facts) của đơn chờ lấy từ GET /requests khớp id; việc nhắc giải trình chỉ cần id
// `due:<employeeId>:<date>` để nhắc (ghi vào lastInbox như chuông). Lỗi của phần chi tiết không làm mất màn.
const OVERVIEW_DAYS = 6;
export async function getOverview(month: string): Promise<OverviewView> {
  if (__MOCK__) {
    const details = new Map(pendingInbox().map(i => [i.id, i]));
    const view = overviewFrom(overviewDto(month), details);
    // DTO giả giữ đúng dạng phản hồi BE (chưa có phòng ban / trạng thái nhân sự): gắn hai trường cho bộ lọc của thẻ bảng lương.
    const board = payrollView(month);
    const deptOf = new Map(board.empty ? [] : board.lines.map(l => [l.id, l.dept]));
    view.payroll.rows = view.payroll.rows.map(r => ({ ...r, dept: deptOf.get(r.id), ps: personStatusOf(r.name) }));
    return respond(view);
  }
  const now = Date.now();
  const [dto, pending] = await Promise.all([
    api.get(`/overview${qs({ month, days: OVERVIEW_DAYS })}`) as Promise<OverviewDTO>,
    api.get(`/requests${qs({ status: 'PENDING', limit: INBOX_LIMIT })}`).then(
      r => (r.items || []) as RequestDTO[],
      () => [] as RequestDTO[]
    )
  ]);
  const details = new Map(inboxFromRequests(pending, new Map(), now).map(i => [i.id, i]));
  const view = overviewFrom(dto, details);
  for (const item of view.approvals.items) {
    if (item.action !== 'remind') continue;
    // id việc nhắc: due:<employeeId>:<date>; nhắc giải trình cần employeeId (uuid) và ngày.
    lastInbox.set(item.id, { ...item, personId: item.id.split(':')[1] ?? item.personId });
  }
  return view;
}

// ---------- Lớp nổi của vỏ Admin ----------
// Chuông: mọi việc còn chờ. Dữ liệu giả kèm 3 tin hệ thống tĩnh; máy chủ thật chưa có tin hệ thống.
const INBOX_LIMIT = 200;
export async function getInbox(): Promise<{ items: InboxItem[]; notes: SystemNote[] }> {
  if (__MOCK__) return respond({ items: pendingInbox(), notes: SYSTEM_NOTES });
  const [res, due, people] = await Promise.all([
    api.get(`/requests${qs({ status: 'PENDING', limit: INBOX_LIMIT })}`),
    // Lỗi của danh sách nhắc giải trình không làm mất đơn chờ duyệt: chuông vẫn hiện đơn.
    api.get('/requests/explanations-due').then(
      r => (r.items || []) as DueDTO[],
      () => [] as DueDTO[]
    ),
    peopleIndex()
  ]);
  const now = Date.now();
  const items = [...inboxFromDue(due, people, now), ...inboxFromRequests(res.items || [], people, now)];
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
