<script setup lang="ts">
// Khung mọi màn Admin: thanh bên + thanh kỳ lương + nội dung (RouterView ở slot).
// Chuông (BellPopover), menu tài khoản (AccountMenu), đổi mật khẩu (ChangePasswordDialog) mở từ đây;
// ?hop=chuong | menu-tai-khoan | doi-mat-khau mở sẵn (mục lục thiết kế).
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { getShell } from '@/services/shell';
import { usePeriodStore } from '@/stores/period';
import { useUiStore } from '@/stores/ui';
import AccountMenu from './AccountMenu.vue';
import AdminSidebar from './AdminSidebar.vue';
import BellPopover from './BellPopover.vue';
import ChangePasswordDialog from './ChangePasswordDialog.vue';
import PeriodStrip from './PeriodStrip.vue';

const route = useRoute();
const period = usePeriodStore();
const ui = useUiStore();
ui.init();

const shell = ref({ me: {}, counts: {}, bell: 0 });
const loadShell = async () => {
  shell.value = await getShell();
};
onMounted(loadShell);
onMounted(() => period.refresh());

const bellOpen = ref(false);
const menuOpen = ref(false);
const pwOpen = ref(false);

// Đổi màn: đóng các lớp nổi của vỏ, thanh kỳ lương về mặc định của tháng (màn mới tự đặt lại nếu cần)
watch(
  () => route.path,
  () => {
    bellOpen.value = false;
    menuOpen.value = false;
    period.resetStrip();
    loadShell(); // số đếm trên thanh bên và chuông theo việc vừa xử lý
  },
  { flush: 'pre' }
);
watch(
  () => route.query.thang,
  m => m && period.setMonth(String(m)),
  { immediate: true, flush: 'pre' }
);
watch(
  () => route.query.hop,
  h => {
    bellOpen.value = h === 'chuong';
    menuOpen.value = h === 'menu-tai-khoan';
    pwOpen.value = h === 'doi-mat-khau';
  },
  { immediate: true }
);
function openPassword() {
  menuOpen.value = false;
  pwOpen.value = true;
}
</script>

<template>
  <div class="app">
    <AdminSidebar
      :active="route.meta.nav as string"
      :me="shell.me"
      :counts="shell.counts"
      @open-menu="menuOpen = !menuOpen"
    />
    <main class="canvas">
      <PeriodStrip
        :bell="shell.bell"
        :show-steps="['tong-quan', 'cham-cong', 'kpi', 'luong'].includes(String(route.meta.nav || ''))"
        @open-bell="bellOpen = !bellOpen"
      />
      <slot />
    </main>
    <BellPopover v-if="bellOpen" @close="bellOpen = false" />
    <AccountMenu v-if="menuOpen" :me="shell.me" @close="menuOpen = false" @change-password="openPassword" />
    <ChangePasswordDialog v-if="pwOpen" @close="pwOpen = false" />
  </div>
</template>
