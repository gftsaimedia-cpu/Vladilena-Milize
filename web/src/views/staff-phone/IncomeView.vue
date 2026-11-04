<script setup lang="ts">
// J6 · Thu nhập (spec 8.1): thẻ đen thực nhận dự kiến, thẻ KPI với bán nguyệt chấm, danh sách các khoản.
// Dữ liệu giả (getIncome); không có liên kết "Xem phiếu lương đầy đủ" (R6).
import { computed, ref } from 'vue';
import type { IncomeView } from '@/mock/staff-phone';
import { getIncome } from '@/services/staff-phone';
import MonthSwitch from './components/MonthSwitch.vue';
import PhIcon from './components/PhIcon.vue';

const data = ref<IncomeView | null>(null);
getIncome().then(v => (data.value = v));

// Bán nguyệt chấm như kpiDots của gen-mobile.js: ba vòng bán kính 78/94/110 có 14/17/20 chấm,
// chấm có vị trí t ≤ tỉ lệ KPI thì tô đậm (lớp on).
const RINGS: [number, number][] = [
  [78, 14],
  [94, 17],
  [110, 20]
];
const dots = computed(() => {
  const ratio = data.value?.kpi.ratio ?? 0;
  const out: { cx: string; cy: string; on: boolean }[] = [];
  for (const [r, n] of RINGS) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = Math.PI * (1 - t);
      out.push({ cx: (124 + r * Math.cos(a)).toFixed(1), cy: (118 - r * Math.sin(a)).toFixed(1), on: t <= ratio });
    }
  }
  return out;
});
</script>

<template>
  <div class="ph">
    <template v-if="data">
      <header class="head">
        <h1>{{ data.title }}</h1>
        <span class="mut">{{ data.note }}</span>
      </header>
      <MonthSwitch :label="data.label" :state="data.state" />

      <section class="hero on-dark" aria-label="Thực nhận tháng 10">
        <span class="dim">Thực nhận dự kiến</span>
        <div class="amt">{{ data.net }} <span>₫</span></div>
        <span class="st live"><i class="dot pend" />{{ data.review }}</span>
        <div class="duo">
          <div>
            <span class="dim sm">Tổng thu nhập</span><b>{{ data.gross }}</b>
          </div>
          <div>
            <span class="dim sm">Khấu trừ</span><b>{{ data.deduction }}</b>
          </div>
        </div>
      </section>

      <section class="card kcard" aria-label="KPI tháng 10">
        <div class="sh">
          <h2>{{ data.kpi.title }}</h2>
          <span class="mut">{{ data.kpi.parts }}</span>
        </div>
        <div class="dots">
          <svg aria-hidden="true" width="248" height="124" viewBox="0 0 248 124">
            <circle v-for="(d, i) in dots" :key="i" :cx="d.cx" :cy="d.cy" r="4.6" :class="{ on: d.on }" />
          </svg>
          <div class="in">
            <b>{{ data.kpi.percent }}</b
            ><span class="mut sm">Tổng điểm</span>
          </div>
        </div>
        <div class="pr">
          <span class="mut">Lương KPI</span><b>{{ data.kpi.pay }}</b>
        </div>
        <div class="pr nt">
          <span class="mut">Mức đề xuất</span><span>{{ data.kpi.proposed }}</span>
        </div>
        <div class="sc">
          <div v-for="s in data.kpi.scores" :key="s.label">
            <b>{{ s.value }}</b
            ><span class="mut sm">{{ s.label }}</span>
          </div>
        </div>
      </section>

      <section class="lines">
        <h2>Các khoản</h2>
        <div class="card ls">
          <div v-for="l in data.lines" :key="l.label" class="ro">
            <span class="ti"><PhIcon :name="l.icon" /></span>
            <span class="t">{{ l.label }}</span>
            <span class="v" :class="{ zero: l.zero }">{{ l.value }}</span>
          </div>
          <div class="tot">
            <span>Thực nhận</span><span>{{ data.total }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dim {
  color: #9e9e9e;
}
/* Thẻ đen thực nhận dự kiến (lớp on-dark: focus trắng) */
.hero {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px;
  border-radius: 24px;
  background: var(--surface-dark);
  color: #ffffff;
}
.amt {
  font-size: 32px;
  line-height: 40px;
  font-weight: 600;
}
.amt span {
  font-size: 20px;
  color: #9e9e9e;
  font-weight: 500;
}
.live {
  color: #ffffff;
}
.duo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}
.duo div {
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--surface-dark-raised);
}
.duo b {
  display: block;
  margin-top: 2px;
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
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
/* Các khoản */
.lines {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lines h2 {
  padding: 0 4px;
}
.ro .v.zero {
  color: #757575;
  font-weight: 500;
}
.tot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 56px;
  border-top: 1px solid var(--text);
  font-weight: 600;
  font-size: 16px;
}
</style>
