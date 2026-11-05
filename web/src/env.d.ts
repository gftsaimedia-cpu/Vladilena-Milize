/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mock' = chạy bằng dữ liệu giả trong src/mock; không đặt = gọi máy chủ thật. */
  readonly VITE_DATA?: 'mock' | 'api';
}

/** true khi chạy --mode mock (vite.config.ts thế hằng này lúc build). */
declare const __MOCK__: boolean;
