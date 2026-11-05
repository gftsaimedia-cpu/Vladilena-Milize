<script setup lang="ts">
// J2 · Chấm công (spec 5): đầu trang, chọn tháng, ba ô số, lịch tháng 10 tô theo nhóm, "Gần đây" 5 dòng.
// Bấm ngày có dữ liệu hoặc một dòng Gần đây mở J3 (DaySheet) bằng ?ngay=YYYY-MM-DD (router.replace); đóng thì bỏ tham số.
// Ngày lạ (Chủ nhật, chưa tới, ngoài tháng 10, chuỗi sai) thì bỏ ?ngay= khỏi URL và không mở gì (spec 3.8).
// Chọn tháng: lùi tới tháng vào làm, tới tháng hiện tại (BE trả khoảng); tải lỗi thì hiện LoadError với nút Thử lại.
import { nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLoad } from '@/composables/useLoad';
import type { DayDetail } from '@/mock/staff-phone';
import { getAttendance, getDay } from '@/services/staff-phone';
import DaySheet from './components/DaySheet.vue';
import LoadError from './components/LoadError.vue';
import MonthCalendar from './components/MonthCalendar.vue';
import MonthSwitch from './components/MonthSwitch.vue';
import MonthTiles from './components/MonthTiles.vue';
import RecentDays from './components/RecentDays.vue';

const route = useRoute();
const router = useRouter();

const month = ref<string | null>(null); // null = tháng hiện tại
const { data, error, reload } = useLoad(() => getAttendance(5, month.value), () => month.value);

const root = ref<HTMLElement | null>(null);
const day = ref<DayDetail | null>(null);

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
    <LoadError v-if="error" :error="error" @retry="reload" />
    <template v-else-if="data">
      <MonthSwitch :label="data.label" :state="data.state" :prev="data.prev" :next="data.next" @go="m => (month = m)" />
      <MonthTiles :tiles="data.tiles" />
      <MonthCalendar :cells="data.cells" @open="openDay" />
      <section class="at-recent">
        <h2>Gần đây</h2>
        <RecentDays :recent="data.recent" @open="openDay" />
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
.at-recent {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.at-recent h2 {
  padding: 0 4px;
}
</style>
