<script setup lang="ts">
// Khối báo tải lỗi của một màn Admin: câu chung, câu lỗi máy chủ trả về (ApiError, tiếng Việt), nút "Thử lại" phát retry
// để màn cha tải lại. Dùng thay cho trang trắng khi useLoad có error:
//   <PageLoadError v-if="error" :error="error" @retry="reload" />
import { ApiError } from '@/services/http';

defineProps<{ error: unknown; what?: string }>();
defineEmits<{ retry: [] }>();

const messageOf = (e: unknown) => (e instanceof ApiError && e.message) || 'Máy chủ không trả lời, thử lại sau ít phút.';
</script>

<template>
  <div class="card pg-err" role="alert">
    <div class="pg-err-t">Không tải được {{ what || 'dữ liệu' }}</div>
    <div class="pg-err-m">{{ messageOf(error) }}</div>
    <button type="button" class="btn" @click="$emit('retry')">Thử lại</button>
  </div>
</template>

<style scoped>
.pg-err {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 20px 24px;
  margin-top: 16px;
}
.pg-err-t {
  font-weight: 600;
}
.pg-err-m {
  color: var(--muted);
  font-size: 14px;
  margin-bottom: 8px;
}
</style>
