<script setup lang="ts">
// Hộp xem trước bản in A4 của một phiếu (dlg-t11-ban-in.html), mở từ ngăn kéo phiếu lương.
// Nút "In / Lưu PDF" mở trang in ở tab mới, trang đó tự gọi hộp in của trình duyệt.
import { useRouter } from 'vue-router';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getPayslipSheet } from '@/services/payslip';
import { monthShort } from '@/utils/format';
import A4Preview from '@/views/print/A4Preview.vue';
import { openPrint } from '@/views/print/printLink';

const props = defineProps({
  month: { type: String, required: true },
  username: { type: String, required: true },
  name: { type: String, default: '' },
  scenario: { type: String, default: '' }
});
const emit = defineEmits(['close']);
const router = useRouter();

const {
  data: sheet,
  loading,
  error,
  reload
} = useLoad(
  () => getPayslipSheet(props.month, props.username),
  () => [props.month, props.username, props.scenario].join('|')
);

const print = () =>
  openPrint(router, {
    month: props.month,
    username: props.username,
    scenario: props.scenario,
    name: props.name
  });
</script>

<template>
  <AppModal
    :title="`Bản in A4 · ${sheet ? sheet.name : name}`"
    :sub="`Kỳ lương tháng ${monthShort(month)}`"
    :width="720"
    :top="40"
    @close="emit('close')"
  >
    <p v-if="loading" class="wait">Đang chuẩn bị bản in…</p>
    <p v-else-if="error" class="wait">
      Không tải được bản in. <button type="button" class="link" @click="reload">Thử lại</button>
    </p>
    <template v-else>
      <span class="pill" :class="sheet.badge.cls">{{ sheet.badge.label }}</span>
      <div style="height: 12px" />
      <div class="note">
        <Icon name="info" />
        <div>
          Trong hộp thoại in của trình duyệt chọn khổ <b>A4</b>, lề <b>Không có</b>, bật <b>Đồ hoạ nền</b> (hoặc chọn
          Lưu dưới dạng PDF). Mỗi phiếu hai trang.
        </div>
      </div>
      <A4Preview :sheet="sheet" />
    </template>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
      <button type="button" class="btn pri" :disabled="!sheet" @click="print"><Icon name="print" />In / Lưu PDF</button>
    </template>
  </AppModal>
</template>

<style scoped>
.wait {
  margin: 12px 0;
  color: var(--muted);
}
</style>
