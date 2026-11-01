<script setup lang="ts">
// Khối KPI của tháng đã chốt (hiện ở cột phải, dưới khối thu nhập).
import { vnd } from '@/utils/format';
import { smallText } from './small-text';

defineProps({ data: { type: Object as () => any, required: true } });
const rowValue = (r?) => (r.text != null ? r.text : vnd(r.value));
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ data.title }}</h2>
      <span class="cap">{{ data.cap }}</span>
    </div>
    <div v-for="r in data.rows" :key="r.label" class="kv">
      <span>
        {{ r.label }}<small v-if="r.small">{{ smallText(r.small) }}</small>
      </span>
      <span class="v">{{ rowValue(r) }}</span>
    </div>
    <div class="gap" />
  </section>
</template>

<style scoped>
.kv {
  display: flex;
  justify-content: space-between;
  padding: 10px 24px;
  border-top: 1px solid var(--rule);
  font-size: 14px;
}
.kv .v {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.kv small {
  display: block;
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}
.gap {
  height: 8px;
}
</style>
