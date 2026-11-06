<script setup lang="ts">
// Năm ô điểm KPI của một phiếu (spec 4.4). Gõ: làm sạch rồi báo `update` (phiếu tính lại ngay); rời ô: báo `save`.
// Điểm theo luật của BE: 0–100, tối đa 2 chữ số thập phân. Trọng số (%) lấy từ dữ liệu BE (`weights`); chưa có thì không in.
import { reactive } from 'vue';
import { KPI_LABELS } from '@/constants/labels';
import type { KpiPart, KpiScores } from '@/mock/payroll-calc';
import { num } from '@/utils/format';

defineProps<{ scores: KpiScores; name: string; readonly?: boolean; weights?: Record<KpiPart, number> | null }>();
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

// Điểm hiện bằng dấu phẩy thập phân, đúng giá trị BE trả.
const shown = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
// Chữ đang gõ dở (như "72,") giữ nguyên trong ô chừng nào còn khớp điểm hiện tại; điểm đổi từ ngoài thì hiện lại điểm.
const typed = reactive<Partial<Record<KpiPart, string>>>({});
const valueOf = (text: string) => (text === '' ? null : Number(text.replace(',', '.')));
const display = (part: KpiPart, v: number | null) => {
  const text = typed[part];
  return text !== undefined && valueOf(text) === v ? text : shown(v);
};

// Làm sạch cả chuỗi (gõ, dán, điền): "," hay "." là dấu thập phân (giữ dấu đang gõ dở như "72,"), tối đa 2 chữ số thập phân,
// ký tự khác không phải số thì bỏ ("1a5" thành 15), trên 100 thành 100, không có phần nguyên là trống (null, thiếu điểm).
// Gán lại el.value để "150" hiện "100", "007" hiện "7".
function onInput(part: KpiPart, e: Event) {
  const el = e.target as HTMLInputElement;
  const raw = el.value.replace('.', ',');
  const at = raw.indexOf(',');
  const whole = (at < 0 ? raw : raw.slice(0, at)).replace(/\D/g, '');
  const frac = at < 0 ? '' : raw.slice(at + 1).replace(/\D/g, '').slice(0, 2);
  if (whole === '') {
    el.value = typed[part] = '';
    emit('update', part, null);
    return;
  }
  const value = Math.min(100, Number(`${whole}.${frac || '0'}`));
  el.value = typed[part] = value === 100 ? '100' : `${Number(whole)}${at < 0 ? '' : `,${frac}`}`;
  emit('update', part, value);
}
</script>

<template>
  <div class="sk">
    <div v-for="p in PARTS" :key="p" class="sk-c">
      <span class="sk-l">{{ SHORT[p] }}<template v-if="weights?.[p] != null"> ({{ num(weights[p]) }}%)</template></span>
      <span class="sk-f">
        <input
          type="text"
          inputmode="decimal"
          maxlength="6"
          autocomplete="off"
          :class="{ empty: scores[p] == null }"
          :value="display(p, scores[p])"
          :readonly="readonly"
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
