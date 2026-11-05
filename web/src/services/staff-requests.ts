// Dịch vụ tạo và huỷ yêu cầu của nhân viên (spec staff-requests 2.1, 2.2, 2.6). Dữ liệu giả: mock/staff-requests qua
// respond(). Máy chủ thật chưa nối ("làm phần mock trước, nối API thì để BE"): mọi hàm trả notConnected().
// Server từ chối thì hàm ném ApiError mang câu lỗi của server (DAY_CONFLICT có code riêng).
import { respond } from '@/mock/respond';
import {
  cancelRequest as cancelMock,
  createRequest as createMock,
  previewRequest as previewMock,
  requestContext
} from '@/mock/staff-requests';
import type { PreviewResult, Refusal, RequestContext, RequestDraft, RequestKind } from '@/mock/staff-requests-types';
import { notConnected } from './data-mode';
import { ApiError } from './http';

const refused = (r: Refusal) =>
  Promise.reject(new ApiError(r.code ? 409 : 400, r.message, { code: r.code ?? 'BAD_REQUEST' }));

// Móc cho test, chỉ khi chạy dữ liệu giả (như __mockLatencyMs của mock/respond): đặt trong trang
// window.__mockRequestContextError = '<câu>' thì request-context bị từ chối với câu đó, như khi mất mạng.
const mockContextError = () => (globalThis as { __mockRequestContextError?: string }).__mockRequestContextError || '';

export async function getRequestContext(): Promise<RequestContext> {
  if (__MOCK__) {
    const error = mockContextError();
    return error ? Promise.reject(new ApiError(503, error, { code: 'UNAVAILABLE' })) : respond(requestContext());
  }
  return notConnected();
}

/** Luôn trả kết quả (spec 2.2): `ok: false` kèm câu lỗi khi đơn chưa gửi được. */
export async function previewRequest<K extends RequestKind>(kind: K, draft: RequestDraft[K]): Promise<PreviewResult<K>> {
  if (__MOCK__) return respond(previewMock(kind, draft));
  return notConnected();
}

export async function createRequest<K extends RequestKind>(kind: K, draft: RequestDraft[K]): Promise<{ id: string }> {
  if (__MOCK__) return respond(createMock(kind, draft)).then(r => (r.ok ? { id: r.id } : refused(r)));
  return notConnected();
}

export async function cancelRequest(id: string): Promise<void> {
  if (__MOCK__) return respond(cancelMock(id)).then(r => (r.ok ? undefined : refused(r)));
  return notConnected();
}
