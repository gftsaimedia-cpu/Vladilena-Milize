<script setup lang="ts">
// Khung theo route.meta.layout: admin (thanh bên + thanh kỳ lương), staff (nhân viên: điện thoại dưới 1136px, máy tính từ 1136px),
// blank (đăng nhập, bản in A4, mục lục thiết kế).
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AdminLayout from '@/components/shell/AdminLayout.vue';
import AppToast from '@/components/shell/AppToast.vue';
import BlankLayout from '@/layouts/BlankLayout.vue';
import StaffLayout from '@/layouts/StaffLayout.vue';

const LAYOUTS = { admin: AdminLayout, staff: StaffLayout, blank: BlankLayout };
const route = useRoute();
const layout = computed(() => LAYOUTS[route.meta.layout as string] || BlankLayout);
</script>

<template>
  <component :is="layout">
    <RouterView />
  </component>
  <AppToast />
</template>
