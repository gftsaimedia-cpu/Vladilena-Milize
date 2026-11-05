<script setup lang="ts">
// Cột 2 · Chấm công (spec 4.2): đầu cột, chọn tháng, ba ô số, lịch tháng 10, khối "Gần đây" 7 dòng giãn kín đáy.
// Bấm một ô ngày hoặc một dòng Gần đây thì router.replace tới URL của điện thoại; trang đọc URL rồi mở ngăn kéo ngày (spec 3.3).
// stamp đổi (Check-out ở cột 1, R7) thì tải lại để "Gần đây" thấy giờ ra mới.
// Chọn tháng: lùi tới tháng vào làm, tới tháng hiện tại (BE trả khoảng); tải lỗi thì hiện LoadError với nút Thử lại.
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLoad } from '@/composables/useLoad';
import { getAttendance } from '@/services/staff-phone';
import LoadError from '@/views/staff-phone/components/LoadError.vue';
import LoadingLine from '@/views/staff-phone/components/LoadingLine.vue';
import MonthCalendar from '@/views/staff-phone/components/MonthCalendar.vue';
import MonthSwitch from '@/views/staff-phone/components/MonthSwitch.vue';
import MonthTiles from '@/views/staff-phone/components/MonthTiles.vue';
import RecentDays from '@/views/staff-phone/components/RecentDays.vue';
import { focusAfterLoad } from '@/views/staff-phone/focusAfterLoad';

const props = defineProps<{ stamp: number }>();

const router = useRouter();
const month = ref<string | null>(null); // null = tháng hiện tại
const { data, loading, error, reload } = useLoad(() => getAttendance(7, month.value), () => month.value);
const col = ref<HTMLElement | null>(null);
// Đổi sang một tháng bị lỗi thì cho quay về tháng tải được gần nhất (useLoad còn giữ dữ liệu cũ).
const backLabel = computed(() => (month.value && data.value && data.value.month !== month.value ? data.value.label : null));
function retry() {
  reload();
  focusAfterLoad(col, loading);
}
function goBack() {
  if (data.value) month.value = data.value.month;
  focusAfterLoad(col, loading);
}
watch(() => props.stamp, reload);

function openDay(date: string) {
  router.replace({ path: '/nv/cham-cong', query: { ngay: date } });
}
</script>

<template>
  <section ref="col" class="sd-col">
    <LoadError v-if="error" :error="error" :back="backLabel" @retry="retry" @back="goBack" />
    <template v-else-if="data">
      <header class="sd-head">
        <h2 class="sd-title" data-load-focus>Chấm công</h2>
        <span class="mut">{{ data.shiftLine }}</span>
      </header>
      <MonthSwitch :label="data.label" :state="data.state" :prev="data.prev" :next="data.next" @go="m => (month = m)" />
      <MonthTiles :tiles="data.tiles" />
      <MonthCalendar :cells="data.cells" @open="openDay" />
      <section class="sd-grow">
        <h3>Gần đây</h3>
        <RecentDays :recent="data.recent" @open="openDay" />
      </section>
    </template>
    <LoadingLine v-else />
  </section>
</template>
