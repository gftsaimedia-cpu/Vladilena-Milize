<script setup lang="ts">
// Khung theo route.meta.layout: admin (thanh bên + thanh kỳ lương), phone (nhân viên trên điện thoại),
// staffDesktop (nhân viên trên máy tính), blank (đăng nhập, bản in A4, mục lục thiết kế).
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AdminLayout from '@/components/shell/AdminLayout.vue';
import AppToast from '@/components/shell/AppToast.vue';
import BlankLayout from '@/layouts/BlankLayout.vue';
import PhoneLayout from '@/layouts/PhoneLayout.vue';
import StaffDesktopLayout from '@/layouts/StaffDesktopLayout.vue';

const LAYOUTS = { admin: AdminLayout, phone: PhoneLayout, staffDesktop: StaffDesktopLayout, blank: BlankLayout };
const route = useRoute();
const layout = computed(() => LAYOUTS[route.meta.layout as string] || BlankLayout);
</script>

<template>
  <component :is="layout">
    <RouterView />
  </component>
  <AppToast />
</template>
