<script setup lang="ts">
// Ngăn kéo phiếu lương một người (phieu-t10-chinh-thuc, phieu-t10-da-duyet, phieu-t10-co-canh-bao, phieu-t11-tam-tinh),
// mở từ màn Bảng lương. Loại phiếu (chính thức, đã duyệt, chờ duyệt có cảnh báo AI, bản nháp, chưa tính lương) do dữ liệu quyết định.
// Hợp đồng: props { month: 'YYYY-MM', username, name (tên hiển thị, tuỳ chọn), scenario (?kb của Bảng lương, tuỳ chọn) };
// emit('close'). Tự mở hộp bản in A4 khi ?hop=ban-in.
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import Icon from '@/components/ui/Icon.vue';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import { approvePayslip, getPayslip, returnPayslip } from '@/services/payslip';
import { useSessionStore } from '@/stores/session';
import { monthShort } from '@/utils/format';
import PayslipBody from './PayslipBody.vue';
import PrintPreviewDialog from './PrintPreviewDialog.vue';
import SlipOverrideDialog from './SlipOverrideDialog.vue';

const props = defineProps({
  month: { type: String, required: true },
  username: { type: String, required: true },
  name: { type: String, default: '' },
  scenario: { type: String, default: '' }
});
const emit = defineEmits(['close']);
const route = useRoute();

const {
  data: slip,
  loading,
  error,
  reload
} = useLoad(
  () => getPayslip(props.month, props.username),
  () => [props.month, props.username, props.scenario].join('|')
);

const showPrint = ref(route.query.hop === 'ban-in');
const showEdit = ref(false);
const busy = ref(false);

// Chạy một thao tác ghi; xong thì chạy then (cập nhật phiếu trên màn hoặc đóng ngăn kéo).
async function act(fn?, then?) {
  if (busy.value) return;
  busy.value = true;
  try {
    const res = await fn();
    then(res);
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = false;
  }
}
const approve = () =>
  act(
    () => approvePayslip(props.month, props.username),
    res => Object.assign(slip.value, res.patch)
  );
const giveBack = () =>
  act(
    () => returnPayslip(props.month, props.username),
    () => emit('close')
  );
</script>

<template>
  <AppDrawer
    :title="`Phiếu lương · ${slip ? slip.name : name || username}`"
    :sub="`${slip ? slip.role + ' · ' : ''}kỳ lương tháng ${monthShort(month)}`"
    :dismissable="!showPrint"
    @close="emit('close')"
  >
    <div v-if="loading" class="sec"><span class="meta">Đang tải phiếu lương…</span></div>
    <div v-else-if="error" class="sec">
      <span class="meta">Không tải được phiếu lương.</span>
      <button type="button" class="link" @click="reload">Thử lại</button>
    </div>
    <template v-else>
      <div class="pills">
        <span v-for="p in slip.pills" :key="p.label" class="pill" :class="p.cls">
          <Icon v-if="p.icon" :name="p.icon" :size="12" />{{ p.label }}
        </span>
        <span class="meta">{{ slip.meta }}</span>
      </div>

      <PayslipBody :payslip="slip" @edit="showEdit = true" />
    </template>

    <template #footer>
      <button type="button" class="btn" :disabled="!slip" @click="showPrint = true">
        <Icon name="print" />In phiếu
      </button>
      <span class="sp" />
      <template v-if="slip">
        <button v-if="slip.canReturn" type="button" class="btn" :disabled="busy" @click="giveBack">Trả lại</button>
        <button v-if="slip.canApprove" type="button" class="btn pri" :disabled="busy" @click="approve">
          <Icon name="check" />Phê duyệt riêng
        </button>
        <button v-else type="button" class="btn" @click="emit('close')">Đóng</button>
      </template>
      <button v-else type="button" class="btn" @click="emit('close')">Đóng</button>
    </template>
  </AppDrawer>

  <SlipOverrideDialog
    v-if="showEdit && slip"
    :month="month"
    :username="username"
    :name="slip.name"
    :auto="slip.auto"
    @close="showEdit = false"
    @done="
      showEdit = false;
      reload();
    "
  />
  <PrintPreviewDialog
    v-if="showPrint"
    :month="month"
    :username="username"
    :name="name"
    :scenario="scenario"
    @close="showPrint = false"
  />
</template>

<style scoped>
.pills {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 28px 0;
  flex-wrap: wrap;
}
.meta {
  color: var(--muted);
  font-size: 12px;
}
.sec {
  padding: 16px 28px 0;
}
.aibox {
  border: 1px solid #f1e4c4;
  background: var(--gold-pale);
  border-radius: 14px;
  padding: 8px 14px;
}
.aibox h4 {
  margin: 4px 0 2px;
  font-size: 13px;
  font-weight: 600;
}
/* Chip "Chính thức" không nạp settings.css trong thiết kế: trả .p-lock về dáng .pill thường */
.pills .p-lock {
  background: none;
  color: inherit;
  box-shadow: none;
}
</style>
