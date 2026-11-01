<script setup lang="ts">
// Hộp in tất cả phiếu đã phê duyệt của kỳ (dlg-t10-in-tat-ca.html), mở từ Bảng lương.
// Hợp đồng: props { month: 'YYYY-MM' }; emit('close').
// Nút "In … phiếu / Lưu PDF" mở trang in cả lô ở tab mới, trang đó tự gọi hộp in của trình duyệt.
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getPrintBatch } from '@/services/payslip';
import { dm, monthShort } from '@/utils/format';
import A4Preview from '@/views/print/A4Preview.vue';
import { openPrint } from '@/views/print/printLink';

const props = defineProps({ month: { type: String, required: true } });
const emit = defineEmits(['close']);
const router = useRouter();

const {
  data: batch,
  loading,
  error,
  reload
} = useLoad(
  () => getPrintBatch(props.month),
  () => props.month
);

const title = computed(() =>
  batch.value ? `In ${batch.value.count} phiếu đã phê duyệt` : 'In tất cả phiếu đã phê duyệt'
);
const sub = computed(() => {
  const paid = batch.value && batch.value.paidOn ? ` · đã trả lương ${dm(batch.value.paidOn)}` : '';
  return `Kỳ lương tháng ${monthShort(props.month)}${paid}`;
});
const more = computed(() => (batch.value ? batch.value.count - batch.value.names.length : 0));

const print = () => openPrint(router, { month: props.month });
</script>

<template>
  <AppModal :title="title" :sub="sub" :width="860" :top="40" @close="emit('close')">
    <p v-if="loading" class="wait">Đang chuẩn bị bản in…</p>
    <p v-else-if="error" class="wait">
      Không tải được danh sách phiếu. <button type="button" class="link" @click="reload">Thử lại</button>
    </p>
    <div v-else-if="!batch.count" class="note">
      <Icon name="info" />
      <div>Kỳ này chưa có phiếu nào được phê duyệt để in.</div>
    </div>
    <template v-else>
      <span class="pill" :class="batch.first.badge.cls">{{ batch.first.badge.label }}</span>
      <span class="pill p-draft">{{ batch.count }} phiếu</span>
      <div style="height: 12px" />
      <div class="note">
        <Icon name="info" />
        <div>
          Trong hộp thoại in của trình duyệt chọn khổ <b>A4</b>, lề <b>Không có</b>, bật <b>Đồ hoạ nền</b> (hoặc chọn
          Lưu dưới dạng PDF). Mỗi phiếu hai trang.
        </div>
      </div>
      <div class="names">
        <b>{{ batch.names.join(', ') }}</b
        ><template v-if="more > 0"> và {{ more }} phiếu khác</template>
      </div>
      <A4Preview :sheet="batch.first" />
    </template>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
      <button type="button" class="btn pri" :disabled="!batch || !batch.count" @click="print">
        <Icon name="print" />In {{ batch ? batch.count : '' }} phiếu / Lưu PDF
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.wait {
  margin: 12px 0;
  color: var(--muted);
}
.pill + .pill {
  margin-left: 4px;
}
.names {
  font-size: 13px;
  line-height: 21px;
  color: var(--muted);
  margin-top: 12px;
}
.names b {
  color: var(--text);
  font-weight: 500;
}
</style>
