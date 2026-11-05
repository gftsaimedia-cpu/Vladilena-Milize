<script setup lang="ts">
// Nội dung trang 2 của phiếu lương A4: đầu trang chạy và tiêu đề bảng các khoản (bảng, Thực nhận và chữ ký làm ở bước sau).
import logo from '@/assets/img/gft-logo.png';
import type { A4Sheet } from '@/mock/payslip-a4';
import { monthShort } from '@/utils/format';
import { staffLine } from './a4-format';

defineProps<{ sheet: A4Sheet }>();
</script>

<template>
  <div class="sum2">
    <header class="rh">
      <img :src="logo" width="40" height="28" alt="GFT" />
      <div>
        <b>Phiếu lương tháng {{ monthShort(sheet.month) }} · {{ sheet.name }}</b>
        <span class="lb">{{ staffLine(sheet) }}</span>
      </div>
    </header>
    <div class="sh">
      <h2>Tổng hợp lương</h2>
      <span class="lb">Số tiền tính bằng đồng</span>
    </div>
  </div>
</template>

<style scoped>
.lb {
  color: #616161;
}
.rh {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.rh img {
  display: block;
}
.rh b {
  display: block;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
}
.rh .lb {
  display: block;
}
.sh {
  margin-bottom: 6px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.sh h2 {
  margin: 0;
  font-size: 15px;
  line-height: 20px;
  font-weight: 600;
}
</style>
