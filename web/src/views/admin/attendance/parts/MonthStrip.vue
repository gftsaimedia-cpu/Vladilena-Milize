<script setup lang="ts">
// Dải các ngày của tháng trong vùng cuộn riêng: thứ viết tắt, số ngày và một ô màu theo nhóm. Ngày không có ca là span,
// ngày khác là nút mở hộp chi tiết ngày. Lúc mở dải cuộn tới ngày hôm nay.
import { onMounted, ref } from 'vue';
import type { StripDay } from '@/mock/attendance-employee';

const props = defineProps<{ days: StripDay[]; monthNo: number }>();
const emit = defineEmits<{ 'open-day': [date: string] }>();

const STEP = 48; // 44px mỗi ngày + 4px khoảng cách; giữ cố định để bề rộng không phụ thuộc phông chữ
const scroller = ref<HTMLElement | null>(null);

onMounted(() => {
  const el = scroller.value;
  const at = props.days.findIndex(d => d.today);
  if (el && at >= 0) el.scrollLeft = Math.max(0, (at + 1) * STEP - el.clientWidth + 16);
});
</script>

<template>
  <div ref="scroller" class="ms" role="region" :aria-label="`Các ngày tháng ${monthNo}`" tabindex="0">
    <ul class="ms-list" :style="{ '--days': days.length }">
      <li v-for="d in days" :key="d.date" class="ms-d">
        <span v-if="d.kind === 'off'" class="ms-i off" role="img" :aria-label="d.aria">
          <span class="dw">{{ d.dow }}</span>
          <span class="dn">{{ d.day }}</span>
          <span class="sp" />
        </span>
        <button
          v-else
          type="button"
          class="ms-i"
          :class="{ today: d.today }"
          :data-date="d.date"
          :aria-label="d.aria"
          :aria-current="d.today ? 'date' : undefined"
          @click="emit('open-day', d.date)"
        >
          <span class="dw">{{ d.dow }}</span>
          <span class="dn">{{ d.day }}</span>
          <span class="b dot" :class="d.kind" aria-hidden="true" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ms {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding: 4px 16px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--status-draft) transparent;
}
.ms:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.ms-list {
  /* Bề rộng ghi thẳng từ số ngày: mỗi ô 44px, cách nhau 4px. */
  width: calc(var(--days) * 44px + (var(--days) - 1) * 4px);
  display: flex;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ms-d {
  flex: none;
  width: 44px;
}
.ms-i {
  width: 100%;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-variant-numeric: tabular-nums;
}
button.ms-i {
  cursor: pointer;
}
button.ms-i:hover {
  background: var(--ground);
}
/* Dải nằm trong vùng cuộn cắt phần tràn, nên vòng focus vẽ vào trong. */
button.ms-i:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.ms-i.today {
  background: var(--gold-pale);
}
.dw {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.dn {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
.ms-i.today .dw,
.ms-i.today .dn {
  color: var(--text);
  font-weight: 600;
}
.ms-i.off .dw,
.ms-i.off .dn {
  color: var(--muted);
  font-weight: 400;
}
.ms-i .dot,
.ms-i .sp {
  width: 22px;
  height: 22px;
  border-radius: 8px;
}
.ms-i .sp {
  display: block;
}
.ms-i .dot.nocheck {
  background: var(--status-draft);
}
</style>
