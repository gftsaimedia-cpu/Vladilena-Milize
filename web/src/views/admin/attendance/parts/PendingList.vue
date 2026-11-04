<script setup lang="ts">
// Tab "Cần xử lý": mỗi việc có ngày chấm công một dòng (đã xếp theo ngày đầu). Bấm dòng mở hộp chi tiết ngày đầu của việc.
import { dm } from '@/utils/format';
import type { PendingDay } from '@/mock/attendance';

defineProps<{ pending: PendingDay[] }>();
const emit = defineEmits<{ 'open-day': [personId: string, date: string] }>();
</script>

<template>
  <ul v-if="pending.length" class="pend" aria-label="Việc cần xử lý chấm công">
    <li v-for="p in pending" :key="p.item.id">
      <button type="button" class="pr" @click="emit('open-day', p.person.id, p.date)">
        <span class="av" aria-hidden="true">{{ p.person.initials }}</span>
        <span class="pn">
          <span class="nn">{{ p.person.name }}</span>
          <span class="dp">{{ p.item.groupLabel }} · {{ p.item.what }}</span>
        </span>
        <span class="pd">{{ dm(p.date) }}</span>
      </button>
    </li>
  </ul>
  <p v-else class="none">Không còn việc nào cần xử lý.</p>
</template>

<style scoped>
.pend {
  list-style: none;
  margin: 0;
  padding: 0 20px;
}
.pend li + li {
  border-top: 1px solid var(--rule);
}
.pr {
  width: 100%;
  min-height: 56px;
  padding: 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}
.pr:hover .nn {
  text-decoration: underline;
}
.pr:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
  border-radius: 8px;
}
.pn {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.nn {
  font-weight: 600;
}
.dp {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pd {
  flex: none;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.none {
  margin: 0;
  padding: 32px 20px;
  color: var(--muted);
}
</style>
