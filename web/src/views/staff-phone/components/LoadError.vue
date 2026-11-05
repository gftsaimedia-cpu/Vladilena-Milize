<script setup lang="ts">
// Khối báo tải lỗi của một màn (hay một cột) nhân viên, dùng ở điện thoại và máy tính: câu chung, câu lỗi máy chủ trả về,
// nút "Thử lại" phát retry để màn cha tải lại (thường là reload() của useLoad). Chỉ ApiError (câu tiếng Việt của máy chủ
// hay của http.ts) được hiện nguyên văn; lỗi khác (lỗi lập trình) hiện câu chung.
//   <LoadError v-if="error" :error="error" @retry="reload" />
import { ApiError } from '@/services/http';

defineProps<{ error: unknown }>();
defineEmits<{ retry: [] }>();

const messageOf = (e: unknown) => (e instanceof ApiError && e.message) || 'Máy chủ không trả lời, thử lại sau ít phút.';
</script>

<template>
  <div class="card lerr" role="alert">
    <div class="lerr-t">Không tải được dữ liệu</div>
    <div class="mut">{{ messageOf(error) }}</div>
    <button type="button" class="lerr-b" @click="$emit('retry')">Thử lại</button>
  </div>
</template>

<style scoped>
.lerr {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 16px;
}
.lerr-t {
  font-weight: 600;
}
.lerr-b {
  height: 40px;
  margin-top: 8px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: var(--surface-dark);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
