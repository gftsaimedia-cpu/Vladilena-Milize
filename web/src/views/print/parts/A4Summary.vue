<script setup lang="ts">
// Nội dung trang 2 của phiếu lương A4: đầu trang chạy, bảng các khoản theo nhóm, dòng tổng, Thực nhận và ô ký nhận.
import { useId } from 'vue';
import logo from '@/assets/img/gft-logo.png';
import type { A4Sheet } from '@/mock/payslip-a4';
import { monthShort, vndc } from '@/utils/format';
import { actualText, qtyText, ruleText, scoreText, staffLine } from './a4-format';

defineProps<{ sheet: A4Sheet }>();
const headingId = useId();
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
      <h2 :id="headingId">Tổng hợp lương</h2>
      <span class="lb">Số tiền tính bằng đồng</span>
    </div>
    <table class="ts" :aria-labelledby="headingId">
      <thead>
        <tr>
          <th>Khoản</th>
          <th class="c-qty">Số lượng</th>
          <th class="c-rule">Theo quy chế</th>
          <th class="c-act">Thực tế</th>
        </tr>
      </thead>
      <tbody class="lines">
        <template v-for="g in sheet.groups" :key="g.title">
          <tr class="grp">
            <th colspan="4" scope="colgroup">{{ g.title }}</th>
          </tr>
          <tr v-if="g.kpi" class="kpi">
            <td colspan="4">
              <div v-for="k in g.kpi" :key="k.label">
                <span class="lb">{{ k.label }} {{ k.weight }}%</span><b>{{ scoreText(k.score) }}</b>
              </div>
            </td>
          </tr>
          <tr v-for="l in g.lines" :key="l.label" :class="['ln', { bb: l.bold }]">
            <td><i v-if="l.flag" class="dt" aria-hidden="true"></i>{{ l.label }}<span v-if="l.hint" class="lb"> · {{ l.hint }}</span></td>
            <td>{{ qtyText(l.qty) }}</td>
            <td>{{ ruleText(l.rule) }}</td>
            <td>
              <template v-if="actualText(l.actual) !== null">{{ actualText(l.actual) }}</template>
              <span v-else class="lb">BE tính</span>
            </td>
          </tr>
        </template>
      </tbody>
      <tbody class="sum">
        <tr v-for="l in sheet.totals" :key="l.label" :class="['ln', { bb: l.bold }]">
          <td><i v-if="l.flag" class="dt" aria-hidden="true"></i>{{ l.label }}<span v-if="l.hint" class="lb"> · {{ l.hint }}</span></td>
          <td>{{ qtyText(l.qty) }}</td>
          <td>{{ ruleText(l.rule) }}</td>
          <td>
            <template v-if="actualText(l.actual) !== null">{{ actualText(l.actual) }}</template>
            <span v-else class="lb">BE tính</span>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="net">
      <span>Thực nhận</span><span>{{ vndc(sheet.net) }}</span>
    </div>
    <div class="end">
      <div>
        <span class="lb">Ngày phép năm còn lại</span> <b>{{ sheet.leaveLeft == null ? '—' : `${sheet.leaveLeft} ngày` }}</b>
      </div>
      <div class="sign">
        <b>Người nhận</b><span class="lb">Ký, ghi rõ họ tên</span>
      </div>
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
.ts {
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
}
/* ghi đè các luật bảng toàn cục của base.css (cao 56px, vạch trên, đệm 24px ở ô đầu và cuối) */
.ts th,
.ts td {
  box-sizing: border-box;
  height: auto;
  padding: 2px 6px;
  border-top: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}
.ts th:first-child,
.ts td:first-child {
  text-align: left;
}
.ts thead th {
  padding-top: 0;
  padding-bottom: 5px;
  border-bottom: 1.5px solid #212121;
  font-weight: 400;
  color: #616161;
}
.c-qty {
  width: 96px;
}
.c-rule,
.c-act {
  width: 112px;
}
.ts td {
  border-bottom: 1px solid #e0e0e0;
}
.ts tr.grp th {
  border-top: 6px solid transparent;
  border-bottom: 0;
  background: #f5f5f5;
  background-clip: padding-box;
  color: #616161;
  font-weight: 600;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.ts tr.kpi td {
  padding: 4px 6px;
  white-space: normal;
  text-align: left;
}
.ts tr.kpi div {
  display: inline-block;
  box-sizing: border-box;
  width: 20%;
  vertical-align: top;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts tr.kpi .lb {
  display: block;
}
.ts tr.kpi b {
  display: block;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
}
.ts tr.bb td {
  font-weight: 600;
}
.ts tr.bb .lb {
  font-weight: 400;
}
.dt {
  display: inline-block;
  box-sizing: border-box;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border: 2px solid #eb973d;
  border-radius: 50%;
  vertical-align: middle;
}
/* khoảng cách 8px và vạch 2px trên khối tổng: vẽ vạch bằng nền để đệm trên nằm phía trên vạch */
.ts tbody.sum tr:first-child td {
  padding-top: 12px;
  background: linear-gradient(#212121, #212121) 0 8px / 100% 2px no-repeat;
}
.net {
  display: flex;
  justify-content: space-between;
  padding: 7px 6px;
  border-top: 2px solid #212121;
  border-bottom: 2px solid #212121;
  background: #fff9ec;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.end {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.end b {
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
}
.sign {
  box-sizing: border-box;
  width: 220px;
  min-height: 72px;
  text-align: center;
}
.sign b,
.sign .lb {
  display: block;
}
</style>
