<script setup>
// Tab Giờ OT: OT nhân viên khai đối chiếu với lượt Check-in/out; chỉ trả OT khi có mặt đúng khoảng đã khai.
import { computed, ref } from 'vue';
import { useLoad } from '@/composables/useLoad.js';
import { getOvertimeRequests } from '@/services/admin-attendance.js';
import { usePeriodStore } from '@/stores/period.js';
import RequestTable from './RequestTable.vue';

const period = usePeriodStore();
const month = computed(() => period.month);
const status = ref('pending');
const { data } = useLoad(
  () => getOvertimeRequests(month.value, { status: status.value }),
  () => month.value + status.value
);

const chips = computed(() => [
  { key: 'pending', label: 'Chờ xử lý', count: data.value?.counts?.pending ?? 0 },
  { key: 'approved', label: 'Đã đồng ý' },
  { key: 'rejected', label: 'Từ chối' }
]);
const EMPTY = {
  icon: 'clock',
  title: 'Không có lượt OT nào chờ đối chiếu',
  lines: ['OT nhân viên khai sẽ hiện ở đây sau khi họ Check-out.']
};
</script>

<template>
  <RequestTable
    title="Giờ OT thực tế"
    cap="OT khai được đối chiếu với lượt Check-in/out · chỉ trả OT khi có mặt đúng khoảng đã khai · từ chối phải ghi lý do"
    :chips="chips"
    :active="status"
    :columns="['Nhân sự', 'Ngày', 'Ca', 'OT đã khai', 'Có mặt', 'Trạng thái']"
    :rows="data?.rows || []"
    :empty="EMPTY"
    @select="status = $event"
  />
</template>
