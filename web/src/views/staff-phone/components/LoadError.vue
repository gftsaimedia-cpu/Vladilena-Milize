<script setup lang="ts">
// Khối báo tải lỗi của một màn (hay một cột) nhân viên, dùng ở điện thoại và máy tính: câu chung, câu lỗi máy chủ trả về,
// nút "Thử lại" phát retry để màn cha tải lại (thường là reload() của useLoad). Chỉ ApiError (câu tiếng Việt của máy chủ
// hay của http.ts) được hiện nguyên văn; lỗi khác (lỗi lập trình) hiện câu chung. back (nhãn tháng tải được gần nhất, vd.
// 'Tháng 11/2026') thì thêm nút "Quay về tháng 11/2026" phát back: màn đổi tháng bị lỗi không bị kẹt ở tháng đó.
//   <LoadError v-if="error" :error="error" :back="backLabel" @retry="retry" @back="goBack" />
import { ApiError } from '@/services/http';

withDefaults(defineProps<{ error: unknown; back?: string | null }>(), { back: null });
defineEmits<{ retry: []; back: [] }>();

const messageOf = (e: unknown) => (e instanceof ApiError && e.message) || 'Máy chủ không trả lời, thử lại sau ít phút.';
</script>

<template>
  <div class="card lerr" role="alert">
    <div class="lerr-t">Không tải được dữ liệu</div>
    <div class="mut">{{ messageOf(error) }}</div>
    <div class="lerr-acts">
      <button type="button" class="lerr-b" data-retry @click="$emit('retry')">Thử lại</button>
      <button v-if="back" type="button" class="lerr-b lerr-back" @click="$emit('back')">Quay về {{ back.toLowerCase() }}</button>
    </div>
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
.lerr-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.lerr-b {
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: var(--surface-dark);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.lerr-back {
  border: 1px solid var(--border);
  background: transparent;
  color: inherit;
}
</style>
