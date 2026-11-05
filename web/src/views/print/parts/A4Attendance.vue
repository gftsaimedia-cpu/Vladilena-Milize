<script setup lang="ts">
// Nội dung trang 1 của phiếu lương A4: đầu trang, ô người nhận, tiêu đề bảng chấm công (bảng và dải tổng hợp làm ở bước sau).
import logo from '@/assets/img/gft-logo.png';
import type { A4Sheet } from '@/mock/payslip-a4';
import { monthLabel, monthShort, vnd } from '@/utils/format';
import { periodLine } from './a4-format';

defineProps<{ sheet: A4Sheet }>();
</script>

<template>
  <div class="att">
    <header class="hd">
      <img :src="logo" width="60" height="42" alt="GFT" />
      <h1>Phiếu lương tháng {{ monthShort(sheet.month) }}</h1>
      <p class="sub">{{ periodLine(sheet) }}</p>
    </header>
    <div class="who">
      <div>
        <span class="lb">Họ tên</span><b>{{ sheet.name }}</b>
      </div>
      <div>
        <span class="lb">Loại · bậc</span><b>{{ sheet.kind }} · Bậc {{ sheet.level }}</b>
      </div>
      <div>
        <span class="lb">Tình trạng</span><b>{{ sheet.contract }}</b>
      </div>
      <div>
        <span class="lb">Kỳ lương</span><b>{{ monthLabel(sheet.month) }}</b>
      </div>
    </div>
    <div class="sh">
      <h2>Chấm công tháng {{ monthShort(sheet.month) }}</h2>
      <span class="lb">Lương ngày {{ vnd(sheet.dayRate) }} · số tiền tính bằng đồng</span>
    </div>
  </div>
</template>

<style scoped>
.lb {
  color: #616161;
}
.hd {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 16px;
  align-items: center;
}
.hd img {
  grid-row: 1 / span 2;
  display: block;
}
.hd h1 {
  margin: 0;
  font-family: 'League Spartan', Geist, sans-serif;
  font-weight: 600;
  font-size: 24px;
  line-height: 28px;
  align-self: end;
}
.hd .sub {
  margin: 2px 0 0;
  align-self: start;
  color: #616161;
}
.who {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr 1fr;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}
.who > div {
  padding: 6px 10px;
}
.who > div + div {
  border-left: 1px solid #e0e0e0;
}
.who .lb {
  display: block;
}
.who b {
  display: block;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
}
.sh {
  margin: 16px 0 6px;
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
