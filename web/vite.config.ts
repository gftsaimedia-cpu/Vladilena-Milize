import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Dev: /api chuyển sang BE (VITE_API_TARGET, mặc định http://127.0.0.1:3000) để cookie phiên cùng nguồn.
// `npm run dev:mock` (--mode mock) chạy bằng dữ liệu giả trong src/mock, không cần BE. npm run build ghi vào web/dist.

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // __MOCK__ được thế thẳng (true/false) vào từng chỗ dùng nên nhánh dữ liệu giả bị loại ngay tại chỗ ở bản thật.
  define: {
    'import.meta.env.VITE_DATA': JSON.stringify(mode === 'mock' ? 'mock' : 'api'),
    __MOCK__: JSON.stringify(mode === 'mock')
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000' } }
  },
  // src/mock dựng dữ liệu ngay ở cấp module (vòng lặp, Map); coi là không có side effect để module nào không còn
  // ai dùng (bản thật) bị loại hẳn khỏi bundle.
  build: {
    rolldownOptions: { treeshake: { moduleSideEffects: id => !id.replace(/\\/g, '/').includes('/src/mock/') } }
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true }
}));
