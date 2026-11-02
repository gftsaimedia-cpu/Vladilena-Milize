<script setup lang="ts">
// Khối giữa: chấm công của tháng (số liệu, lịch, chú thích) và chi tiết một ngày khi bấm vào lịch.
import { computed, onMounted, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { getStaffDay } from '@/services/staff-desktop';

const props = defineProps({
  data: { type: Object as () => any, required: true },
  prev: { type: String, default: null },
  next: { type: String, default: null },
  kb: { type: String, default: 'linh' },
  initialDate: { type: String, default: null }
});
const emit = defineEmits(['month', 'explain-session']);

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const CLICKABLE = ['ok', 'hol', 'today', 'miss', 'pend'];
const selected = ref(null);
const dayPanel = ref(null);
const panel = computed(() => (selected.value ? dayPanel.value || props.data.defaultPanel : props.data.defaultPanel));
let seq = 0;

async function pick(day?) {
  const mine = ++seq;
  selected.value = day.date;
  const result = await getStaffDay(props.kb, day.date);
  if (mine === seq) dayPanel.value = result;
}

onMounted(() => {
  const day = props.initialDate && props.data.days.find(d => d.date === props.initialDate);
  if (day) pick(day);
});
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ data.title }}</h2>
      <span class="cap" :class="data.cap.tone">{{ data.cap.text }}</span>
      <span class="r nav">
        <button type="button" class="btn sm" aria-label="Tháng trước" :disabled="!prev" @click="emit('month', prev)">
          <Icon name="chevl" />
        </button>
        <button type="button" class="btn sm" aria-label="Tháng sau" :disabled="!next" @click="emit('month', next)">
          <Icon name="chevr" />
        </button>
      </span>
    </div>
    <div class="stats">
      <div v-for="s in data.stats" :key="s.label">
        <b :class="{ bad: s.bad }">{{ s.value }}</b
        ><span>{{ s.label }}</span>
      </div>
    </div>
    <div class="cal">
      <div class="wk">
        <span v-for="n in DOW" :key="n">{{ n }}</span>
      </div>
      <div class="days">
        <span v-for="n in data.lead" :key="'blank' + n" />
        <component
          :is="CLICKABLE.includes(day.kind) ? 'button' : 'span'"
          v-for="day in data.days"
          :key="day.date"
          :type="CLICKABLE.includes(day.kind) ? 'button' : undefined"
          class="d"
          :class="[day.kind, { sel: selected === day.date }]"
          @click="CLICKABLE.includes(day.kind) && pick(day)"
        >
          {{ day.d }}<small v-if="day.tag" :class="day.tagCls">{{ day.tag }}</small>
        </component>
      </div>
    </div>
    <div class="lg">
      <span v-for="(l, i) in data.legend" :key="i"><i v-if="l.swatch" :class="'sw-' + l.swatch" />{{ l.text }}</span>
    </div>
    <div v-if="panel" class="day">
      <div class="p">
        <div>
          <div class="tm">{{ panel.title }}</div>
          <div class="s">{{ panel.sub }}</div>
        </div>
        <span v-if="panel.pill" class="pill" :class="panel.pill.cls">{{ panel.pill.text }}</span>
        <button v-if="panel.action" type="button" class="btn sm"><Icon name="cal" />Khai ngày này</button>
      </div>
      <button v-for="x in panel.explainSessions || []" :key="x.sessionId + x.kind" type="button" class="btn sm explain" @click="emit('explain-session', x)">Giải trình lượt này</button>
    </div>
  </section>
</template>

<style scoped>
.cap.est {
  color: var(--est);
  font-weight: 500;
}
.cap.done {
  color: var(--done-ink);
  font-weight: 500;
}
.nav {
  display: flex;
  gap: 8px;
}
.nav .btn {
  padding: 0 8px;
}
.nav .btn:disabled {
  opacity: 0.4;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}
.stats div {
  padding: 12px 24px;
}
.stats div + div {
  border-left: 1px solid var(--rule);
}
.stats b {
  font-size: 22px;
  line-height: 28px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stats b.bad {
  color: var(--err-ink);
}
.stats span {
  display: block;
  font-size: 13px;
  color: var(--muted);
}
.cal {
  padding: 16px 24px 8px;
}
.wk,
.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}
.wk span {
  text-align: center;
  font-size: 12px;
  color: var(--muted);
  padding-bottom: 6px;
}
.d {
  height: 52px;
  border: 0;
  padding: 0;
  font-family: inherit;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 18px;
  background: none;
}
button.d {
  cursor: pointer;
}
.d small {
  font-size: 11px;
  line-height: 13px;
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
.d.today small {
  color: var(--gold);
}
.d.fut {
  color: #9e9e9e;
  font-weight: 400;
  box-shadow: inset 0 0 0 1px var(--border);
}
.d.sel {
  box-shadow: 0 0 0 2px var(--text);
}
.d.today.sel {
  box-shadow: 0 0 0 2px var(--gold);
}
.d.pend {
  background: var(--pend-bg);
  color: var(--pend-ink);
}
.d.miss {
  background: var(--err-bg);
  color: var(--err-ink);
}
.d.off2 {
  color: #a8a8a8;
  font-weight: 400;
  background: none;
  box-shadow: inset 0 0 0 1px var(--rule);
}
.d small.tag {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2px;
}
.d.ok small.tag {
  color: var(--accent);
}
.lg {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  padding: 12px 24px 16px;
  font-size: 13px;
  color: var(--muted);
}
.lg span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.lg i {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  display: inline-block;
}
.sw-ok {
  background: #f1f1f1;
}
.sw-hol {
  background: var(--gold-pale);
  box-shadow: inset 0 0 0 1px #f0dcae;
}
.sw-today {
  background: var(--text);
}
.sw-miss {
  background: var(--err-bg);
}
.sw-pend {
  background: var(--pend-bg);
}
.sw-off2 {
  box-shadow: inset 0 0 0 1px var(--rule);
}
.sw-fut {
  box-shadow: inset 0 0 0 1px var(--border);
}
.day {
  padding: 4px 24px 20px;
}
.day .p {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--raised);
  border: 1px solid var(--border);
}
.day .p .tm {
  font-weight: 600;
  font-size: 16px;
}
.day .p .s {
  color: var(--muted);
  font-size: 13px;
}
.day .p .pill {
  margin-left: 12px;
}
.day .p .btn {
  margin-left: auto;
}
</style>
