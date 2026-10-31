<script setup>
// Tab Sửa giờ: yêu cầu sửa giờ Check-in/out. Từ chối phải ghi lý do; giờ gốc luôn được giữ trong lịch sử của lượt.
import { computed, ref } from 'vue';
import { useLoad } from '@/composables/useLoad.js';
import { getTimeFixRequests } from '@/services/admin-attendance.js';
import { usePeriodStore } from '@/stores/period.js';
import RequestTable from './RequestTable.vue';

const period = usePeriodStore();
const month = computed(() => period.month);
const status = ref('pending');
const { data } = useLoad(
  () => getTimeFixRequests(month.value, { status: status.value }),
  () => month.value + status.value
);

const chips = computed(() => [
  { key: 'pending', label: 'Chờ xử lý', count: data.value?.counts?.pending ?? 0 },
  { key: 'approved', label: 'Đã đồng ý' },
  { key: 'rejected', label: 'Từ chối' },
  { key: 'all', label: 'Tất cả' }
]);
const EMPTY = {
  icon: 'history',
  title: 'Không có yêu cầu sửa giờ nào chờ xử lý',
  lines: [
    'Nhân viên chưa gửi được yêu cầu sửa giờ trên app (đang Sắp có).',
    'Khi Admin sửa giờ trực tiếp ở Bảng công, lần sửa cũng được ghi vào đây.'
  ]
};
</script>

<template>
  <RequestTable
    title="Sửa giờ Check-in/out"
    cap="Từ chối phải ghi lý do · giờ gốc luôn được giữ trong lịch sử của lượt"
    :chips="chips"
    :active="status"
    :columns="['Nhân sự', 'Ngày', 'Giờ đề nghị', 'Lý do', 'Trạng thái']"
    :rows="data?.rows || []"
    :empty="EMPTY"
    @select="status = $event"
  />
</template>
