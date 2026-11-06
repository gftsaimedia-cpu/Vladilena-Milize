// Tab Yêu cầu (06/11): danh sách mọi đơn, kể cả đơn đã xử lý. Duyệt / từ chối vẫn qua useShellStore().decide.
// Máy chủ thật: hai lần đọc song song, GET /api/v2/requests?status=PENDING&limit=200 (mọi đơn chờ, kể cả đơn cũ hơn
// 200 đơn gần nhất) và GET /api/v2/requests?limit=200 (đơn gần đây, mọi trạng thái), cùng danh sách nhân viên để có họ tên,
// chức danh. requestRowsFromDto bỏ trùng và xếp thứ tự. Máy chủ chưa trả phòng ban cho đơn nên ô phòng ban của màn khoá.
// Dữ liệu giả: mock/admin-requests.ts.
import { requestRowsFromDto, type ReqRow } from '@/builders/api/admin-requests';
import { mockRequests } from '@/mock/admin-requests';
import { respond } from '@/mock/respond';
import { peopleIndex } from './admin-main';
import { api, qs } from './http';

const LIMIT = 200;

export async function getRequests(): Promise<ReqRow[]> {
  if (__MOCK__) return respond(mockRequests());
  const [pending, recent, people] = await Promise.all([
    api.get(`/requests${qs({ status: 'PENDING', limit: LIMIT })}`),
    api.get(`/requests${qs({ limit: LIMIT })}`),
    peopleIndex()
  ]);
  return requestRowsFromDto([...(pending.items || []), ...(recent.items || [])], people, Date.now());
}
