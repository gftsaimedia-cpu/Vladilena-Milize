<script setup lang="ts">
// Khung màn nhân viên trên điện thoại: cột tối đa ~430px giữa màn hình, thanh tab 5 mục ở đáy (nv.js của thiết kế).
// Gốc phải có class "ph-app" (styles/phone.css đặt mọi luật dưới lớp này).
import Icon from '@/components/ui/Icon.vue';

const TABS = [
  { to: '/nv/hom-nay', icon: 'home', label: 'Hôm nay' },
  { to: '/nv/cham-cong', icon: 'clock', label: 'Chấm công' },
  { to: '/nv/yeu-cau', icon: 'inbox', label: 'Yêu cầu' },
  { to: '/nv/thu-nhap', icon: 'cash', label: 'Thu nhập' },
  { to: '/nv/toi', icon: 'user', label: 'Tôi' }
];
</script>

<template>
  <div class="ph-app">
    <div class="wrap">
      <main><slot /></main>
      <nav class="tabbar" aria-label="Điều hướng">
        <RouterLink v-for="t in TABS" :key="t.to" :to="t.to" class="tb" active-class="on">
          <span class="ib"><Icon :name="t.icon" :size="20" /></span>{{ t.label }}
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
.ph-app .wrap {
  max-width: 430px;
  margin: 0 auto;
  background: var(--ground);
}
/* Thanh tab dính đáy màn hình khi nội dung dài (thiết kế đặt cuối trang) */
.ph-app .tabbar {
  position: sticky;
  bottom: 0;
  z-index: 5;
}
@media (min-width: 431px) {
  .ph-app {
    background: #e9e9e9;
  }
  .ph-app .wrap {
    box-shadow: 0 0 0 1px var(--border);
  }
}
</style>
