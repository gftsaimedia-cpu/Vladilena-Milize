<script setup lang="ts">
// Thanh trên của trang nhân viên máy tính + menu tài khoản (spec 3.2). Menu mở khi và chỉ khi đường dẫn là /nv/toi không có ?hop (D3):
// bấm nút khi đóng → replace('/nv/toi'); bấm lại, bấm ra ngoài hay Esc → replace('/nv/hom-nay'), Esc trả focus về nút.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import logo from '@/assets/img/gft-logo-light.png';
import type { ProfileView } from '@/mock/staff-phone';
import { getProfile, logout } from '@/services/staff-phone';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';

const HOME = '/nv/hom-nay';
const route = useRoute();
const router = useRouter();
const data = ref<ProfileView | null>(null);
getProfile().then(v => (data.value = v));

const menuOpen = computed(() => route.path === '/nv/toi' && !route.query.hop);

function toggle() {
  router.replace(menuOpen.value ? HOME : '/nv/toi');
}
function openPassword() {
  router.replace({ path: '/nv/toi', query: { hop: 'doi-mat-khau' } });
}
async function signOut() {
  await logout();
  router.push('/dang-nhap');
}

// Bấm ra ngoài vùng menu và nút tài khoản thì đóng; liên kết trúng vẫn chạy (đường dẫn đổi khác /nv/toi nên menu cũng đóng).
function onPointer(e: PointerEvent) {
  const t = e.target as Element | null;
  if (t?.closest('#sd-menu, #sd-account')) return;
  router.replace(HOME);
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  router.replace(HOME);
  document.getElementById('sd-account')?.focus();
}
function listen(on: boolean) {
  const fn = on ? 'addEventListener' : 'removeEventListener';
  document[fn]('pointerdown', onPointer, true);
  document[fn]('keydown', onKey);
}
watch(menuOpen, open => listen(open), { immediate: true });
onBeforeUnmount(() => listen(false));
</script>

<template>
  <header class="bar">
    <img class="logo" :src="logo" alt="GFT" />
    <span class="bar-app">Nhân viên</span>
    <button
      id="sd-account"
      type="button"
      class="acc"
      aria-controls="sd-menu"
      :aria-expanded="menuOpen"
      @click="toggle"
    >
      <span class="av" aria-hidden="true">{{ data?.initials }}</span>
      <span class="nm">{{ data?.name }}</span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <section v-if="data" v-show="menuOpen" id="sd-menu" class="menu" role="region" aria-label="Tài khoản của tôi">
      <div class="ident">
        <span class="av big" aria-hidden="true">{{ data.initials }}</span>
        <div class="who">
          <div class="nm2">{{ data.name }}</div>
          <div class="mut">{{ data.email }}</div>
        </div>
        <span class="st"><i class="dot work" />{{ data.contract }}</span>
      </div>
      <div class="facts">
        <div v-for="[k, v] in data.facts" :key="k" class="kv">
          <span class="k">{{ k }}</span
          ><span class="v">{{ v }}</span>
        </div>
      </div>
      <p class="mut sm note">{{ data.note }}</p>
      <button type="button" class="mi" @click="openPassword">
        <span class="ti"><PhIcon name="lock" /></span><span class="t">Đổi mật khẩu</span>
        <PhIcon name="right" :size="18" :stroke="2" />
      </button>
      <button type="button" class="mi out" @click="signOut">
        <span class="ti"><PhIcon name="out" /></span><span class="t">Đăng xuất</span>
      </button>
    </section>
  </header>
</template>

<style scoped>
.bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 64px;
  padding: 0 8px 0 24px;
  border-radius: 24px;
  background: var(--surface-dark);
  color: #fff;
}
.logo {
  width: 52px;
  height: auto;
}
.bar-app {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.acc {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  margin-left: auto;
  padding: 0 14px 0 6px;
  border: 0;
  border-radius: 50px;
  background: #2a2a2a;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.acc:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.av {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50px;
  background: var(--gold-light);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}
.nm {
  font-weight: 600;
}
.menu {
  position: absolute;
  z-index: 30;
  top: 72px;
  right: 0;
  width: min(360px, calc(100vw - 32px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: #fff;
  color: var(--text);
}
.ident {
  display: flex;
  align-items: center;
  gap: 12px;
}
.av.big {
  width: 48px;
  height: 48px;
  flex: none;
  font-size: 16px;
}
.who {
  flex: 1 1 auto;
  min-width: 0;
}
.nm2 {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.facts {
  padding: 4px 16px;
  border-radius: 16px;
  background: var(--page);
}
.note {
  margin: 0;
}
.mi {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.mi .t {
  flex: 1 1 auto;
  font-weight: 500;
}
.mi.out,
.mi.out .ti {
  color: #b43f3f;
}
</style>
