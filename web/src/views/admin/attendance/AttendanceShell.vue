<script setup lang="ts">
// Khung chung của Chấm công: tiêu đề, nút Chốt công ở Bảng lương, mở Hôm nay & Giờ OT dạng popup; nội dung chính ở <RouterView>.
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getAttendanceSummary } from '@/services/admin-attendance';
import { usePeriodStore } from '@/stores/period';
import TodayDialog from './TodayDialog.vue';
import OvertimeDialog from './OvertimeDialog.vue';

const route = useRoute();
const router = useRouter();
const period = usePeriodStore();
const month = computed(() => period.month);
const { data: summary } = useLoad(
  () => getAttendanceSummary(month.value),
  () => month.value
);

const todayOpen = ref(false);
const otOpen = ref(false);

watch(
  () => route.query.hop,
  hop => {
    if (hop === 'hom-nay') todayOpen.value = true;
    if (hop === 'duyet-ot') otOpen.value = true;
  },
  { immediate: true }
);

function closeToday() {
  todayOpen.value = false;
  if (route.query.hop === 'hom-nay') {
    const { hop, ...rest } = route.query;
    router.replace({ query: rest });
  }
}

function closeOt() {
  otOpen.value = false;
  if (route.query.hop === 'duyet-ot') {
    const { hop, ...rest } = route.query;
    router.replace({ query: rest });
  }
}
</script>

<template>
  <div class="title">
    <div>
      <h1>Chấm công</h1>
      <p v-if="summary && !summary.empty">
        <b>{{ summary.forgot }} ngày</b> quên Check-in/out phải xử lý · {{ summary.reconcile }} ngày nên đối soát ·
        {{ summary.late }} lượt đi trễ
      </p>
      <p v-else-if="summary">Chưa có dữ liệu chấm công của tháng này</p>
    </div>
    <div class="acts">
      <button
        v-if="summary && !summary.empty"
        type="button"
        class="btn"
        @click="todayOpen = true"
      >
        <Icon name="cal" />Hôm nay ({{ summary.inShift }} đang trong ca)
      </button>
      <RouterLink
        v-if="summary && !summary.empty"
        class="btn"
        :to="{ path: '/admin/bang-luong', query: { thang: route.query.thang } }"
      >
        <Icon name="lock" />Chốt công ở Bảng lương
      </RouterLink>
    </div>
  </div>

  <RouterView />

  <TodayDialog v-if="todayOpen" @close="closeToday" />
  <OvertimeDialog v-if="otOpen" @close="closeOt" />
</template>
