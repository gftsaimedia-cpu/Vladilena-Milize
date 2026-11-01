<script setup lang="ts">
// Thanh ba tab của Phân quyền (Vai trò · Tài khoản · Xử lý yêu cầu) + liên kết Nhật ký. Mỗi tab là một địa chỉ riêng.
import { useLoad } from '@/composables/useLoad';
import { getPermSummary } from '@/services/admin-settings';
import { PATHS } from '../nav';

defineProps({ active: { type: String, required: true } }); // vai-tro | tai-khoan | xu-ly
const { data } = useLoad(() => getPermSummary());
</script>

<template>
  <div class="tabs in">
    <RouterLink :to="PATHS.vaiTro" class="tab" :class="{ on: active === 'vai-tro' }">
      Vai trò <small v-if="data">{{ data.roles }}</small>
    </RouterLink>
    <RouterLink :to="PATHS.taiKhoan" class="tab" :class="{ on: active === 'tai-khoan' }">
      Tài khoản <small v-if="data">{{ data.accounts }}</small>
    </RouterLink>
    <RouterLink :to="PATHS.xuLyYeuCau" class="tab" :class="{ on: active === 'xu-ly' }">Xử lý yêu cầu</RouterLink>
    <span class="r"><RouterLink :to="PATHS.nhatKy" class="link">Nhật ký</RouterLink></span>
  </div>
</template>

<style scoped>
.tabs.in {
  padding: 0 24px;
  margin-bottom: 0;
}
.tabs.in .tab {
  padding-top: 18px;
}
.tabs.in .r {
  margin-left: auto;
  display: flex;
  gap: 16px;
  align-items: center;
  padding-bottom: 10px;
}
</style>
