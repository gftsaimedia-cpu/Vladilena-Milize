<script setup lang="ts">
// Bốn thẻ chỉ số của Nhân sự. Thẻ "dark" là thẻ nền tối duy nhất của màn; tăng giảm là chữ thường, không tô xanh đỏ.
import type { StaffStat } from '@/mock/staff';

defineProps<{ stats: StaffStat[] }>();
</script>

<template>
  <section class="kcs" aria-label="Chỉ số nhân sự">
    <article v-for="s in stats" :key="s.key" class="kc" :class="{ dk: s.dark }" :aria-label="s.label">
      <div class="kc-l">{{ s.label }}</div>
      <div class="kc-v">
        {{ s.value }}<small>{{ s.unit }}</small>
      </div>
      <div class="kc-n">
        <b class="kc-d">
          <span aria-hidden="true">{{ s.delta.dir === 'up' ? '▲' : '▼' }}</span>
          <span class="sr-only">{{ s.delta.dir === 'up' ? 'Tăng' : 'Giảm' }}</span>
          {{ s.delta.text }}
        </b>
        {{ s.note }}
      </div>
    </article>
  </section>
</template>

<style scoped>
.kcs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.kc {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 128px;
  padding: 16px 20px 18px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
}
.kc-l {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}
.kc-v {
  margin-top: 8px;
  font-size: 32px;
  line-height: 40px;
  font-weight: 500;
  letter-spacing: -0.64px;
}
.kc-v small {
  margin-left: 6px;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0;
  color: var(--muted);
}
.kc-n {
  margin-top: auto;
  padding-top: 8px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.kc-d {
  font-weight: 600;
}
.kc.dk {
  border-color: var(--surface-dark);
  background: var(--surface-dark);
  color: var(--on-primary);
}
.kc.dk .kc-v {
  color: var(--gold);
}
.kc.dk .kc-v small,
.kc.dk .kc-n {
  color: var(--ink-on-dark-muted);
}
.kc.dk .kc-d {
  color: var(--gold);
}
</style>
