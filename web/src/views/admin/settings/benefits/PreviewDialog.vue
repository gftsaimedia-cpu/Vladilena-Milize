<script setup lang="ts">
// Hộp xem trước tác động của lần lưu: số người đổi, tổng thực lĩnh trước và sau, lỗi và cảnh báo của máy chủ; bấm Lưu mới ghi.
import { computed } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';

const props = defineProps({
  preview: { type: Object as () => any, required: true },
  saving: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'confirm']);

const money = (n?) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')} đ`;
const totals = computed(() => props.preview.totals);
</script>

<template>
  <AppModal title="Xem trước tác động" :width="560" :top="200" @close="emit('close')">
    <div v-for="e in preview.errors" :key="e.code + (e.key || '')" class="note err" style="margin-bottom: 8px">
      {{ e.message }}
    </div>
    <div v-for="w in preview.warnings" :key="w.code + (w.key || '')" class="note" style="margin-bottom: 8px">
      {{ w.message }}
    </div>
    <div v-if="totals" class="fld">
      <label>{{ totals.affected }} / {{ totals.people }} người đổi</label>
      <div>Thực lĩnh: {{ money(totals.before.net) }} → {{ money(totals.after.net) }}</div>
      <div>Tổng thu nhập: {{ money(totals.before.gross) }} → {{ money(totals.after.gross) }}</div>
    </div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button
        type="button"
        class="btn"
        :class="preview.ok ? 'pri' : 'off'"
        :disabled="!preview.ok || saving"
        @click="emit('confirm')"
      >
        Lưu
      </button>
    </template>
  </AppModal>
</template>
