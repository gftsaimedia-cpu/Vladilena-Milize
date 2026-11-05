<script setup lang="ts">
// Lưới chấm công 28 ngày: nhãn tuần, chú giải màu kèm số ô trong tuần đang xem, bảng cuộn ngang (cột tên và 3 cột tổng dính).
// Lúc mở cuộn tới tuần hôm nay (26/10); `start` là chỉ số ngày đầu tuần đang xem. Kéo, phím và nút tuần nằm trong useGridScroll.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ATTENDANCE_GROUPS as GROUPS } from '@/constants/labels';
import type { AttendanceDay, AttendanceRow } from '@/mock/attendance';
import { dm, dmy, weekdayName } from '@/utils/format';
import { employeePath } from '../links';
import { MAX_START, TODAY_START, useGridScroll } from '../useGridScroll';

const props = defineProps<{ days: AttendanceDay[]; rows: AttendanceRow[]; monthNo: number }>();
const emit = defineEmits<{ 'open-day': [personId: string, date: string] }>();

const route = useRoute();
const router = useRouter();
const scroller = ref<HTMLElement | null>(null);

// Chỗ đứng của lưới nằm trên URL (?tuan=YYYY-MM-DD, ngày ở cột trái nhất, thường là thứ Hai) để đổi tab hay vào hồ sơ rồi Back
// vẫn về đúng tuần. Mở lại thì kẹp vào biên lưới; giá trị hỏng hoặc không có thì mở ở tuần hôm nay.
const DAY_MS = 86_400_000;
const ISO = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const tuan = () => (typeof route.query.tuan === 'string' ? route.query.tuan : '');
function startFromUrl() {
  const m = ISO.exec(tuan());
  const first = ISO.exec(props.days[0]?.iso ?? '');
  if (!m || !first) return undefined;
  const at = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(at) || new Date(at).getUTCDate() !== +m[3]) return undefined;
  const gap = Math.round((at - Date.UTC(+first[1], +first[2] - 1, +first[3])) / DAY_MS);
  return Math.min(Math.max(gap, 0), MAX_START);
}
// Có điều hướng khác đang dở (bấm tên sang hồ sơ khi trang đích còn đang nạp): router.replace của ta sẽ huỷ nó, nên bỏ qua lần ghi.
// Điều hướng do chính ta gây ra (`writing`) không tính. afterEach chạy cả khi điều hướng bị huỷ hoặc lỗi nên cờ luôn được hạ.
let navigating = false;
let writing = false;
const offBefore = router.beforeEach(() => {
  if (!writing) navigating = true;
});
const offAfter = router.afterEach(() => {
  navigating = false;
  writing = false;
});
onBeforeUnmount(() => {
  offBefore();
  offAfter();
});
function remember(at: number) {
  const iso = props.days[at]?.iso;
  if (navigating || !iso || iso === tuan() || (!tuan() && at === TODAY_START)) return;
  writing = true;
  router.replace({ query: { ...route.query, tuan: iso } });
}
const { start, atStart, atEnd, prevWeek, nextWeek, thisWeek } = useGridScroll(scroller, {
  initial: startFromUrl,
  settle: remember
});
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
  flex-wrap: wrap;
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
  /* Cột tên và cột tổng cố định; --w-day do useGridScroll đo và ghi vào đây để 7 cột ngày vừa khít vùng nhìn (tối thiểu 96px). */
  --w-nm: 220px;
  --w-sm: 64px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  scrollbar-width: thin;
  scrollbar-color: var(--status-draft) transparent;
  scroll-padding-left: var(--w-nm);
  scroll-padding-right: 192px;
  border-top: 1px solid var(--border);
}
.scr:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.tw {
  /* Bề rộng cột nằm ở ba biến --w-nm, --w-day, --w-sm; bảng rộng đúng tổng của chúng. Để max-content, nội dung ô nở cột ngày khi
     phông chữ tải xong (97–98px thay vì 96px) nên lúc bắt cột và vị trí tuần hôm nay bị lệch. */
  width: calc(var(--w-nm) + var(--days) * var(--w-day, 96px) + 3 * var(--w-sm));
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-variant-numeric: tabular-nums;
}
.tw col.c-nm {
  width: var(--w-nm);
}
.tw col.c-day {
  width: var(--w-day, 96px);
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
  .scr {
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
