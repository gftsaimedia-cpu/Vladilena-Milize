<script setup lang="ts">
// Mục lục 112 màn của bộ thiết kế 22/10: mỗi dòng mở đúng màn, kịch bản dữ liệu giả và hộp thoại tương ứng trong bản Vue.
// Mỗi nhóm khai danh sách của mình trong src/design-index/<nhóm>.js.
import { computed } from 'vue';
import adminAttendance from '@/design-index/admin-attendance';
import adminMain from '@/design-index/admin-main';
import adminPayroll from '@/design-index/admin-payroll';
import adminSettings from '@/design-index/admin-settings';
import payslip from '@/design-index/payslip';
import staffDesktop from '@/design-index/staff-desktop';
import staffPhone from '@/design-index/staff-phone';

const TOTAL = 112; // số màn của bộ thiết kế 22/10
const GROUPS: any[] = [
  ['Admin · Tổng quan, Yêu cầu, vỏ', adminMain],
  ['Admin · Chấm công, Nhân sự, Đánh giá KPI', adminAttendance],
  ['Admin · Cài đặt', adminSettings],
  ['Admin · Bảng lương và các bước kỳ lương', adminPayroll],
  ['Admin · Phiếu lương và bản in A4', payslip],
  ['Nhân viên · điện thoại', staffPhone],
  ['Nhân viên · máy tính, Đăng nhập', staffDesktop]
];
const count = computed(() => GROUPS.reduce((n, [, items]: any) => n + items.length, 0));
</script>

<template>
  <main class="di">
    <h1>Thiết kế AiCB · bản 22/10/2026</h1>
    <p class="lead">{{ count }}/{{ TOTAL }} màn đã có trong bản Vue · dữ liệu giả. Bấm tên màn để mở.</p>
    <section v-for="[name, items] in GROUPS" :key="name" class="card">
      <h2>
        {{ name }} <small>{{ items.length }}</small>
      </h2>
      <ul>
        <li v-for="it in items" :key="it.file">
          <RouterLink :to="it.to">{{ it.title }}</RouterLink>
          <span>{{ it.file }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.di {
  max-width: 1080px;
  margin: 0 auto;
  padding: 40px 24px;
}
h1 {
  font-family: var(--display);
  font-size: 28px;
  line-height: 32px;
  margin: 0 0 4px;
}
.lead {
  color: var(--muted);
  margin: 0 0 24px;
}
.card {
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
h2 {
  font-size: 16px;
  margin: 0 0 10px;
}
h2 small {
  color: #9e9e9e;
  font-weight: 400;
  margin-left: 6px;
  font-size: 14px;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  columns: 2;
  column-gap: 32px;
}
li {
  break-inside: avoid;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  border-top: 1px solid #f2f2f2;
}
li a:hover {
  text-decoration: underline;
}
li span {
  color: #9e9e9e;
  font-size: 12px;
}
@media (max-width: 700px) {
  ul {
    columns: 1;
  }
}
</style>
