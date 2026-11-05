<script setup lang="ts">
// Bản in phiếu lương A4, đúng 2 tờ mỗi phiếu: trang 1 chấm công, trang 2 các khoản.
// Dùng ở trang in (/in/phieu-luong/...); prop sheet là dữ liệu do nguồn phiếu trả, thành phần chỉ định dạng, không tính.
import type { A4Sheet } from '@/mock/payslip-a4';
import A4Attendance from './parts/A4Attendance.vue';
import A4Page from './parts/A4Page.vue';
import A4Summary from './parts/A4Summary.vue';

defineProps<{ sheet: A4Sheet }>();
</script>

<template>
  <div class="a4-doc">
    <A4Page :page="1">
      <A4Attendance :sheet="sheet" />
    </A4Page>
    <A4Page :page="2">
      <A4Summary :sheet="sheet" />
    </A4Page>
  </div>
</template>

<style>
/* In: khổ A4, không lề, giữ nền; mỗi trang một tờ (hai trang mỗi phiếu). */
@page {
  size: A4;
  margin: 0;
}
@media print {
  html,
  body {
    background: #fff !important;
  }
  .pl-a4 {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-shadow: none !important;
    margin: 0 !important;
    break-after: page;
    page-break-after: always;
  }
}
</style>
