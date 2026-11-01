<script setup lang="ts">
// Các tab "Đã đồng ý", "Đã từ chối", "Tất cả" của Yêu cầu: danh sách đã xử lý, chỉ để xem.
import RequestTable from './RequestTable.vue';

defineProps({ items: { type: Array as () => any[], required: true }, total: { type: Number, required: true } });
const HEADS = ['Nhân sự', 'Loại yêu cầu', 'Chi tiết', 'Kết quả'];
const WIDTHS = [260, 170, '', 170, 24];
const RESULT = {
  cho: ['p-pend', 'Chờ xử lý'],
  'dong-y': ['p-done', 'Đã đồng ý'],
  'tu-choi': ['p-err', 'Đã từ chối']
};
</script>

<template>
  <section class="card">
    <RequestTable :items="items" :heads="HEADS" :widths="WIDTHS">
      <template #extra="{ r }">
        <span class="pill" :class="RESULT[r.status][0]">{{ RESULT[r.status][1] }}</span>
      </template>
    </RequestTable>
    <div class="foot">
      <span>Đang hiện {{ items.length }} trên {{ total }} yêu cầu</span>
    </div>
  </section>
</template>
