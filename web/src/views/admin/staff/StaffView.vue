<script setup lang="ts">
// Màn Nhân sự (nhan-su) trên dữ liệu giả: bốn thẻ chỉ số và thẻ danh sách 10 hồ sơ đầu của 131.
import { useLoad } from '@/composables/useLoad';
import { getStaffList } from '@/services/admin-hr';
import StaffStats from './parts/StaffStats.vue';
import StaffTable from './parts/StaffTable.vue';

const { data } = useLoad(() => getStaffList());
</script>

<template>
  <div class="staff">
    <div class="title">
      <h1>Nhân sự</h1>
    </div>

    <template v-if="data">
      <StaffStats :stats="data.stats" />

      <section class="lc" aria-labelledby="staff-list-h">
        <div class="lc-h">
          <h2 id="staff-list-h">Danh sách nhân sự</h2>
          <span>{{ data.total }} hồ sơ</span>
        </div>
        <StaffTable :rows="data.rows" />
        <div class="lc-f">Hiển thị 1–{{ data.rows.length }} trong {{ data.total }} hồ sơ</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.staff {
  min-width: 0;
}
.lc {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  background: var(--surface);
}
.lc-h {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 20px 20px 16px;
}
.lc-h h2 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.lc-h span {
  font-size: 14px;
  color: var(--muted);
}
.lc-f {
  padding: 14px 20px 18px;
  text-align: right;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
</style>
