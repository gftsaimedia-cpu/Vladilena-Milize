<script setup lang="ts">
// Trang in phiếu lương A4 (layout 'blank'), hai route cùng dùng:
//   /in/phieu-luong/:month/:id  một phiếu (In phiếu của ngăn kéo phiếu lương; a4-t10-chinh-thuc, a4-t10-ban-nhap)
//   /in/phieu-luong/:month      tất cả phiếu đã duyệt của kỳ (In tất cả của Bảng lương)
// ?in=1 → mở hộp in của trình duyệt ngay khi phiếu đã dựng xong (các nút In mở trang này ở tab mới).
import { computed, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useLoad } from '@/composables/useLoad';
import { getApprovedSheets, getPayslipSheet } from '@/services/payslip';
import { monthShort } from '@/utils/format';
import A4Payslip from './A4Payslip.vue';

const route = useRoute();
const month = computed(() => String(route.params.month || ''));
const id = computed(() => String(route.params.id || ''));

const {
  data: sheets,
  loading,
  error,
  reload
} = useLoad(
  async () => (id.value ? [await getPayslipSheet(month.value, id.value)] : await getApprovedSheets(month.value)),
  () => [month.value, id.value].join('|')
);

let printed = false;
watch(sheets, async list => {
  if (!list || !list.length) return;
  document.title = id.value
    ? `Phiếu lương ${list[0].name} ${monthShort(month.value)}`
    : `Phiếu lương ${monthShort(month.value)} (${list.length} phiếu)`;
  if (route.query.in !== '1' || printed) return;
  printed = true;
  await nextTick();
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  window.print();
});
</script>

<template>
  <div class="print-root">
    <p v-if="loading" class="msg">Đang chuẩn bị bản in…</p>
    <p v-else-if="error" class="msg">
      Không tải được phiếu lương. <button type="button" class="link" @click="reload">Thử lại</button>
    </p>
    <p v-else-if="!sheets || !sheets.length" class="msg">Chưa có phiếu đã phê duyệt trong kỳ này.</p>
    <A4Payslip v-for="s in sheets || []" :key="s.username" :sheet="s" />
  </div>
</template>

<style scoped>
.print-root {
  min-height: 100vh;
  background: #e9e9e9;
  padding: 24px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}
.print-root :deep(.a4-doc) {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.msg {
  margin: 0;
  color: #616161;
  font-size: 14px;
}
@media print {
  .print-root {
    background: #fff;
    padding: 0;
    gap: 0;
    display: block;
    min-height: 0;
  }
  .print-root :deep(.a4-doc) {
    display: block;
  }
  .msg {
    display: none;
  }
  /* tờ cuối của cả lô không ngắt trang, tránh tờ trắng thừa */
  .print-root :deep(.a4-doc:last-child .pl-a4:last-child) {
    break-after: auto;
    page-break-after: auto;
  }
}
</style>
