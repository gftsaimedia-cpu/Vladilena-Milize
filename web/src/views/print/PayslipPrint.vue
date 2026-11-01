<script setup lang="ts">
// Trang in phiếu lương A4 (layout 'blank'), hai route cùng dùng:
//   /in/phieu-luong/:month/:username  một phiếu (a4-t10-chinh-thuc, a4-t11-tam-tinh)
//   /in/phieu-luong/:month            tất cả phiếu đã phê duyệt của kỳ
// ?in=1 → mở hộp in của trình duyệt ngay khi phiếu đã dựng xong (các nút In trong hộp thoại mở trang này ở tab mới).
// ?kb=<kịch bản của Bảng lương> và ?ten=<tên hiển thị> chỉ để chọn dữ liệu giả cho đúng phiếu đang xem.
import { computed, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useLoad } from '@/composables/useLoad';
import { getApprovedSheets, getPayslipSheet } from '@/services/payslip';
import { monthShort } from '@/utils/format';
import A4Payslip from './A4Payslip.vue';

const route = useRoute();
const month = computed(() => String(route.params.month || ''));
const username = computed(() => String(route.params.username || ''));
const scenario = computed(() => String(route.query.kb || ''));
const shownName = computed(() => String(route.query.ten || ''));

const {
  data: sheets,
  loading,
  error,
  reload
} = useLoad(
  async () =>
    username.value ? [await getPayslipSheet(month.value, username.value)] : await getApprovedSheets(month.value),
  () => [month.value, username.value, scenario.value, shownName.value].join('|')
);

let printed = false;
watch(sheets, async list => {
  if (!list || !list.length) return;
  document.title = username.value
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
