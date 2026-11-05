<script setup lang="ts">
// Khung nhân viên cho /nv/* (spec 1.2): dưới 1136px là app điện thoại (slot = màn J1–J7 của route),
// từ 1136px là trang máy tính một trang (tự đọc route, bỏ qua slot). Đổi sống khi kéo qua mốc, không tải lại.
import { useStaffDesktop } from '@/composables/useStaffDesktop';
import PhoneLayout from '@/layouts/PhoneLayout.vue';
import StaffDesktopPage from '@/views/staff-desktop/StaffDesktopPage.vue';

const isDesktop = useStaffDesktop();
</script>

<template>
  <StaffDesktopPage v-if="isDesktop" />
  <PhoneLayout v-else><slot /></PhoneLayout>
</template>
