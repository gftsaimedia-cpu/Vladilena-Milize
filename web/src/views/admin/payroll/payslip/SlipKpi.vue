<script setup lang="ts">
// Năm ô điểm KPI của một phiếu (spec 4.4). Gõ: làm sạch rồi báo `update` (phiếu tính lại ngay); rời ô: báo `save`.
import { KPI_LABELS } from '@/mock/payroll';
import { MOCK_KPI_WEIGHTS, type KpiPart, type KpiScores } from '@/mock/payroll-calc';

defineProps<{ scores: KpiScores; name: string }>();
const emit = defineEmits<{ update: [part: KpiPart, value: number | null]; save: [part: KpiPart] }>();

const PARTS = Object.keys(KPI_LABELS) as KpiPart[];
// Nhãn ngắn trên ô; trình đọc màn hình dùng tên đầy đủ (aria-label của ô).
const SHORT: Record<KpiPart, string> = {
  wework: 'Base Wework',
  user: 'Người dùng',
  peer: 'Đồng nghiệp',
  manager: 'Quản lý',
  self: 'Tự đánh giá'
};

// Dấu thập phân (, hoặc .) cắt bỏ nó và phần sau ("72,5" thành 72); ký tự khác không phải số thì bỏ riêng ("1a5" thành 15).
// Trên 100 thành 100, trống là null (thiếu điểm). Gán lại el.value để "150" hiện "100", "007" hiện "7".
function onInput(part: KpiPart, e: Event) {
  const el = e.target as HTMLInputElement;
  const digits = el.value.split(/[.,]/)[0].replace(/\D/g, '');
  const value = digits === '' ? null : Math.min(100, Number(digits));
  el.value = value === null ? '' : String(value);
  emit('update', part, value);
}
</script>

<template>
  <div class="sk">
    <div v-for="p in PARTS" :key="p" class="sk-c">
      <span class="sk-l">{{ SHORT[p] }} ({{ MOCK_KPI_WEIGHTS[p] }}%)</span>
      <span class="sk-f">
        <input
          type="text"
          inputmode="numeric"
          maxlength="3"
          autocomplete="off"
          :class="{ empty: scores[p] == null }"
          :value="scores[p] ?? ''"
          :aria-label="`Điểm ${KPI_LABELS[p]} của ${name}, phần trăm`"
          @input="onInput(p, $event)"
          @change="emit('save', p)"
        />
        <span aria-hidden="true">%</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.sk {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.sk-c {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.sk-l {
  /* Hai dòng chữ 16px chừa sẵn, để các ô nằm ngang hàng dù nhãn dài ngắn khác nhau. */
  min-height: 32px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.sk-f {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
}
.sk input {
  width: 56px;
  height: 32px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid var(--control);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-align: right;
  color: var(--text);
}
/* Ô trống: viền 2px cam, kích thước giữ nguyên (border-box); đệm bớt 1px để chữ không nhích. */
.sk input.empty {
  padding: 0 7px;
  border: 2px solid var(--status-pending);
}
.sk input:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
@media (max-width: 479px) {
  .sk {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    row-gap: 12px;
  }
}
</style>
