<script setup lang="ts">
// Thẻ KPI tháng 10 (J6 mục 8.1, K1 cột 3): bán nguyệt chấm, tổng điểm, lương KPI, mức đề xuất và năm điểm.
// Điện thoại giữ tiêu đề h2; máy tính truyền level="h3" (spec staff-desktop-one-page 3.1).
//   <KpiCard :kpi="data.kpi" level="h3" />
import { computed } from 'vue';
import type { IncomeView } from '@/mock/staff-phone';

const props = withDefaults(defineProps<{ kpi: IncomeView['kpi']; level?: 'h2' | 'h3' }>(), { level: 'h2' });

// Bán nguyệt chấm như kpiDots của gen-mobile.js: ba vòng bán kính 78/94/110 có 14/17/20 chấm,
// chấm có vị trí t ≤ tỉ lệ KPI thì tô đậm (lớp on).
const RINGS: [number, number][] = [
  [78, 14],
  [94, 17],
  [110, 20]
];
const dots = computed(() => {
  const out: { cx: string; cy: string; on: boolean }[] = [];
  for (const [r, n] of RINGS) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = Math.PI * (1 - t);
      out.push({ cx: (124 + r * Math.cos(a)).toFixed(1), cy: (118 - r * Math.sin(a)).toFixed(1), on: t <= props.kpi.ratio });
    }
  }
  return out;
});
</script>

<template>
  <section class="card kcard" aria-label="KPI tháng 10">
    <div class="sh">
      <component :is="level">{{ kpi.title }}</component>
      <span class="mut">{{ kpi.parts }}</span>
    </div>
    <div class="dots">
      <svg aria-hidden="true" width="248" height="124" viewBox="0 0 248 124">
        <circle v-for="(d, i) in dots" :key="i" :cx="d.cx" :cy="d.cy" r="4.6" :class="{ on: d.on }" />
      </svg>
      <div class="in">
        <b>{{ kpi.percent }}</b
        ><span class="mut sm">Tổng điểm</span>
      </div>
    </div>
    <div class="pr">
      <span class="mut">Lương KPI</span><b>{{ kpi.pay }}</b>
    </div>
    <div class="pr nt">
      <span class="mut">Mức đề xuất</span><span>{{ kpi.proposed }}</span>
    </div>
    <div class="sc">
      <div v-for="s in kpi.scores" :key="s.label">
        <b>{{ s.value }}</b
        ><span class="mut sm">{{ s.label }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Thẻ KPI */
.kcard {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px;
}
.kcard .sh {
  align-self: stretch;
}
.dots {
  position: relative;
  width: 248px;
  height: 124px;
}
.dots circle {
  fill: #e0e0e0;
}
.dots circle.on {
  fill: var(--surface-dark);
}
.dots .in {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  text-align: center;
}
.dots .in b {
  display: block;
  font-size: 28px;
  line-height: 34px;
  font-weight: 600;
}
.pr {
  align-self: stretch;
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}
.pr.nt {
  margin-top: 0;
}
.sc {
  align-self: stretch;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  text-align: center;
}
.sc b {
  display: block;
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
</style>
