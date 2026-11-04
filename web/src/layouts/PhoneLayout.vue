<script setup lang="ts">
// Khung app nhân viên trên điện thoại (spec 3.1): cột tối đa 430px giữa màn hình, thanh tab nổi 5 mục cách đáy 16px.
// Mỗi màn tự dựng gốc .ph (đệm đáy 112px để thanh tab không che dòng cuối). Gốc có lớp "ph-app": styles/phone.css đặt luật dưới lớp này.
import type { PhoneIconName } from '@/mock/staff-phone';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';

const TABS: { to: string; icon: PhoneIconName; label: string }[] = [
  { to: '/nv/hom-nay', icon: 'home', label: 'Hôm nay' },
  { to: '/nv/cham-cong', icon: 'cal', label: 'Chấm công' },
  { to: '/nv/yeu-cau', icon: 'doc', label: 'Yêu cầu' },
  { to: '/nv/thu-nhap', icon: 'wallet', label: 'Thu nhập' },
  { to: '/nv/toi', icon: 'user', label: 'Tôi' }
];
</script>

<template>
  <div class="ph-app">
    <div class="ph-col">
      <main><slot /></main>
      <nav class="ph-nav" aria-label="Điều hướng">
        <RouterLink v-for="t in TABS" :key="t.to" :to="t.to" class="ni">
          <span class="ic"><PhIcon :name="t.icon" /></span>{{ t.label }}
        </RouterLink>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.ph-app {
  min-height: 100vh;
  background: var(--ground);
}
.ph-col {
  max-width: 430px;
  min-height: 100vh;
  margin: 0 auto;
  background: var(--ground);
}
/* Thanh tab nổi: cố định theo cột 430px, rộng bằng cột trừ 16px mỗi bên, cao 68px, bo 50px, không bóng. */
.ph-nav {
  position: fixed;
  z-index: 20;
  left: 50%;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  width: min(398px, calc(100% - 32px));
  height: 68px;
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 0 6px;
  border-radius: 50px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.ni {
  flex: 0 1 64px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  line-height: 14px;
  color: var(--muted);
  text-decoration: none;
  white-space: nowrap;
  border-radius: 12px;
}
.ni .ic {
  width: 44px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50px;
}
.ni[aria-current='page'] {
  color: var(--text);
  font-weight: 600;
}
.ni[aria-current='page'] .ic {
  background: var(--surface-dark);
  color: var(--gold);
}
.ni:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
/* Màn rộng hơn cột: hai bên nền #e9e9e9, cột có viền 1px (không bóng). */
@media (min-width: 431px) {
  .ph-app {
    background: #e9e9e9;
  }
  .ph-col {
    border-inline: 1px solid var(--border);
  }
}
</style>
