// Công tắc nguồn dữ liệu: VITE_DATA=mock (npm run dev:mock, test Playwright) dùng src/mock; mặc định là máy chủ thật.
// Trong mã, dùng thẳng __MOCK__ (Vite thế true/false tại chỗ) để nhánh dữ liệu giả bị loại khỏi bản build thật;
// import MOCK từ đây thì Rolldown không gập được qua ranh giới module.
import { ApiError } from './http';

export const MOCK = __MOCK__;

/** Màn chưa có API thật: báo lỗi rõ ràng thay vì hiện số giả. */
export function notConnected(): Promise<never> {
  return Promise.reject(new ApiError(501, 'Màn này chưa nối dữ liệu thật.', { code: 'not_connected' }));
}
