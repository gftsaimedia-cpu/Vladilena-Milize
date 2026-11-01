<script setup lang="ts">
// Lịch năm 12 tháng: ngày lễ tô vàng, ngày bắt đầu tính công gạch chân, ngày trả lương khoanh tròn.
// Bấm một ngày → báo ra ngoài (pick) để đặt ngày lễ từ ngày đó.
import { computed } from 'vue';

const props = defineProps({
  year: { type: Number, required: true },
  holidays: { type: Array as () => any[], default: () => [] }, // [{ from, to }] 'YYYY-MM-DD'
  startDay: { type: Number, default: 1 },
  payDay: { type: Number, default: 10 }
});
defineEmits(['pick']);

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const pad = (n?) => String(n).padStart(2, '0');
const isoOf = (y?, m?, d?) => `${y}-${pad(m)}-${pad(d)}`;
const isHoliday = (iso?) => props.holidays.some(h => iso >= h.from && iso <= h.to);

const months = computed(() =>
  Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const blanks = (new Date(Date.UTC(props.year, i, 1)).getUTCDay() + 6) % 7; // thứ Hai là cột đầu
    const count = new Date(Date.UTC(props.year, m, 0)).getUTCDate();
    const days = Array.from({ length: count }, (__, k) => {
      const d = k + 1;
      const dow = (blanks + k) % 7;
      const ho = isHoliday(isoOf(props.year, m, d));
      const prev = d > 1 && isHoliday(isoOf(props.year, m, d - 1));
      const next = d < count && isHoliday(isoOf(props.year, m, d + 1));
      return {
        d,
        iso: isoOf(props.year, m, d),
        cls: {
          su: dow === 6,
          ho,
          s: ho && (!prev || dow === 0),
          e: ho && (!next || dow === 6),
          pay: d === props.payDay,
          st: d === props.startDay && !ho
        }
      };
    });
    return { m, blanks, days };
  })
);
</script>

<template>
  <div class="months">
    <div v-for="mo in months" :key="mo.m" class="mo">
      <h4>Tháng {{ mo.m }}</h4>
      <div class="g7">
        <span v-for="w in WEEKDAYS" :key="w" class="wd">{{ w }}</span>
        <span v-for="b in mo.blanks" :key="'b' + b"></span>
        <button
          v-for="day in mo.days"
          :key="day.d"
          type="button"
          class="dd"
          :class="day.cls"
          :aria-label="`Ngày ${day.d} tháng ${mo.m}`"
          @click="$emit('pick', day.iso)"
        >
          <span v-if="day.cls.pay || day.cls.st">{{ day.d }}</span>
          <template v-else>{{ day.d }}</template>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.months {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px 24px;
  padding: 8px 24px 16px;
}
.mo h4 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}
.mo .g7 {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  row-gap: 2px;
  text-align: center;
}
.mo .wd {
  font-size: 10px;
  color: #9e9e9e;
  line-height: 18px;
}
.mo .dd {
  font-size: 12px;
  line-height: 24px;
  height: 24px;
  font-variant-numeric: tabular-nums;
  position: relative;
  border: 0;
  background: none;
  padding: 0;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  border-radius: 6px;
}
.mo .dd:hover:not(.ho) {
  background: var(--raised);
}
.mo .dd.su {
  color: #a8a8a8;
}
.mo .dd.ho {
  background: var(--gold-light);
  font-weight: 600;
  border-radius: 0;
}
.mo .dd.ho.s {
  border-radius: 6px 0 0 6px;
}
.mo .dd.ho.e {
  border-radius: 0 6px 6px 0;
}
.mo .dd.ho.s.e {
  border-radius: 6px;
}
.mo .dd.pay span {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--text);
  color: #fff;
  font-weight: 600;
  font-size: 11px;
  line-height: 22px;
}
.mo .dd.st span {
  border-bottom: 1.5px solid var(--text);
  font-weight: 600;
}
</style>
