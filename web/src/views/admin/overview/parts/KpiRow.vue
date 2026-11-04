<script setup lang="ts">
// Hàng 4 thẻ chỉ số của Tổng quan. Thẻ đầu (hero) là thẻ nền vàng duy nhất của màn.
import Icon from '@/components/ui/Icon.vue';
import type { OverviewKpi } from '@/mock/overview';

defineProps<{ kpis: OverviewKpi[] }>();

const ICON = { payroll: 'cash', staff: 'users', present: 'check', requests: 'inbox' };
</script>

<template>
  <section class="kpis" aria-label="Chỉ số chính">
    <article v-for="k in kpis" :key="k.key" class="kpi" :class="{ hero: k.hero }" :aria-label="k.label">
      <div class="kpi-top">
        <span class="kpi-l">{{ k.label }}</span>
        <span class="kpi-ico"><Icon :name="ICON[k.key]" :size="16" /></span>
      </div>
      <div class="kpi-v">
        {{ k.value }}<span v-if="k.of" class="kpi-of"> / {{ k.of }}</span
        ><span v-if="k.unit" class="kpi-u">&nbsp;{{ k.unit }}</span>
      </div>
      <div class="kpi-n">
        <span v-if="k.delta" class="delta" :class="{ good: k.delta.good, bad: !k.delta.good }">
          <span aria-hidden="true">{{ k.delta.dir === 'up' ? '▲' : '▼' }}</span>
          <span class="sr-only">{{ k.delta.dir === 'up' ? 'Tăng' : 'Giảm' }}</span>
          {{ k.delta.text }}
        </span>
        {{ k.note }}
      </div>
    </article>
  </section>
</template>

<style scoped>
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 24px;
  margin-bottom: 24px;
  background: none;
  border: 0;
  border-radius: 0;
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  color: var(--text);
}
.kpi + .kpi {
  border-left: 1px solid var(--border);
}
.kpi.hero {
  background: var(--gold);
  border-color: var(--gold);
}
.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.kpi-l {
  font-size: 14px;
  line-height: 20px;
  color: var(--muted);
}
.hero .kpi-l,
.hero .kpi-n {
  color: var(--text);
}
.kpi-ico {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex: none;
  background: var(--status-draft);
  color: var(--text);
}
.hero .kpi-ico {
  background: rgba(33, 33, 33, 0.12);
}
.kpi-v {
  font-size: 32px;
  line-height: 40px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.kpi-of,
.kpi-u {
  font-size: 18px;
  font-weight: 500;
  color: var(--muted);
}
.hero .kpi-of,
.hero .kpi-u {
  color: var(--text);
}
.kpi-n {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.delta {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.delta.good {
  color: var(--status-done);
}
.delta.bad {
  color: var(--status-rejected);
}
.hero .delta {
  color: var(--text);
}
</style>
