<script setup>
// Khung chung của 6 tab Chấm công & phép: tiêu đề, nút Chốt công (chưa mở), thanh tab; nội dung tab ở <RouterView>.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad.js';
import { getAttendanceSummary } from '@/services/admin-attendance.js';
import { usePeriodStore } from '@/stores/period.js';

const route = useRoute();
const period = usePeriodStore();
const month = computed(() => period.month);
const { data: summary } = useLoad(
  () => getAttendanceSummary(month.value),
  () => month.value
);

const TABS = [
  ['', 'Bảng công'],
  ['ca-lam', 'Ca làm'],
  ['phep-con-lai', 'Phép còn lại'],
  ['hom-nay', 'Hôm nay'],
  ['sua-gio', 'Sửa giờ'],
  ['gio-ot', 'Giờ OT']
];
const tabTo = key => ({
  path: key ? `/admin/cham-cong/${key}` : '/admin/cham-cong',
  query: { thang: route.query.thang }
});
</script>

<template>
  <div class="title">
    <div>
      <h1>Chấm công &amp; phép</h1>
      <p v-if="summary && !summary.empty">
        <b>{{ summary.forgot }} ngày</b> quên Check-in/out phải xử lý ·
        {{ summary.reconcile }} ngày nên đối soát · {{ summary.late }} lượt đi trễ
      </p>
      <p v-else-if="summary">Chưa có dữ liệu chấm công của tháng này</p>
    </div>
    <div class="acts">
      <button v-if="summary && !summary.empty" type="button" class="btn off" disabled>
        <Icon name="lock" />Chốt công
      </button>
    </div>
  </div>

  <div class="tabs">
    <RouterLink v-for="[key, label] in TABS" :key="key" :to="tabTo(key)" class="tab" exact-active-class="on">
      {{ label }}
      <small v-if="key === 'hom-nay' && summary && !summary.empty">{{ summary.inShift }} đang trong ca</small>
    </RouterLink>
  </div>

  <RouterView />
</template>
