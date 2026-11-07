<script setup lang="ts">
// Cột 2 · Chấm công (spec 4.2): đầu cột, chọn tháng, ba ô số, lịch tháng 10, khối "Gần đây" 7 dòng giãn kín đáy.
// Bấm một ô ngày hoặc một dòng Gần đây thì router.replace tới URL của điện thoại; trang đọc URL rồi mở ngăn kéo ngày (spec 3.3).
// stamp đổi (Check-out ở cột 1, R7) thì tải lại để "Gần đây" thấy giờ ra mới.
// Chọn tháng: lùi tới tháng vào làm, tới tháng hiện tại (BE trả khoảng); tải lỗi thì hiện LoadError với nút Thử lại, lỗi lúc
// đổi tháng thì thêm nút "Quay về tháng …" (tháng tải được gần nhất). Tải xong thì focus về h2, vẫn lỗi thì về nút
// Thử lại mới. Chưa có dữ liệu thì hiện "Đang tải…"; đổi tháng thì giữ nội dung tháng cũ tới khi tháng mới về.
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLoad } from '@/composables/useLoad';
import { useStaffLive } from '@/composables/useStaffLive';
import { backTo, useRetry } from '@/composables/useRetry';
import { getAttendance } from '@/services/staff-phone';
import LoadError from '@/views/staff-phone/components/LoadError.vue';
import LoadingLine from '@/views/staff-phone/components/LoadingLine.vue';
import MonthCalendar from '@/views/staff-phone/components/MonthCalendar.vue';
import MonthSwitch from '@/views/staff-phone/components/MonthSwitch.vue';
import MonthTiles from '@/views/staff-phone/components/MonthTiles.vue';
import RecentDays from '@/views/staff-phone/components/RecentDays.vue';

const props = defineProps<{ stamp: number }>();
// Tháng đang xem, dùng chung với cột Thu nhập (v-model:month ở trang cha).
const month = defineModel<string | null>('month', { default: null });
// Tháng mà cột đang hiện thật (máy chủ trả; khi `month` là null đó là tháng hiện tại): trang cha dùng để mở Tạo yêu cầu đúng tháng.
const viewed = defineModel<string | null>('viewed', { default: null });

const router = useRouter();
const load = useLoad(() => getAttendance(7, month.value), () => month.value);
useStaffLive(load.refresh, ['attendance.punched', 'attendance.changed', 'request.decided']);
const { data, error, loading, reload } = load;
watch(
  data,
  v => {
    if (v?.month) viewed.value = v.month;
  },
  { immediate: true }
);
const head = ref<HTMLElement | null>(null);
const { errBox, retry, after } = useRetry(load, head);
const back = computed(() => backTo(data.value, month.value));
const goBack = () => after(() => (month.value = back.value!.month));
watch(() => props.stamp, reload);

function openDay(date: string) {
  router.replace({ path: '/nv/cham-cong', query: { ngay: date } });
}
</script>

<template>
  <section class="sd-col">
    <LoadError v-if="error" ref="errBox" :error="error" :back="back?.text" @retry="retry" @back="goBack" />
    <template v-else-if="data">
      <header class="sd-head">
        <h2 ref="head" class="sd-title" tabindex="-1">Chấm công</h2>
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
    <LoadingLine v-else-if="loading" />
  </section>
</template>
