<script setup lang="ts">
// Thẻ lịch tháng của Chấm công, dựng từ danh sách ngày máy chủ trả: { date: 'YYYY-MM-DD', kind: 'ok'|'sun'|'hol'|'today'|'fut' }.
// Tuần bắt đầu từ T2; ngày Chủ nhật và ngày chưa tới không bấm được.
import { computed } from 'vue';

const props = defineProps({ days: { type: Array as () => any[], required: true } });
defineEmits(['select']);

const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
// Số ô trống đầu tháng (T2 = 0)
const blanks = computed(() => {
  const first = new Date(`${props.days[0].date}T00:00:00Z`).getUTCDay();
  return (first + 6) % 7;
});
const pickable = (d?) => d.kind === 'ok' || d.kind === 'hol' || d.kind === 'today';
</script>

<template>
  <section class="sec card">
    <div class="cal">
      <div class="wk">
        <span v-for="w in WEEK" :key="w">{{ w }}</span>
      </div>
      <div class="days">
        <span v-for="n in blanks" :key="'b' + n" />
        <component
          :is="pickable(d) ? 'button' : 'span'"
          v-for="d in days"
          :key="d.date"
          :type="pickable(d) ? 'button' : undefined"
          class="d"
          :class="d.kind"
          @click="pickable(d) && $emit('select', d.date)"
        >
          {{ Number(d.date.slice(8, 10)) }}
          <small v-if="d.kind === 'hol'">Lễ</small>
          <small v-else-if="d.kind === 'today'" class="dot" />
        </component>
      </div>
    </div>
    <div class="lg">
      <span><i class="k-ok" />Đủ công</span>
      <span><i class="k-hol" />Ngày lễ</span>
      <span><i class="k-today" />Hôm nay</span>
      <span><i class="k-fut" />Chưa tới</span>
      <span class="full">Bấm vào một ngày để xem giờ vào, ra.</span>
    </div>
  </section>
</template>

<style scoped>
.cal {
  padding: 14px 12px 6px;
}
.wk,
.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.wk span {
  text-align: center;
  font-size: 12px;
  color: var(--muted);
  padding-bottom: 6px;
}
.d {
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  font: inherit;
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 18px;
}
button.d {
  cursor: pointer;
}
.d small {
  font-size: 10px;
  line-height: 12px;
  font-weight: 500;
  margin-top: 2px;
}
.d.ok {
  background: #f1f1f1;
}
.d.sun {
  color: #a8a8a8;
  font-weight: 400;
}
.d.hol {
  background: var(--gold-pale);
  box-shadow: inset 0 0 0 1px #f0dcae;
}
.d.hol small {
  color: var(--accent);
}
.d.today {
  background: var(--text);
  color: #fff;
}
.d.today small.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gold);
  margin-top: 4px;
}
.d.fut {
  color: #9e9e9e;
  font-weight: 400;
  box-shadow: inset 0 0 0 1px var(--border);
}
.lg {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--rule);
  margin-top: 10px;
  font-size: 13px;
  color: var(--muted);
}
.lg span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.lg .full {
  flex-basis: 100%;
}
.lg i {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  display: inline-block;
}
.lg .k-ok {
  background: #f1f1f1;
}
.lg .k-hol {
  background: var(--gold-pale);
  box-shadow: inset 0 0 0 1px #f0dcae;
}
.lg .k-today {
  background: var(--text);
}
.lg .k-fut {
  box-shadow: inset 0 0 0 1px var(--border);
}
</style>
