<script setup lang="ts">
// Lưới chấm công 28 ngày: nhãn tuần, chú giải màu kèm số ô trong tuần đang xem, bảng cuộn ngang (cột tên và 3 cột tổng dính).
// Lúc mở cuộn tới tuần hôm nay (26/10); `start` là chỉ số ngày đầu tuần đang xem. Kéo, phím và nút tuần nằm trong useGridScroll.
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { GROUPS, type AttendanceDay, type AttendanceRow } from '@/mock/attendance';
import { dm, dmy, weekdayName } from '@/utils/format';
import { employeePath } from '../links';
import { useGridScroll } from '../useGridScroll';

const props = defineProps<{ days: AttendanceDay[]; rows: AttendanceRow[]; monthNo: number }>();
const emit = defineEmits<{ 'open-day': [personId: string, date: string] }>();

const route = useRoute();
const scroller = ref<HTMLElement | null>(null);
const { start, atStart, atEnd, prevWeek, nextWeek, thisWeek } = useGridScroll(scroller);
const prevBtn = ref<HTMLButtonElement | null>(null);
const nextBtn = ref<HTMLButtonElement | null>(null);

// Nút đang giữ focus mà bị tắt (tới đầu hoặc cuối lưới) làm focus rơi về body: chuyển sang nút tuần còn lại.
// watch chạy trước lần vẽ lại, lúc nút còn bật và còn giữ focus.
watch(atStart, now => {
  if (now && document.activeElement === prevBtn.value && !atEnd.value) nextBtn.value?.focus();
});
watch(atEnd, now => {
  if (now && document.activeElement === nextBtn.value && !atStart.value) prevBtn.value?.focus();
});

const label = computed(() => `${dm(props.days[start.value].iso)} – ${dmy(props.days[start.value + 6].iso)}`);
const counts = computed(() =>
  GROUPS.map(({ key, label: name }) => {
    let n = 0;
    for (const row of props.rows) {
      for (let i = start.value; i < start.value + 7; i++) if (row.cells[i].kind === key) n++;
    }
    return { key, name, n };
  })
);
const thang = computed(() => (route.query.thang ? { thang: route.query.thang } : {}));
const cellName = (name: string, day: AttendanceDay, aria: string) =>
  `${name}, ${weekdayName(day.iso)} ${day.dm}: ${aria}`;
// Danh sách chỉ hiện giá trị chính: ca dự kiến (chưa xảy ra) là ô trống, giờ ca nằm ở tên truy cập và hộp chi tiết ngày.
const cellText = (cell: { kind: string; text: string }) => (cell.kind === 'fu' ? '' : cell.text);
</script>

<template>
  <div class="wk">
    <div class="wk-bar">
      <button ref="prevBtn" type="button" class="btn sm" :disabled="atStart" @click="prevWeek">Tuần trước</button>
      <span class="wk-label" aria-live="polite">{{ label }}</span>
      <button ref="nextBtn" type="button" class="btn sm" :disabled="atEnd" @click="nextWeek">Tuần sau</button>
      <button type="button" class="btn sm" @click="thisWeek">Hôm nay</button>
    </div>
    <div class="legend" role="group" aria-label="Chú giải">
      <span v-for="g in counts" :key="g.key" class="gc" :data-group="g.key">
        <span class="b" :class="g.key" aria-hidden="true" />{{ g.name }} <span class="ct">{{ g.n }}</span>
      </span>
      <span class="gc fu"><span class="b fu" aria-hidden="true" />Ca dự kiến</span>
    </div>
  </div>
  <div ref="scroller" class="scr" role="region" aria-label="Lưới chấm công" tabindex="0">
    <table class="tw" :style="{ '--days': days.length }">
      <colgroup>
        <col class="c-nm" />
        <col v-for="d in days" :key="d.iso" class="c-day" />
        <col class="c-sm" />
        <col class="c-sm" />
        <col class="c-sm" />
      </colgroup>
      <thead>
        <tr>
          <th class="nm" scope="col">Nhân viên</th>
          <th
            v-for="d in days"
            :key="d.iso"
            class="dc"
            :class="{ we: !d.scheduled, now: d.today, mon: d.monday, pb: d.periodStart }"
            :data-date="d.iso"
            scope="col"
          >
            <span class="wd">{{ d.dow }}{{ d.periodStart ? ` · kỳ ${monthNo + 1}` : '' }}</span>
            <span class="dn">{{ d.dm }}</span>
          </th>
          <th class="sm s1" scope="col"><span class="sh">Công</span> <span class="mut">kỳ {{ monthNo }}</span></th>
          <th class="sm s2" scope="col"><span class="sh">Trễ</span> <span class="mut">phút</span></th>
          <th class="sm s3" scope="col"><span class="sh">OT</span> <span class="mut">giờ</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.person.id">
          <th class="nm" scope="row">
            <span class="av" aria-hidden="true">{{ row.person.initials }}</span>
            <RouterLink :to="{ path: employeePath(row.person.id), query: thang }" class="lk" draggable="false">
              <span class="nn">{{ row.person.name }}</span>
            </RouterLink>
          </th>
          <td v-for="(d, i) in days" :key="d.iso" class="dc" :class="{ now: d.today, mon: d.monday, pb: d.periodStart }">
            <span
              v-if="row.cells[i].kind === 'off'"
              class="pill off"
              role="img"
              :aria-label="cellName(row.person.name, d, row.cells[i].aria)"
            />
            <button
              v-else
              type="button"
              class="pill"
              :class="[row.cells[i].kind, { live: row.cells[i].live }]"
              :aria-label="cellName(row.person.name, d, row.cells[i].aria)"
              @click="emit('open-day', row.person.id, d.iso)"
            >
              <span v-if="row.cells[i].live" class="dot" aria-hidden="true" />{{ cellText(row.cells[i]) }}
            </button>
          </td>
          <td class="sm s1">{{ row.person.period.worked }}</td>
          <td class="sm s2">{{ row.person.sums.late }}</td>
          <td class="sm s3">{{ row.person.sums.ot }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <p v-if="!rows.length" class="none">Không có nhân viên nào khớp.</p>
</template>

<style scoped>
.wk {
  padding: 0 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.wk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wk-label {
  min-width: 150px;
  text-align: center;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.wk-bar .btn:disabled {
  opacity: 0.45;
}
.scr.dragging {
  cursor: grabbing;
}
.scr {
  max-width: 1084px; /* 220 + 7 · 96 + 3 · 64: không bao giờ thấy quá 7 ngày */
  overflow-x: auto;
  overscroll-behavior-x: contain;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  scrollbar-width: thin;
  scrollbar-color: var(--status-draft) transparent;
  scroll-padding-left: 220px;
  scroll-padding-right: 192px;
  border-top: 1px solid var(--border);
}
.scr:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.tw {
  /* Bề rộng cột nằm ở ba biến này; bảng rộng đúng tổng của chúng. Để max-content, nội dung ô nở cột ngày khi phông chữ tải xong
     (97–98px thay vì 96px) nên lúc bắt cột và vị trí tuần hôm nay bị lệch. */
  --w-nm: 220px;
  --w-day: 96px;
  --w-sm: 64px;
  width: calc(var(--w-nm) + var(--days) * var(--w-day) + 3 * var(--w-sm));
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-variant-numeric: tabular-nums;
}
.tw col.c-nm {
  width: var(--w-nm);
}
.tw col.c-day {
  width: var(--w-day);
}
.tw col.c-sm {
  width: var(--w-sm);
}
table.tw th.dc,
table.tw td.dc {
  overflow: hidden;
}
table.tw th,
table.tw td {
  padding: 0;
  border-top: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
table.tw thead th {
  height: 52px;
  font-size: 12px;
  line-height: 14px;
  font-weight: 500;
  color: var(--muted);
}
table.tw th.dc {
  text-align: center;
}
.tw .wd {
  display: block;
  white-space: nowrap;
}
.tw .dn {
  display: inline-grid;
  place-items: center;
  height: 20px;
  margin-top: 2px;
  padding: 0 8px;
  border-radius: 50px;
  font-size: 12px;
  line-height: 16px;
  color: var(--text);
}
table.tw th.we {
  color: var(--ink-on-dark-muted);
}
.tw th.we .dn {
  color: inherit;
}
.tw th.now .dn {
  background: var(--surface-dark);
  color: var(--on-primary);
  font-weight: 600;
}
.tw th.now .wd {
  color: var(--text);
  font-weight: 600;
}
.tw .mon {
  border-left: 1px solid var(--border);
}
.tw .pb {
  border-left: 2px solid var(--text);
}
/* Cao 48px và đệm 4px hai bên ở mọi mật độ (Thoải mái cũng vậy): hai ô liền nhau cách nhau 8px. Bản 'gọn' chỉ ghi đè để thắng
   luật `td { height: 42px !important }` của base.css. */
table.tw td.dc {
  height: 48px;
  padding: 0 4px;
}
/* Cột tổng cũng 48px, không thì height: 56px của `td` chung kéo cả hàng cao hơn ô ngày ở mật độ Thoải mái. */
table.tw td.sm {
  height: 48px;
}
:root[data-density='gon'] table.tw td.dc {
  height: 48px !important;
}
/* Ô ngày cắt phần tràn (giữ cột đúng 96px) nên vòng focus của pill vẽ vào trong, không ra ngoài ô; pill tối thì vòng sáng. */
table.tw .pill:focus-visible {
  outline-offset: -2px;
}
table.tw .pill:is(.work, .leave, .absent):focus-visible {
  outline-color: var(--surface);
}
table.tw td.now,
table.tw th.now {
  background: var(--gold-pale);
}
table.tw tbody tr:hover th,
table.tw tbody tr:hover td {
  background: var(--gold-pale);
}
table.tw .nm {
  position: sticky;
  left: 0;
  z-index: 2;
  width: var(--w-nm);
  padding: 0 12px 0 20px;
  text-align: left;
  font-weight: 400;
  white-space: nowrap;
  border-right: 1px solid var(--border);
}
table.tw tbody .nm {
  height: 48px;
}
.tw tbody .nm > * {
  vertical-align: middle;
}
.tw .av {
  display: inline-grid;
  width: 28px;
  height: 28px;
  margin-right: 10px;
  font-size: 12px;
  background: var(--status-draft);
}
.tw .lk {
  display: inline-flex;
  flex-direction: column;
  cursor: pointer;
}
.tw .nn {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
}
.tw .lk:hover .nn {
  text-decoration: underline;
}
.tw .lk:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
  border-radius: 4px;
}
table.tw .sm {
  position: sticky;
  z-index: 2;
  text-align: right;
  padding-right: 16px;
  font-size: 14px;
  font-weight: 500;
}
.tw thead .sm .sh {
  color: var(--text);
}
.tw .mut {
  color: var(--muted);
  font-weight: 400;
  font-size: 12px;
}
.tw thead .sm .mut {
  display: block;
}
.tw .s1 {
  right: 128px;
  border-left: 1px solid var(--border);
}
.tw .s2 {
  right: 64px;
}
.tw .s3 {
  right: 0;
}
.none {
  margin: 0;
  padding: 20px;
  color: var(--muted);
}
@media (max-width: 767px) {
  .wk {
    padding-left: 16px;
    padding-right: 16px;
  }
  .tw {
    --w-nm: 140px;
  }
  table.tw .nm {
    padding-left: 12px;
  }
  .tw .av {
    display: none;
  }
  table.tw .sm {
    position: static;
  }
  .scr {
    scroll-padding-left: 140px;
    scroll-padding-right: 0;
  }
}
</style>
