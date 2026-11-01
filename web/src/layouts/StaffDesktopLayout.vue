<script setup lang="ts">
// Khung màn nhân viên trên máy tính: thanh trên tối (logo, AiCB, người đang đăng nhập) + menu tài khoản + hộp hồ sơ.
// ?hop=menu mở sẵn menu tài khoản; ?hop=ho-so mở sẵn hộp hồ sơ.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import logo from '@/assets/img/gft-logo-light.png';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { logout } from '@/services/session';
import { getStaffMe } from '@/services/staff-desktop';
import AccountPopover from '@/views/staff-desktop/parts/AccountPopover.vue';
import ProfileDialog from '@/views/staff-desktop/parts/ProfileDialog.vue';

const route = useRoute();
const router = useRouter();
const kb = computed(() => (typeof route.query.kb === 'string' && route.query.kb ? route.query.kb : 'linh'));
const { data: me } = useLoad(
  () => getStaffMe(),
  () => kb.value
);

const menuOpen = ref(false);
const profileOpen = ref(false);
watch(
  () => route.query.hop,
  hop => {
    if (hop === 'menu') menuOpen.value = true;
    if (hop === 'ho-so') profileOpen.value = true;
  },
  { immediate: true }
);

function openProfile() {
  menuOpen.value = false;
  profileOpen.value = true;
}
async function signOut() {
  menuOpen.value = false;
  await logout();
  router.push('/dang-nhap');
}
</script>

<template>
  <div class="pc-app">
    <header class="top">
      <img :src="logo" alt="GFT" /><b>AiCB</b>
      <button
        v-if="me"
        type="button"
        class="u"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <span class="av">{{ me.initials }}</span>
        <div>
          {{ me.name }}<span>{{ me.roleLine }}</span>
        </div>
        <Icon name="chev" />
      </button>
    </header>
    <slot />
    <AccountPopover
      v-if="menuOpen && me"
      :me="me"
      @close="menuOpen = false"
      @profile="openProfile"
      @password="openProfile"
      @logout="signOut"
    />
    <ProfileDialog v-if="profileOpen" :kb="kb" @close="profileOpen = false" />
  </div>
</template>

<style scoped>
.pc-app {
  position: relative;
  min-height: 100vh;
}
.top {
  height: 64px;
  background: #1c1c1c;
  display: flex;
  align-items: center;
  padding: 0 32px;
  gap: 12px;
}
.top img {
  width: 44px;
}
.top b {
  font-family: var(--display);
  font-weight: 600;
  font-size: 20px;
  color: #fff;
  padding-top: 3px;
}
.top .u {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.top .u .av {
  background: var(--gold-light);
  color: #212121;
}
.top .u div span {
  display: block;
  font-size: 12px;
  color: #bdbdbd;
  line-height: 16px;
}
.top .u svg {
  color: #bdbdbd;
}
</style>
