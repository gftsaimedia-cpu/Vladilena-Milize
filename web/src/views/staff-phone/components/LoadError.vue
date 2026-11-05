<script setup lang="ts">
// Khối báo tải lỗi của một màn (hay một cột) nhân viên, dùng ở điện thoại và máy tính: câu chung, câu lỗi máy chủ trả về,
// nút "Thử lại" phát retry để màn cha tải lại (thường là retry của useRetry). Chỉ ApiError (câu tiếng Việt của máy chủ
// hay của http.ts) được hiện nguyên văn; lỗi khác (lỗi lập trình) hiện câu chung.
// back (tuỳ chọn, chữ trên nút, vd. "Quay về tháng 10/2026"): lỗi lúc đổi tháng thì có thêm nút này, bấm thì phát back.
// focus() (qua ref) đưa focus vào nút Thử lại, để useRetry trả focus khi tải lại vẫn lỗi.
//   <LoadError v-if="error" ref="errBox" :error="error" :back="back?.text" @retry="retry" @back="…" />
import { ref } from 'vue';
import { ApiError } from '@/services/http';

defineProps<{ error: unknown; back?: string }>();
defineEmits<{ retry: []; back: [] }>();

const again = ref<HTMLButtonElement | null>(null);
defineExpose({ focus: () => again.value?.focus() });

const messageOf = (e: unknown) => (e instanceof ApiError && e.message) || 'Máy chủ không trả lời, thử lại sau ít phút.';
</script>

<template>
  <div class="card lerr" role="alert">
    <div class="lerr-t">Không tải được dữ liệu</div>
    <div class="mut">{{ messageOf(error) }}</div>
    <div class="lerr-acts">
      <button ref="again" type="button" class="lerr-b" @click="$emit('retry')">Thử lại</button>
      <button v-if="back" type="button" class="lerr-b lerr-back" @click="$emit('back')">{{ back }}</button>
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
  border: 1px solid var(--control);
  background: transparent;
  color: var(--text);
}
</style>
