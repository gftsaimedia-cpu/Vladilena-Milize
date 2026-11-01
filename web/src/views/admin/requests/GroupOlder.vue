<script setup lang="ts">
// Nhóm "Các tháng trước" của Yêu cầu · Mọi tháng.
import RequestTable from './RequestTable.vue';

defineProps({
  items: { type: Array as () => any[], required: true },
  total: { type: Number, required: true },
  canMore: { type: Boolean, default: false }
});
defineEmits(['approve', 'reject', 'more']);
const HEADS = ['Nhân sự', 'Loại yêu cầu', 'Chi tiết', 'Ghi chú'];
const WIDTHS = [260, 170, '', 170, 190];
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>Các tháng trước</h2>
      <span class="cap">{{ total }} yêu cầu</span>
    </div>
    <RequestTable :items="items" :heads="HEADS" :widths="WIDTHS">
      <template #extra="{ r }">
        <span v-if="r.lateNote" class="pill p-pend">{{ r.lateNote }}</span>
      </template>
      <template #act="{ r }">
        <button type="button" class="tact" @click="$emit('reject', r)">Từ chối</button>
        <button type="button" class="btn sm" @click="$emit('approve', r)">Đồng ý</button>
      </template>
    </RequestTable>
    <div class="foot">
      <span>Đang hiện {{ items.length }} trên {{ total }} yêu cầu của các tháng trước</span>
      <button v-if="canMore" type="button" class="link" style="margin-left: auto" @click="$emit('more')">
        Xem thêm
      </button>
    </div>
  </section>
</template>

<style scoped>
.tact {
  margin-right: 16px;
}
</style>
