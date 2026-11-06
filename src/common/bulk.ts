// Quy ước chung của các route chọn nhiều (docs/fe-yeu-cau/admin-loc-nhan-su-chon-nhieu--api-be.md §4.1):
// từ 1 tới 200 phần tử, không trùng; mỗi phần tử chạy riêng, lỗi một phần tử không kéo các phần tử khác;
// kết quả 200 { done, failed }.
import { BadRequestError, HttpError } from './exceptions/http.exception';

export const BULK_MAX = 200;

export interface BulkFailure {
  id: string;
  code: string;
  message: string;
}

const invalid = (message: string): BadRequestError => new BadRequestError(message, { code: 'INVALID_IDS' });

function requireArray(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) throw invalid('Danh sách phải là một mảng');
  if (raw.length === 0) throw invalid('Danh sách không được rỗng');
  if (raw.length > BULK_MAX) throw invalid(`Danh sách tối đa ${BULK_MAX} phần tử`);
  return raw;
}

/** Danh sách mã (chuỗi không rỗng, đã cắt khoảng trắng, không trùng); sai thì 400 INVALID_IDS. */
export function requireBulkIds(raw: unknown): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of requireArray(raw)) {
    const id = typeof item === 'string' ? item.trim() : '';
    if (!id) throw invalid('Mã phải là chuỗi không rỗng');
    if (seen.has(id)) throw invalid(`Mã bị trùng: ${id}`);
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Danh sách đối tượng; `keyOf` trả khoá duy nhất của phần tử hoặc null nếu phần tử sai. Sai hay trùng khoá thì 400 INVALID_IDS. */
export function requireBulkItems<T>(raw: unknown, keyOf: (item: T) => string | null): T[] {
  const seen = new Set<string>();
  const items: T[] = [];
  for (const item of requireArray(raw)) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw invalid('Mỗi phần tử phải là một đối tượng');
    const key = keyOf(item as T);
    if (key === null) throw invalid('Có phần tử thiếu hoặc sai trường');
    if (seen.has(key)) throw invalid(`Phần tử bị trùng: ${key}`);
    seen.add(key);
    items.push(item as T);
  }
  return items;
}

/** Mã và câu lỗi của một phần tử thất bại: lỗi HTTP giữ mã của nó, lỗi thường thành BAD_REQUEST. */
export function bulkFailureOf(err: unknown): { code: string; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof HttpError) return { code: String(err.details?.code ?? 'ERROR'), message };
  return { code: 'BAD_REQUEST', message };
}

/** Chạy tuần tự từng phần tử; lỗi nào vào `failed` kèm `idOf` (và `extraOf`) của phần tử, không dừng cả lô. */
export async function runBulk<I, R>(
  inputs: readonly I[],
  idOf: (input: I) => string,
  work: (input: I) => Promise<R>,
  failureOf: (err: unknown) => { code: string; message: string } = bulkFailureOf,
  extraOf: (input: I) => Record<string, unknown> = () => ({})
): Promise<{ done: R[]; failed: Array<BulkFailure & Record<string, unknown>> }> {
  const done: R[] = [];
  const failed: Array<BulkFailure & Record<string, unknown>> = [];
  for (const input of inputs) {
    try {
      done.push(await work(input));
    } catch (err) {
      failed.push({ ...extraOf(input), id: idOf(input), ...failureOf(err) });
    }
  }
  return { done, failed };
}
