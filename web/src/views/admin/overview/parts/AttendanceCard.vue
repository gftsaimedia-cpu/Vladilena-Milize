<script setup lang="ts">
// Thẻ Chấm công: tỉ lệ có mặt hôm nay và biểu đồ cột 6 ngày làm việc gần nhất (HTML thuần).
import { computed } from 'vue';
import type { OverviewView } from '@/mock/overview';

const props = defineProps<{ attendance: OverviewView['attendance'] }>();

const label = computed(
  () =>
    'Tỉ lệ có mặt 6 ngày làm việc gần nhất: ' +
    props.attendance.days.map(d => `${d.today ? 'hôm nay' : d.dow} ${d.date} ${d.rate}%`).join(', ')
);
</script>

<template>
  <section class="card at" aria-labelledby="ov-at-h">
    <h2 id="ov-at-h">Chấm công</h2>
    <p class="big">
      {{ attendance.todayRate }}<span class="pc">%</span>
      <span class="sub">có mặt hôm nay · {{ attendance.present }} / {{ attendance.total }}</span>
    </p>
    <figure :aria-label="label">
      <div class="cols" aria-hidden="true">
        <div v-for="d in attendance.days" :key="d.date" class="col">
          <span class="rate">{{ d.rate }}%</span>
          <span class="track"><span class="fill" :class="{ today: d.today }" :style="{ height: `${d.rate}%` }" /></span>
          <span class="dow" :class="{ today: d.today }">{{ d.dow }}</span>
          <span class="date">{{ d.date }}</span>
        </div>
      </div>
      <figcaption class="legend" aria-hidden="true">
        <span><i class="sw present" />Có mặt</span>
        <span><i class="sw today" />Hôm nay</span>
        <span><i class="sw rest" />Chưa có mặt</span>
      </figcaption>
    </figure>
  </section>
</template>

<style scoped>
.at {
  padding: 24px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
h2 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.big {
  margin: 0;
  font-size: 32px;
  line-height: 40px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.pc {
  font-size: 18px;
  font-weight: 500;
}
.sub {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
figure {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cols {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}
.col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  line-height: 16px;
  min-width: 0;
}
.rate {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.track {
  position: relative;
  width: 100%;
  max-width: 40px;
  height: 120px;
  border-radius: var(--r-ctl);
  background: var(--status-draft);
  overflow: hidden;
}
.fill {
  position: absolute;
  inset: auto 0 0 0;
  background: var(--surface-dark);
}
.fill.today {
  background: var(--gold);
}
.dow {
  margin-top: 4px;
  font-weight: 500;
  white-space: nowrap;
}
.dow.today {
  font-weight: 600;
}
.date {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 12px;
  color: var(--muted);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sw {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}
.sw.present {
  background: var(--surface-dark);
}
.sw.today {
  background: var(--gold);
}
.sw.rest {
  background: var(--status-draft);
}
@media (max-width: 480px) {
  .at {
    padding: 20px 16px;
  }
  .cols {
    gap: 4px;
  }
}
</style>
