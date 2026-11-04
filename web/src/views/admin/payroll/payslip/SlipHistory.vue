<script setup lang="ts">
// Lịch sử sửa điểm KPI của phiếu (spec 4.4): nút chữ gạch chân mở danh sách, mới nhất ở trên.
import { ref } from 'vue';
import type { KpiEdit } from '@/mock/payroll';

defineProps<{ history: KpiEdit[] }>();
// Trạng thái mở giữ khi phiếu lưu thêm một lần sửa (n đổi từ 0 sang 1 rồi tăng).
const open = ref(false);
</script>

<template>
  <p v-if="!history.length" class="sh-none">Chưa sửa điểm lần nào</p>
  <div v-else>
    <button type="button" class="sh-t" :aria-expanded="open" @click="open = !open">
      Lịch sử sửa điểm ({{ history.length }})
    </button>
    <ul v-if="open" class="sh-l" aria-label="Lịch sử sửa điểm">
      <li v-for="(h, i) in history" :key="i">
        <span>{{ h.date }} · {{ h.text }}</span>
        <span class="by">{{ h.by }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.sh-none {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  color: var(--muted);
}
.sh-t {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  color: var(--text);
  text-decoration: underline;
  cursor: pointer;
}
.sh-t:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
  border-radius: 4px;
}
.sh-l {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.sh-l li {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0 12px;
  padding: 4px 0;
  font-size: 14px;
  line-height: 20px;
}
.sh-l .by {
  font-size: 12px;
  line-height: 20px;
  color: var(--muted);
}
</style>
