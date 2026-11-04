// Trả dữ liệu giả như một lời gọi máy chủ: bản sao riêng, để màn sửa thoải mái mà không đụng bản gốc.
export function respond<T>(value: T): Promise<T> {
  return Promise.resolve(structuredClone(value));
}
