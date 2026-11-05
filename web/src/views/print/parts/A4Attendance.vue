<script setup lang="ts">
// Nội dung trang 1 của phiếu lương A4: đầu trang, ô người nhận, bảng chấm công mỗi ngày một dòng, dải tổng hợp và chú thích.
import { useId } from 'vue';
import logo from '@/assets/img/gft-logo.png';
import type { A4Sheet } from '@/mock/payslip-a4';
import { dm, dowShort, monthLabel, monthShort, vnd } from '@/utils/format';
import { blankNum, inOutText, periodLine, signedText, statCells } from './a4-format';

defineProps<{ sheet: A4Sheet }>();
const headingId = useId();
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
      <h2 :id="headingId">Chấm công tháng {{ monthShort(sheet.month) }}</h2>
      <span class="lb">Lương ngày {{ vnd(sheet.dayRate) }} · số tiền tính bằng đồng</span>
    </div>
    <table class="cc" :aria-labelledby="headingId">
      <thead>
        <tr>
          <th class="c-date">Ngày</th>
          <th class="c-kind">Loại ngày</th>
          <th class="c-io n">Vào – ra</th>
          <th class="c-hrs n">Giờ</th>
          <th class="c-ot n">OT</th>
          <th class="c-mk n">Làm bù</th>
          <th class="c-note">Ghi chú</th>
          <th class="c-adj n">Cộng / trừ</th>
          <th class="c-tot n">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in sheet.days" :key="d.date" :class="{ off: d.mark !== 'work' }">
          <td>
            <span class="wd">{{ dowShort(d.date) }}</span
            >{{ dm(d.date) }}
          </td>
          <td>
            <i :class="['dot', `m-${d.mark}`]" aria-hidden="true"></i>{{ d.label }}
          </td>
          <td class="n">{{ inOutText(d.in, d.out) }}</td>
          <td class="n">{{ blankNum(d.hours) }}</td>
          <td class="n">{{ blankNum(d.ot) }}</td>
          <td class="n">{{ blankNum(d.makeup) }}</td>
          <td>{{ d.note }}</td>
          <td class="n">{{ signedText(d.adjust) }}</td>
          <td class="n">{{ vnd(d.total) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="sts">
      <div v-for="[label, value] in statCells(sheet.stats)" :key="label">
        <span class="lb">{{ label }}</span
        ><b>{{ value }}</b>
      </div>
    </div>
    <div class="lg">
      <div class="keys">
        <span><i class="dot m-work" aria-hidden="true"></i>Đi làm</span>
        <span><i class="dot m-paid" aria-hidden="true"></i>Nghỉ có lương</span>
        <span><i class="dot m-unpaid" aria-hidden="true"></i>Nghỉ không lương</span>
        <span><i class="dot m-absent" aria-hidden="true"></i>Vắng</span>
        <span><i class="dot m-pending" aria-hidden="true"></i>Chờ giải trình</span>
      </div>
      <p>
        Giờ, OT, Làm bù tính bằng giờ. OT ngày thường ×1,5, thứ 7 và Chủ nhật ×2, ngày lễ ×3. Làm bù là giờ làm để bù cho
        ngày đã nghỉ, không phải OT.
      </p>
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
  gap: 0;
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
.cc {
  width: 698px;
  table-layout: fixed;
  border-collapse: collapse;
}
.cc th,
.cc td {
  box-sizing: border-box;
  padding: 2px 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cc th {
  padding-top: 0;
  padding-bottom: 5px;
  border-bottom: 1.5px solid #212121;
  font-weight: 400;
  color: #616161;
  text-align: left;
}
.cc td {
  height: auto;
  border-top: 0;
  border-bottom: 1px solid #e0e0e0;
}
.cc .n {
  text-align: right;
}
.cc tr.off td {
  background: #f5f5f5;
}
.c-date {
  width: 70px;
}
.c-kind {
  width: 142px;
}
.c-io {
  width: 84px;
}
.c-hrs {
  width: 36px;
}
.c-ot {
  width: 44px;
}
.c-mk {
  width: 54px;
}
.c-note {
  width: 116px;
}
.c-adj,
.c-tot {
  width: 76px;
}
.wd {
  display: inline-block;
  width: 22px;
  color: #616161;
}
.dot {
  display: inline-block;
  box-sizing: border-box;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  vertical-align: middle;
}
.dot.m-work {
  background: #1c1c1c;
}
.dot.m-paid {
  background: #2f5aa8;
}
.dot.m-unpaid {
  border: 2px solid #2f5aa8;
}
.dot.m-absent {
  background: #b43f3f;
}
.dot.m-pending {
  border: 2px solid #eb973d;
}
.sts {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 10px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}
.sts > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 5px 10px;
}
.sts > div:not(:nth-child(5n + 1)) {
  border-left: 1px solid #e0e0e0;
}
.sts > div:nth-child(n + 6) {
  border-top: 1px solid #e0e0e0;
}
.sts b {
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  white-space: nowrap;
}
.lg {
  margin-top: 8px;
  color: #616161;
}
.lg .keys {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 16px;
}
.lg p {
  margin: 2px 0 0;
}
</style>
