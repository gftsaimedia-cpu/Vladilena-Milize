<script setup lang="ts">
// Bảng lương: cột trái (nhân viên) và hai cột phải (Thực nhận, Trạng thái) đứng yên, phần giữa cuộn ngang.
// Mỗi ô một giá trị; số 0 hiện "—". Màu nền ô dùng token để chạy đúng ở cả nền Xám và Kem.
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { PayrollLine } from '@/mock/payroll';
import { vnd } from '@/utils/format';
import { useDragScroll } from '../useDragScroll';
import StatusPill from './StatusPill.vue';

// openId: mã phiếu đang mở trong ngăn kéo; dòng đó đổi nền và gạch chân tên.
const props = defineProps<{ lines: PayrollLine[]; month: number; openId: string }>();
// Mã phiếu đã tích; chỉ dùng cho nút xuất (spec 3.4), dòng được tích không đổi nền.
const selected = defineModel<string[]>('selected', { required: true });

const scr = ref<HTMLElement | null>(null);
useDragScroll(scr);

// PayrollView đưa tiêu điểm về đây khi đóng phiếu (dòng của phiếu đó có thể đã rời bộ lọc).
defineExpose({
  focusLink(id: string) {
    const link = scr.value?.querySelector<HTMLElement>(`a.nn[data-id="${id}"]`);
    link?.focus();
    return !!link;
  },
  focusRegion: () => scr.value?.focus()
});

const route = useRoute();
const slipLink = (line: PayrollLine) => ({ path: route.path, query: { ...route.query, phieu: line.id } });

const money = (n: number) => (n === 0 ? '—' : vnd(n));
const cut = (n: number) => (n === 0 ? '—' : `−${vnd(n)}`);
const missing = (line: PayrollLine) => (line.kpiMissing.length ? `Thiếu điểm ${line.kpiMissing.join(', ')}, tính 0` : '');

type Sum = 'workPay' | 'kpiPay' | 'allowance' | 'ot' | 'lateCut' | 'gross' | 'insurance' | 'tax' | 'advance' | 'net';
const sum = (key: Sum) => props.lines.reduce((a, l) => a + l[key], 0);
const total = computed(() => ({
  workPay: sum('workPay'),
  kpiPay: sum('kpiPay'),
  allowance: sum('allowance'),
  ot: sum('ot'),
  lateCut: sum('lateCut'),
  gross: sum('gross'),
  insurance: sum('insurance'),
  tax: sum('tax'),
  advance: sum('advance'),
  net: sum('net')
}));
</script>

<template>
  <div>
    <div ref="scr" class="scr" role="region" :aria-label="`Bảng lương tháng ${month}, cuộn ngang để xem các khoản`" tabindex="0">
      <table class="tp">
        <colgroup>
          <col class="c-who" />
          <col style="width: 96px" />
          <col style="width: 132px" />
          <col style="width: 124px" />
          <col style="width: 116px" />
          <col style="width: 108px" />
          <col style="width: 100px" />
          <col style="width: 140px" />
          <col style="width: 116px" />
          <col style="width: 112px" />
          <col style="width: 108px" />
          <col style="width: 136px" />
          <col style="width: 128px" />
        </colgroup>
        <thead>
          <tr>
            <th rowspan="2" scope="col" class="pt-who">Nhân viên</th>
            <th rowspan="2" scope="col" class="m">Ngày công</th>
            <th colspan="6" scope="colgroup" class="gh"><span>Thu nhập</span></th>
            <th colspan="3" scope="colgroup" class="gh ded-h"><span>Khấu trừ</span></th>
            <th rowspan="2" scope="col" class="m net">Thực nhận</th>
            <th rowspan="2" scope="col" class="st">Trạng thái</th>
          </tr>
          <tr>
            <th scope="col" class="m">Tiền ngày công</th>
            <th scope="col" class="m">Lương KPI</th>
            <th scope="col" class="m">Phụ cấp</th>
            <th scope="col" class="m">Làm thêm</th>
            <th scope="col" class="m">Trừ giờ</th>
            <th scope="col" class="m">Tổng thu nhập</th>
            <th scope="col" class="m ded-h">Bảo hiểm</th>
            <th scope="col" class="m ded-h">Thuế TNCN</th>
            <th scope="col" class="m ded-h">Tạm ứng</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in lines" :key="line.id" :class="{ open: line.id === openId }">
            <th scope="row" class="pt-who">
              <span class="cell">
                <input v-model="selected" type="checkbox" class="pk" :value="line.id" :aria-label="`Chọn phiếu của ${line.name}`" />
                <span class="pt-av" aria-hidden="true">{{ line.initials }}</span>
                <span class="id">
                  <RouterLink :to="slipLink(line)" replace draggable="false" class="nn" :data-id="line.id">{{ line.name }}</RouterLink>
                  <span class="dp">{{ line.dept }} · {{ line.title }}</span>
                </span>
              </span>
            </th>
            <td class="m">
              {{ line.days }}<span class="mut"> / {{ line.standard }}</span>
            </td>
            <td class="m">{{ money(line.workPay) }}</td>
            <td class="m kp" :title="missing(line) || undefined">
              <i v-if="line.kpiMissing.length" class="kt" aria-hidden="true" />
              <span v-if="line.kpiMissing.length" class="sr-only">{{ missing(line) }}. </span>{{ money(line.kpiPay) }}
            </td>
            <td class="m">{{ money(line.allowance) }}</td>
            <td class="m">{{ money(line.ot) }}</td>
            <td class="m">{{ cut(line.lateCut) }}</td>
            <td class="m strong">{{ money(line.gross) }}</td>
            <td class="m ded">{{ money(line.insurance) }}</td>
            <td class="m ded">{{ money(line.tax) }}</td>
            <td class="m ded">{{ money(line.advance) }}</td>
            <td class="m net">{{ money(line.net) }}</td>
            <td class="st">
              <StatusPill :status="line.status" />
            </td>
          </tr>
        </tbody>
        <tfoot v-if="lines.length">
          <tr>
            <th scope="row" class="pt-who">Tổng {{ lines.length }} phiếu đang hiện</th>
            <td class="m"></td>
            <td class="m">{{ money(total.workPay) }}</td>
            <td class="m">{{ money(total.kpiPay) }}</td>
            <td class="m">{{ money(total.allowance) }}</td>
            <td class="m">{{ money(total.ot) }}</td>
            <td class="m">{{ cut(total.lateCut) }}</td>
            <td class="m strong">{{ money(total.gross) }}</td>
            <td class="m ded">{{ money(total.insurance) }}</td>
            <td class="m ded">{{ money(total.tax) }}</td>
            <td class="m ded">{{ money(total.advance) }}</td>
            <td class="m net">{{ money(total.net) }}</td>
            <td class="st"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p v-if="!lines.length" class="none">Không có phiếu nào khớp.</p>
  </div>
</template>

<style scoped>
.scr {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--status-draft) transparent;
  border-top: 1px solid var(--border);
}
.scr.dragging {
  cursor: grabbing;
  user-select: none;
}
.scr:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
/* Bề rộng cột nhân viên (--who) là một nguồn: <col>, bề rộng cả bảng và chữ nhóm dính trái đều tính từ nó.
   Bảng phải rộng đúng tổng các cột (--who + 1416px của 12 cột còn lại): để max-content thì ô tên rộng hơn --who
   kéo bảng rộng ra và phần dư dồn vào cột đầu. */
.tp {
  --who: 296px;
  width: calc(var(--who) + 1416px);
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-variant-numeric: tabular-nums;
}
.tp th,
.tp td {
  padding: 0 14px;
  height: 52px;
  border-top: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  white-space: nowrap;
}
.tp thead th {
  height: 36px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--muted);
  text-align: left;
}
.tp thead .gh {
  height: 28px;
  font-weight: 600;
  color: var(--text);
  text-align: center;
  padding: 0;
}
/* Nhãn nằm giữa nhóm; dính trái (cột nhân viên + 14px đệm: 310px, 198px dưới 768px) để mép trái nhóm trôi dưới cột đứng yên thì nhãn bị đẩy sang phải,
   dính phải 14px để nhóm bị cắt ở mép phải thì nhãn vẫn nằm trong phần nhìn thấy.
   Ô nhóm không đệm: nhãn dính chỉ trượt trong ô của nó, nên đệm 14px sẽ đẩy nhãn ra khỏi phần nhìn thấy khi ô chỉ ló ra vài chục px. */
.tp thead .gh > span {
  display: inline-block;
  position: sticky;
  left: calc(var(--who) + 14px);
  right: 14px;
}
.tp .ded-h {
  background: var(--ground);
}
.tp td.ded {
  background: var(--raised);
}
.tp .m {
  text-align: right;
}
.tp td.kp {
  position: relative;
}
.tp td.strong,
.tp td.net {
  font-weight: 600;
}
.tp td.net {
  font-size: 15px;
}
/* Bề rộng đặt ở <col>: với table-layout fixed, <col> thắng width của ô (một style inline trên <col> từng thắng cả @media). */
.tp col.c-who {
  width: var(--who);
}
/* Cột đứng yên: trái là Nhân viên, phải là Thực nhận và Trạng thái. */
.tp .pt-who {
  position: sticky;
  left: 0;
  z-index: 2;
  text-align: left;
  border-right: 1px solid var(--border);
  font-size: 14px;
  font-weight: 400;
}
.cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tp .net {
  position: sticky;
  right: 128px;
  z-index: 2;
  width: 136px;
  border-left: 1px solid var(--border);
}
.tp .st {
  position: sticky;
  right: 0;
  z-index: 2;
  width: 128px;
  text-align: left;
}
.pk {
  width: 16px;
  height: 16px;
  margin: 0;
  flex: none;
  accent-color: var(--surface-dark);
  cursor: pointer;
}
.pk:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.pt-av {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--status-draft);
  font-size: 11px;
  font-weight: 600;
}
.id {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.nn {
  display: block;
  align-self: flex-start;
  max-width: 100%;
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nn:hover {
  text-decoration: underline;
}
.nn:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
/* Dòng đang mở ở ngăn kéo: nền vàng nhạt trên mọi ô (thắng cả nền ô khấu trừ), tên gạch chân. */
.tp tbody tr.open > th,
.tp tbody tr.open > td {
  background: var(--gold-pale);
}
.tp tr.open .nn {
  text-decoration: underline;
}
.dp {
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
}
.mut {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
.kt {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--status-pending);
  vertical-align: 1px;
}
.tp tfoot th,
.tp tfoot td,
.tp tfoot td.ded {
  height: 48px;
  border-bottom: 0;
  background: var(--ground);
  font-weight: 600;
}
/* Nền Gọn (base.css) chỉ hạ chiều cao của td; ô tiêu đề dòng theo cùng độ cao. */
:root[data-density='gon'] .tp tbody th.pt-who,
:root[data-density='gon'] .tp tfoot th.pt-who {
  height: 42px;
}
.none {
  margin: 0;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  text-align: center;
  color: var(--muted);
}
/* Dưới 768px: Thực nhận và Trạng thái cuộn cùng phần giữa; cột trái còn 184px, ẩn avatar. */
@media (max-width: 767px) {
  .tp .net,
  .tp .st {
    position: static;
  }
  .tp {
    --who: 184px;
  }
  .pt-av {
    display: none;
  }
}
</style>
