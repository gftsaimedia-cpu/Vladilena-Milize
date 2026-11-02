<script setup lang="ts">
// Bản in phiếu lương A4, đúng 2 trang mỗi phiếu (thiết kế gộp 2 trang):
//   trang 1 = đầu phiếu + bảng chấm công từng ngày + dải tóm tắt; trang 2 = tổng hợp lương, chỗ ký, khẩu hiệu.
// Dùng chung cho trang in (/in/phieu-luong/...), hộp xem trước bản in và hộp in tất cả.
// Prop sheet là dữ liệu máy chủ trả (services/payslip.js: getPayslipSheet); thành phần chỉ định dạng, không tính.
import { computed } from 'vue';
import logo from '@/assets/img/gft-logo.png';
import slogan from '@/assets/img/gft-slogan.png';
import watermark from '@/assets/img/gft-watermark.png';
import { dm, dmy, monthShort, num, vnd, vndc } from '@/utils/format';
import { cellText, dayLabel, isZero } from './slipFormat';

const props = defineProps({ sheet: { type: Object as () => any, required: true } });

const tail = computed(() => monthShort(props.sheet.month));
const title = computed(() => `Phiếu lương tháng ${tail.value}`);
const subLine = computed(() => {
  const s = props.sheet;
  const parts = [`Từ ${dm(s.from)} đến ${dmy(s.to)}`];
  if (s.note) parts.push(s.note);
  parts.push(`công chuẩn theo quy chế: ${s.stdDays} ngày`);
  return parts.join(' · ');
});

// Nhãn ca và loại ngày nghỉ (chữ của thiết kế).
const SHIFT = { normal: ['', 'Normal'], flex: ['p-f', 'Flex +20%'], night: ['p-g', 'Night +40%'] };
const OFF = {
  leave: ['p-o', 'Nghỉ phép', 'Hưởng lương ngày'],
  isat: ['p-o', 'iSAT', 'Hưởng lương ngày'],
  holiday: ['p-o', 'Nghỉ lễ', 'Hưởng lương ngày'],
  unpaid: ['p-u', 'Không lương', 'Không tính lương']
};

const dayRows = computed(() =>
  props.sheet.days.map(d => {
    const holidayWorked =
      d.kind === 'holiday' &&
      [d.hours, d.holWorkH, d.otH, d.makeupH].some(value => Number(value) > 0);
    const worked = d.worked ?? (d.kind === 'work' || holidayWorked);
    const off = !worked;
    const [cls, label, note] = d.kind === 'holiday'
      ? OFF.holiday
      : off
        ? OFF[d.kind] || ['p-o', d.kind, '']
        : SHIFT[d.shift] || ['', d.shift, ''];
    return {
      ...d,
      off,
      cls,
      label,
      note,
      label2: dayLabel(d.date),
      tall:
        !off &&
        (d.breakPay > 0 || d.otH > 0 || d.makeupH > 0 || d.otPay > 0 || d.makeupPay > 0 || d.holWorkH > 0 || d.holWorkPay > 0)
    };
  })
);

const stats = computed(() => {
  const s = props.sheet.stats;
  return [
    ['Ngày công', s.count == null ? '—' : `${s.count} ngày`],
    ['Ca Flex · Night', `${s.flex} · ${s.night} ca`],
    ['Nghỉ phép · iSAT', `${num(s.leave)} · ${num(s.isat)} ngày`],
    ['Nghỉ không lương', s.unpaid == null ? '—' : `${s.unpaid} ngày`],
    ['Làm thêm OT', `${num(s.otHours)} giờ`],
    ['Đi muộn, về sớm', `${num(s.short)} giờ`]
  ];
});

const cellClass = (v?, bold?) => (isZero(v) ? 'z' : bold ? 'b' : '');
const cutText = (value?) => (value === 0 ? vnd(value) : `−${vnd(value)}`);
</script>

<template>
  <div class="a4-doc">
    <!-- Trang 1 -->
    <section class="pl-a4">
      <img class="wm" :src="watermark" alt="" />
      <div class="hd"><img :src="logo" alt="GFT" /></div>
      <h1>{{ title }}</h1>
      <div class="sub">{{ subLine }}</div>
      <div class="a4-who">
        <div>
          <span>Họ tên</span><b>{{ sheet.name }}</b>
        </div>
        <div>
          <span>Loại · bậc</span><b>{{ sheet.role }}</b>
        </div>
        <div>
          <span>Tình trạng</span><b>{{ sheet.status }}</b>
        </div>
        <div v-if="sheet.employeeStatus">
          <span>Trạng thái nhân sự</span><b>{{ sheet.employeeStatus }}</b>
        </div>
        <div>
          <span>Kỳ lương</span><b>Tháng {{ tail }}</b>
        </div>
      </div>
      <div class="cc-h">
        <h2>Chấm công tháng {{ tail }}</h2>
        <span>Theo lịch đã khai · tiền tính bằng đồng</span>
      </div>
      <table class="cc">
        <colgroup>
          <col style="width: 86px" />
          <col style="width: 94px" />
          <col style="width: 84px" />
          <col style="width: 42px" />
          <col style="width: 64px" />
          <col style="width: 84px" />
          <col style="width: 88px" />
          <col style="width: 56px" />
          <col style="width: 82px" />
        </colgroup>
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Ca</th>
            <th>Vào – ra</th>
            <th>Giờ làm</th>
            <th>Lương ngày</th>
            <th>Phụ cấp ca</th>
            <th>Làm thêm</th>
            <th>Trừ giờ</th>
            <th>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in dayRows" :key="d.date" :class="{ off: d.off, two: d.tall }">
            <td>{{ d.label2 }}</td>
            <td>
              <span v-if="d.cls" class="ccp" :class="d.cls">{{ d.label }}</span>
              <span v-else class="plain">{{ d.label }}</span>
            </td>
            <template v-if="d.off">
              <td colspan="2" class="cnote">{{ d.note }}</td>
              <td :class="{ z: d.total == null || d.total === 0 }">{{ d.daily == null ? '—' : vnd(d.total === 0 ? 0 : d.daily) }}</td>
              <td><span class="zz">—</span></td>
              <td><span class="zz">—</span></td>
              <td><span class="zz">—</span></td>
              <td class="b">{{ vnd(d.total) }}</td>
            </template>
            <template v-else>
              <td class="io">{{ d.in }}–{{ d.out }}</td>
              <td>{{ num(d.hours) }}</td>
              <td>{{ vnd(d.daily) }}</td>
              <td>
                <template v-if="d.bonus != null || d.breakPay != null">
                  <template v-if="d.bonus != null">+{{ vnd(d.bonus) }}</template>
                  <span v-else class="zz">—</span>
                  <i v-if="d.breakPay > 0">+{{ vnd(d.breakPay) }} Off Paid</i>
                  <span v-else-if="d.breakPay === 0">+{{ vnd(d.breakPay) }} Off Paid</span>
                </template>
                <span v-else class="zz">—</span>
              </td>
              <td>
                <template
                  v-if="d.otH != null || d.otPay != null || d.makeupH != null || d.makeupPay != null || (d.kind === 'holiday' && (d.holWorkH != null || d.holWorkPay != null))"
                >
                  <div class="extra-line" :class="{ zz: d.otPay == null && d.otH == null }">
                    OT <span v-if="d.otPay != null">+{{ vnd(d.otPay) }}</span><span v-else>—</span> ·
                    <span v-if="d.otH != null">{{ num(d.otH) }}h</span><span v-else>—</span>
                  </div>
                  <div class="extra-line" :class="{ zz: d.makeupPay == null && d.makeupH == null }">
                    Làm bù <span v-if="d.makeupPay != null">+{{ vnd(d.makeupPay) }}</span><span v-else>—</span> ·
                    <span v-if="d.makeupH != null">{{ num(d.makeupH) }}h</span><span v-else>—</span>
                  </div>
                  <div
                    v-if="d.kind === 'holiday' && (d.holWorkH != null || d.holWorkPay != null)"
                    class="extra-line"
                    :class="{ zz: d.holWorkPay == null && d.holWorkH == null }"
                  >
                    Làm lễ <span v-if="d.holWorkPay != null">+{{ vnd(d.holWorkPay) }}</span><span v-else>—</span> ·
                    <span v-if="d.holWorkH != null">{{ num(d.holWorkH) }}h</span><span v-else>—</span>
                  </div>
                </template>
                <span v-else class="zz">—</span>
              </td>
              <td>
                <span v-if="d.cut != null" class="neg">{{ cutText(d.cut) }}</span>
                <span v-else class="zz">—</span>
              </td>
              <td class="b">{{ vnd(d.total) }}</td>
            </template>
          </tr>
        </tbody>
      </table>
      <div class="a4-who cc-sum">
        <div v-for="[label, value] in stats" :key="label">
          <span>{{ label }}</span
          ><b>{{ value }}</b>
        </div>
      </div>
      <div class="ft">
        <span></span><img class="slogan" :src="slogan" alt="Trao trọn niềm tin, gửi trọn giải pháp." /><span
          >Trang 1/2</span
        >
      </div>
    </section>

    <!-- Trang 2 -->
    <section class="pl-a4">
      <img class="wm" :src="watermark" alt="" />
      <div class="hd2">
        <img :src="logo" alt="GFT" />
        <div>
          <b>{{ title }}</b
          ><span>{{ sheet.name }} · {{ sheet.role }}</span>
        </div>
      </div>
      <div class="cc-h">
        <h2>Tổng hợp lương</h2>
        <span>Số tiền tính bằng đồng</span>
      </div>
      <table class="lines">
        <colgroup>
          <col />
          <col style="width: 130px" />
          <col style="width: 130px" />
        </colgroup>
        <thead>
          <tr>
            <th>Khoản</th>
            <th>Theo quy chế</th>
            <th>Thực tế</th>
          </tr>
        </thead>
        <tbody v-for="sec in sheet.sections" :key="sec.title">
          <tr class="g">
            <td colspan="3">{{ sec.title }}</td>
          </tr>
          <template v-for="(row, i) in sec.rows" :key="i">
            <tr v-if="row.parts" class="kps">
              <td colspan="3">
                <div>
                  <span v-for="[label, value] in row.parts" :key="label">
                    <i>{{ label }}</i
                    ><b>{{ value }}</b>
                  </span>
                </div>
              </td>
            </tr>
            <tr v-else>
              <td>{{ row.label }}</td>
              <td :class="cellClass(row.std, row.b)">{{ cellText(row.std) }}</td>
              <td :class="cellClass(row.act, row.b)">{{ row.act == null ? '—' : cellText(row.act) }}</td>
            </tr>
          </template>
        </tbody>
      </table>
      <table class="tot">
        <colgroup>
          <col />
          <col style="width: 200px" />
        </colgroup>
        <tbody>
          <tr v-for="t in sheet.totals" :key="t.label" :class="{ k: t.k }">
            <td>{{ t.label }}</td>
            <td>{{ vnd(t.value) }}</td>
          </tr>
          <tr class="net">
            <td>Thực nhận</td>
            <td>{{ vndc(sheet.net) }}</td>
          </tr>
          <tr>
            <td>Ngày phép năm còn lại</td>
            <td>{{ sheet.leaveLeft }} ngày</td>
          </tr>
        </tbody>
      </table>
      <div class="sign">
        <div><b>Người nhận</b><span>Ký, ghi rõ họ tên</span></div>
      </div>
      <div class="ft">
        <span></span><img class="slogan" :src="slogan" alt="Trao trọn niềm tin, gửi trọn giải pháp." /><span
          >Trang 2/2</span
        >
      </div>
    </section>
  </div>
</template>

<style>
/* In: khổ A4, không lề, giữ nền; mỗi trang một tờ (hai trang mỗi phiếu). */
@page {
  size: A4;
  margin: 0;
}
@media print {
  html,
  body {
    background: #fff !important;
  }
  .pl-a4 {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    box-shadow: none !important;
    margin: 0 !important;
    break-after: page;
    page-break-after: always;
  }
}
</style>

<style scoped>
.pl-a4 {
  width: 210mm;
  height: 296mm;
  padding: 40px 56px 32px;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  color: #212121;
  font-family: Geist, system-ui, sans-serif;
  font-size: 11.5px;
  line-height: 15px;
  -webkit-font-smoothing: antialiased;
}
/* hình chìm nằm dưới chữ: mọi phần tử còn lại là positioned và vẽ sau nó */
.pl-a4 > :not(.wm) {
  position: relative;
}
.wm {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 430px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.hd {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.hd img {
  width: 78px;
}
h1 {
  font-family: 'League Spartan', Geist, sans-serif;
  font-weight: 600;
  font-size: 24px;
  line-height: 28px;
  margin: 14px 0 2px;
}
.sub {
  color: #616161;
  font-size: 12px;
}
.a4-who {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr 1fr;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  margin: 14px 0 12px;
}
.a4-who div {
  padding: 8px 12px;
}
.a4-who div + div {
  border-left: 1px solid #e0e0e0;
}
.a4-who span {
  display: block;
  color: #757575;
  font-size: 10px;
}
.a4-who b {
  font-size: 13px;
  font-weight: 600;
}
.a4-who.cc-sum {
  grid-template-columns: repeat(6, 1fr);
  margin: 12px 0 0;
}
.a4-who.cc-sum b {
  font-size: 12.5px;
}
.cc-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 6px 0 6px;
}
.cc-h h2 {
  margin: 0;
  font-family: 'League Spartan', Geist, sans-serif;
  font-size: 15px;
  line-height: 18px;
  font-weight: 600;
  color: #212121;
}
.cc-h span {
  font-size: 10px;
  color: #757575;
}
.hd2 {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid #e0e0e0;
}
.hd2 img {
  width: 54px;
  height: auto;
}
.hd2 b {
  display: block;
  font-family: 'League Spartan', Geist, sans-serif;
  font-size: 16px;
  line-height: 20px;
  font-weight: 600;
}
.hd2 span {
  font-size: 11px;
  color: #757575;
}

/* bảng dùng chung */
.pl-a4 table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.pl-a4 th {
  font-size: 10px;
  font-weight: 500;
  color: #757575;
  text-align: right;
  padding: 0 8px 5px;
  white-space: nowrap;
}
.pl-a4 th:first-child {
  text-align: left;
  padding-left: 10px;
}
.pl-a4 td {
  padding: 0 8px;
  height: 19px;
  border-top: 1px solid #efefef;
  text-align: right;
  white-space: nowrap;
}
.pl-a4 td:first-child {
  text-align: left;
  padding-left: 10px;
}
.pl-a4 tr.g td {
  background: #f5f5f5;
  height: 20px;
  font-size: 10px;
  font-weight: 600;
  color: #616161;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  border-top: 1px solid #e6e6e6;
}
.pl-a4 td.z {
  color: #a8a8a8;
}
.pl-a4 td.b {
  font-weight: 600;
}

/* trang 1: bảng chấm công */
.pl-a4 table.cc th:nth-child(2),
.pl-a4 table.cc th:nth-child(3) {
  text-align: left;
}
.pl-a4 table.cc td {
  height: 22px;
  padding: 0 6px;
  font-size: 11px;
}
.pl-a4 table.cc th {
  padding: 0 6px 5px;
}
.pl-a4 table.cc td:first-child {
  padding-left: 10px;
  color: #424242;
}
.pl-a4 table.cc td:nth-child(2),
.pl-a4 table.cc td.io,
.pl-a4 table.cc td.cnote {
  text-align: left;
}
.pl-a4 table.cc tr.two td {
  height: 32px;
  line-height: 13px;
}
.pl-a4 table.cc td i {
  display: block;
  font-style: normal;
  font-size: 9.5px;
  line-height: 12px;
  color: #757575;
}
.pl-a4 table.cc td .extra-line {
  font-size: 8.5px;
  line-height: 10px;
}
.pl-a4 table.cc td.cnote {
  color: #757575;
}
.pl-a4 table.cc tr.off td {
  background: #fafafa;
}
.pl-a4 table.cc .zz,
.pl-a4 table.cc td.z {
  color: #bdbdbd;
}
.pl-a4 table.cc .neg {
  color: #212121;
}
.pl-a4 table.cc td .plain {
  color: #424242;
}
.ccp {
  display: inline-block;
  vertical-align: middle;
  margin: 0;
  height: auto;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 14px;
  font-weight: 500;
  white-space: nowrap;
}
.p-f {
  background: #fff1b8;
  color: #6b4e12;
}
.p-g {
  background: #212121;
  color: #fff;
}
.p-o {
  border: 1px dashed #9e9e9e;
  color: #424242;
  padding: 0 6px;
}
.p-u {
  border: 1px solid #d6d6d6;
  color: #9e9e9e;
  padding: 0 6px;
}

/* trang 2: tổng hợp */
.pl-a4 table.lines td {
  height: 21px;
}
.pl-a4 tr.kps td {
  height: auto;
  padding: 4px 10px 3px;
  text-align: left;
}
.kps div {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0 8px;
}
.kps span {
  display: block;
}
.kps i {
  display: block;
  font-style: normal;
  font-size: 10px;
  line-height: 13px;
  color: #757575;
}
.kps b {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
}
.pl-a4 table.tot {
  margin-top: 10px;
  border-top: 1.5px solid #212121;
}
.pl-a4 table.tot td {
  height: 23px;
}
.pl-a4 table.tot tr.k td {
  font-weight: 600;
}
.pl-a4 table.tot tr.net td {
  background: #fff9ec;
  height: 38px;
  font-size: 15px;
  font-weight: 700;
  border-top: 1.5px solid #212121;
  border-bottom: 1.5px solid #212121;
}
.sign {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  text-align: center;
}
.sign > div {
  min-height: 96px;
}
.sign b {
  display: block;
  font-size: 12px;
}
.sign span {
  color: #757575;
  font-size: 10px;
}

/* chân trang: khẩu hiệu giữa, số trang bên phải */
.ft {
  margin-top: auto;
  border-top: 1px solid #bdbdbd;
  padding-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #757575;
  font-size: 10px;
}
.ft > span {
  width: 90px;
}
.ft > span:last-child {
  text-align: right;
}
.ft .slogan {
  width: 158px;
  height: auto;
  margin: -3px 0;
}
</style>
