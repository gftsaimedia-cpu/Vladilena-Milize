<script setup lang="ts">
// Dải các ngày của tháng trong vùng cuộn riêng: thứ viết tắt, số ngày và một ô màu theo nhóm. Ngày không có ca là span,
// ngày khác là nút mở hộp chi tiết ngày. Lúc mở dải cuộn tới ngày hôm nay.
import { onMounted, ref } from 'vue';
import type { StripDay } from '@/builders/api/attendance';
import { useRealtimeStore } from '@/stores/realtime';

const props = defineProps<{ days: StripDay[]; monthNo: number; personId?: string }>();
const realtime = useRealtimeStore();
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
          :class="{ today: d.today, flash: !!personId && realtime.isFlash(personId, d.date) }"
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
@media (prefers-reduced-motion: no-preference) {
  .ms-i.flash {
    animation: rt-flash 1.5s ease-out;
  }
}
@keyframes rt-flash {
  0%,
  60% {
    box-shadow: 0 0 0 3px var(--accent);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}
.ms {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding: 0 24px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--status-draft) transparent;
}
.ms:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
/* Theo board F: 31 ngày chia đều bề rộng thẻ (cách nhau 2px); hẹp hơn 34px một ngày thì vùng cuộn ngang. */
.ms-list {
  min-width: calc(var(--days) * 34px - 2px);
  display: flex;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ms-d {
  flex: 1 1 0;
  min-width: 0;
}
.ms-i {
  width: 100%;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: 0;
  border-radius: 10px;
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
  font-size: 10px;
  line-height: 12px;
  color: #9e9e9e;
}
.dn {
  min-width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: var(--r-pill);
  font-size: 12px;
  line-height: 16px;
}
.ms-i.today .dn {
  background: var(--surface-dark);
  color: var(--on-primary);
  font-weight: 600;
}
.ms-i.off .dn {
  color: #9e9e9e;
}
.ms-i .dot,
.ms-i .sp {
  width: 22px;
  height: 22px;
  border-radius: 50%;
}
.ms-i .sp {
  display: block;
  background: var(--ground);
}
.ms-i .dot.nocheck {
  background: var(--status-draft);
}
.ms-i .dot.todo {
  border-width: 3px;
}
</style>
