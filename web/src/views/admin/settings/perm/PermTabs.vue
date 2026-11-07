<script setup lang="ts">
// Thanh tab của Phân quyền (Vai trò · Tài khoản) + liên kết Nhật ký. Mỗi tab là một địa chỉ riêng.
// Không có tab Xử lý yêu cầu: BE v2 chưa có API cho phần này (bảng v1 /settings/params đã bỏ).
import { useLoad } from '@/composables/useLoad';
import { getPermSummary } from '@/services/admin-settings';
import { PATHS } from '../nav';

defineProps({ active: { type: String, required: true } }); // vai-tro | tai-khoan
const { data } = useLoad(() => getPermSummary());
const showRoles = __MOCK__;
</script>

<template>
  <div class="tabs in">
    <!-- Ma trận vai trò chỉ có ở dữ liệu giả; BE thật chỉ có hai vai trò cố định, nên tab bị ẩn. -->
    <RouterLink v-if="showRoles" :to="PATHS.vaiTro" class="tab" :class="{ on: active === 'vai-tro' }">
      Vai trò <small v-if="data">{{ data.roles }}</small>
    </RouterLink>
    <RouterLink :to="PATHS.taiKhoan" class="tab" :class="{ on: active === 'tai-khoan' }">
      Tài khoản <small v-if="data">{{ data.accounts }}</small>
    </RouterLink>
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
