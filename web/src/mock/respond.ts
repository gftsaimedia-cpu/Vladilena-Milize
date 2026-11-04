// Trả dữ liệu giả như một lời gọi máy chủ: bản sao riêng, để màn sửa thoải mái mà không đụng bản gốc.
// Móc cho test: đặt window.__mockLatencyMs (ms) trong trang thì mọi lời gọi giả trả muộn chừng đó, để thử đường chạy chậm.
export function respond<T>(value: T): Promise<T> {
  const copy = structuredClone(value);
  const ms = Number((globalThis as { __mockLatencyMs?: number }).__mockLatencyMs) || 0;
  return ms ? new Promise(resolve => setTimeout(() => resolve(copy), ms)) : Promise.resolve(copy);
}
