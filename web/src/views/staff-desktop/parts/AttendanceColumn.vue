<script setup lang="ts">
// Cột 2 · Chấm công (spec 4.2): đầu cột, chọn tháng, ba ô số, lịch tháng 10, khối "Gần đây" 7 dòng giãn kín đáy.
// Bấm một ô ngày hoặc một dòng Gần đây thì router.replace tới URL của điện thoại; trang đọc URL rồi mở ngăn kéo ngày (spec 3.3).
// stamp đổi (Check-out ở cột 1, R7) thì tải lại để "Gần đây" thấy giờ ra mới.
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { AttendanceView } from '@/mock/staff-phone';
import { getAttendance } from '@/services/staff-phone';
import MonthCalendar from '@/views/staff-phone/components/MonthCalendar.vue';
import MonthSwitch from '@/views/staff-phone/components/MonthSwitch.vue';
import MonthTiles from '@/views/staff-phone/components/MonthTiles.vue';
import RecentDays from '@/views/staff-phone/components/RecentDays.vue';

const props = defineProps<{ stamp: number }>();

const router = useRouter();
const data = ref<AttendanceView | null>(null);

function load() {
  getAttendance(7).then(v => (data.value = v));
}
load();
watch(() => props.stamp, load);

function openDay(date: string) {
  router.replace({ path: '/nv/cham-cong', query: { ngay: date } });
}
</script>

<template>
  <section class="sd-col">
    <template v-if="data">
      <header class="sd-head">
        <h2 class="sd-title">Chấm công</h2>
        <span class="mut">{{ data.shiftLine }}</span>
      </header>
      <MonthSwitch :label="data.label" :state="data.state" />
      <MonthTiles :tiles="data.tiles" />
      <MonthCalendar :cells="data.cells" @open="openDay" />
      <section class="sd-grow">
        <h3>Gần đây</h3>
        <RecentDays :recent="data.recent" @open="openDay" />
      </section>
    </template>
  </section>
</template>

<style scoped>
.sd-head {
  display: flex;
  flex-direction: column;
  gap: 0;
}
</style>
