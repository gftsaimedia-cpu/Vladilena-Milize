<script setup lang="ts">
// J2 · Chấm công (spec 5): đầu trang, chọn tháng, ba ô số, lịch tháng 10 tô theo nhóm, "Gần đây" 5 dòng.
// Bấm ngày có dữ liệu hoặc một dòng Gần đây mở J3 (DaySheet) bằng ?ngay=YYYY-MM-DD (router.replace); đóng thì bỏ tham số.
// Ngày lạ (Chủ nhật, chưa tới, ngoài tháng 10, chuỗi sai) thì bỏ ?ngay= khỏi URL và không mở gì (spec 3.8).
import { nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AttendanceView, DayDetail } from '@/mock/staff-phone';
import { getAttendance, getDay } from '@/services/staff-phone';
import DaySheet from './components/DaySheet.vue';
import MonthSwitch from './components/MonthSwitch.vue';

const route = useRoute();
const router = useRouter();

const data = ref<AttendanceView | null>(null);
getAttendance().then(v => (data.value = v));

const root = ref<HTMLElement | null>(null);
const day = ref<DayDetail | null>(null);
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function dropNgay() {
  const { ngay: _ngay, ...rest } = route.query;
  router.replace({ query: rest });
}

watch(
  () => route.query.ngay,
  async raw => {
    const ngay = Array.isArray(raw) ? raw[0] : raw;
    if (!ngay) {
      day.value = null;
      return;
    }
    const found = await getDay(ngay);
    if ((Array.isArray(route.query.ngay) ? route.query.ngay[0] : route.query.ngay) !== ngay) return; // đã đổi trong lúc chờ
    if (found) day.value = found;
    else {
      day.value = null;
      dropNgay();
    }
  },
  { immediate: true }
);

function openDay(date: string) {
  router.replace({ query: { ...route.query, ngay: date } });
}
// Hộp mở từ màn khác (J1) thì ô mở hộp đã không còn để trả focus: đóng xong mà focus rơi xuống <body> thì đưa về ô lịch của ngày đó.
async function closeDay() {
  const date = day.value?.date;
  day.value = null;
  dropNgay();
  await nextTick();
  const a = document.activeElement;
  if (date && (!a || a === document.body)) root.value?.querySelector<HTMLElement>(`button.dn[data-date="${date}"]`)?.focus();
}
</script>

<template>
  <div ref="root" class="ph at">
    <header class="at-head">
      <h1>Chấm công</h1>
      <span v-if="data" class="mut">{{ data.shiftLine }}</span>
    </header>
    <template v-if="data">
      <MonthSwitch :label="data.label" :state="data.state" />
      <div class="at-tiles" role="group" aria-label="Chỉ số tháng 10">
        <div v-for="t in data.tiles" :key="t.label" class="at-tile">
          <b>{{ t.value }}<small v-if="t.of"> / {{ t.of }}</small></b>
          <span class="mut sm">{{ t.label }}</span>
        </div>
      </div>
      <section class="card at-cal" aria-label="Lịch tháng 10">
        <div class="at-grid">
          <span v-for="w in WEEKDAYS" :key="w" class="at-wd">{{ w }}</span>
          <template v-for="(c, i) in data.cells" :key="c ? c.date : `blank-${i}`">
            <span v-if="!c" aria-hidden="true" />
            <button
              v-else-if="c.open"
              type="button"
              class="dn"
              :class="[c.kind, { today: c.today }]"
              :data-date="c.date"
              :aria-label="c.label"
              @click="openDay(c.date)"
            >
              {{ c.day }}
            </button>
            <span v-else role="img" class="dn" :class="[c.kind, { today: c.today }]" :aria-label="c.label">{{ c.day }}</span>
          </template>
        </div>
        <div class="at-lg">
          <span><i class="dot work" />Đi làm</span>
          <span><i class="dot late" />Đi muộn</span>
          <span><i class="dot leave" />Nghỉ có lương</span>
          <span><i class="dot todo" />Cần xử lý</span>
        </div>
      </section>
      <section class="at-recent">
        <h2>Gần đây</h2>
        <div class="card ls">
          <button
            v-for="r in data.recent"
            :key="r.date"
            type="button"
            class="ro"
            :aria-label="`${r.day} ${r.times}, ${r.statusText}`"
            @click="openDay(r.date)"
          >
            <i class="dot" :class="r.kind" /><span class="t">{{ r.day }}</span><span class="v">{{ r.times }}</span>
          </button>
        </div>
      </section>
    </template>
    <DaySheet v-if="day" :day="day" @close="closeDay" />
  </div>
</template>

<style scoped>
.at-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* Ba ô số: lưới 3 cột cách 8px, ô trắng bo 16px */
.at-tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.at-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 14px 12px;
  border-radius: 16px;
  background: var(--surface);
}
.at-tile b {
  font-size: 24px;
  line-height: 30px;
  font-weight: 600;
}
.at-tile b small {
  font-size: 16px;
  color: var(--muted);
  font-weight: 500;
}
/* Thẻ lịch: lưới 7 cột, hàng nhãn T2…CN, chú giải ngăn bằng đường kẻ */
.at-cal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 12px;
}
.at-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  justify-items: center;
  column-gap: 6px;
  row-gap: 8px;
}
/* Ô ngày co theo cột (tối đa 40px, luôn vuông), cả nút lẫn ô role="img", để bảy ô vừa thẻ ở mọi bề ngang từ 320px */
.at-grid .dn {
  width: 100%;
  max-width: 40px;
  height: auto;
  aspect-ratio: 1;
}
.at-wd {
  padding-bottom: 4px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
button.dn {
  cursor: pointer;
}
.at-lg {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.at-lg span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.at-recent {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.at-recent h2 {
  padding: 0 4px;
}
</style>
