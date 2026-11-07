// Tab Yêu cầu (06/11): danh sách mọi đơn, kể cả đơn đã xử lý. Duyệt / từ chối vẫn qua useShellStore().decide.
// Máy chủ thật: hai lần đọc song song, GET /api/v2/requests?status=PENDING&limit=200 (mọi đơn chờ, kể cả đơn cũ hơn
// 200 đơn gần nhất) và GET /api/v2/requests?limit=200 (đơn gần đây, mọi trạng thái), cùng danh sách nhân viên để có họ tên,
// chức danh, phòng ban, trạng thái nhân sự. requestRowsFromDto bỏ trùng và xếp thứ tự.
// Dữ liệu giả: mock/admin-requests.ts.
import { reqCountsFromDto, requestRowsFromDto, type ReqCounts, type ReqRow } from '@/builders/api/admin-requests';
import { mockRequestCounts, mockRequests } from '@/mock/admin-requests';
import { respond } from '@/mock/respond';
import { peopleIndex } from './admin-main';
import { serverNowMs } from '@/utils/server-clock';
import { api, qs } from './http';

const LIMIT = 200;

/** Danh sách đơn kèm số đếm do BE tính (thẻ trạng thái, đơn chờ theo loại, đơn chờ cũ nhất): màn chỉ hiện, không tự đếm. */
export type RequestList = { rows: ReqRow[]; counts: ReqCounts };

export async function getRequests(): Promise<RequestList> {
  if (__MOCK__) return respond({ rows: mockRequests(), counts: mockRequestCounts() });
  const [pending, recent, people] = await Promise.all([
    api.get(`/requests${qs({ status: 'PENDING', limit: LIMIT })}`),
    api.get(`/requests${qs({ limit: LIMIT })}`),
    peopleIndex()
  ]);
  // Phòng ban và trạng thái nhân sự lấy từ danh sách nhân viên (BE trả departmentName, staffStatus).
  const rows = requestRowsFromDto([...(pending.items || []), ...(recent.items || [])], people, serverNowMs()).map(r => {
    const who = people.get(r.personId);
    return who ? { ...r, dept: who.dept ?? r.dept, ps: who.ps ?? r.ps } : r;
  });
  return { rows, counts: reqCountsFromDto(recent.counts) };
}
