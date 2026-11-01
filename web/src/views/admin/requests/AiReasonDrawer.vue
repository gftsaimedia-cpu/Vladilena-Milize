<script setup lang="ts">
// Ngăn kéo "Lý do AI cảnh báo" của một yêu cầu (drw-yc-ly-do-ai, drw-tq-ly-do-ai): các cảnh báo AI của yêu cầu,
// ô lý do bắt buộc, rồi đồng ý hoặc từ chối kèm lý do. Mở từ Yêu cầu và từ Tổng quan.
// Props: requestId.  Emit: close; done (đã đồng ý/từ chối, màn gọi tải lại dữ liệu).
import { computed, ref } from 'vue';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { approveRequest, getRequestReasons, rejectRequest, skipWarning } from '@/services/admin-main';
import { dm, dmy } from '@/utils/format';
import WarningCard from '@/views/admin/assistant/WarningCard.vue';
import FieldArea from './FieldArea.vue';

const props = defineProps({ requestId: { type: String, required: true } });
const emit = defineEmits(['close', 'done']);
const { data, reload } = useLoad(
  () => getRequestReasons(props.requestId),
  () => props.requestId
);
const reason = ref('');
const busy = ref(false);
const canSend = computed(() => reason.value.trim().length > 0 && !busy.value);

async function skip(id?) {
  if (busy.value) return;
  busy.value = true;
  try {
    await skipWarning(id);
    await reload();
  } finally {
    busy.value = false;
  }
  // Hết cảnh báo thì yêu cầu về nhóm "Không có cảnh báo": đóng ngăn kéo và tải lại màn
  if (data.value && !data.value.warnings.length) {
    emit('done');
    emit('close');
  }
}
async function decide(action?) {
  if (!canSend.value) return;
  busy.value = true;
  try {
    await action(props.requestId, { reason: reason.value.trim() });
    emit('done');
    emit('close');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppDrawer
    title="Lý do AI cảnh báo"
    sub="Quy tắc nào, số liệu nào, ngưỡng nào · AI chỉ gợi ý, bạn quyết định"
    @close="emit('close')"
  >
    <div v-if="data" class="sec">
      <div class="req">
        <div>
          <span>Nhân sự</span>
          <b>{{ data.request.name }}</b>
        </div>
        <div>
          <span>Yêu cầu</span>
          <b>{{ data.request.kind }} · {{ dmy(data.request.date) }}</b>
        </div>
        <div>
          <span>Giờ</span>
          <b>{{ data.request.detail }}</b>
        </div>
        <div v-if="data.request.sentAt">
          <span>Gửi</span>
          <b>{{ data.request.sentAt.slice(11, 16) }} {{ dm(data.request.sentAt.slice(0, 10)) }}</b>
        </div>
      </div>
      <WarningCard v-for="w in data.warnings" :key="w.id" :warning="w" @skip="skip(w.id)" />
    </div>
    <template #footer>
      <div class="ftw">
        <div class="note">
          <Icon name="info" />
          <div>
            Yêu cầu có cảnh báo AI không đồng ý cả loạt được. Dù đồng ý hay từ chối, cần ghi lý do để lưu vào nhật ký.
          </div>
        </div>
        <div class="fld">
          <label>Lý do <small>(bắt buộc)</small></label>
          <FieldArea v-model="reason" placeholder="Ghi rõ lý do để lưu vào nhật ký" />
        </div>
        <div class="row2">
          <button type="button" class="btn" @click="emit('close')">Đóng</button>
          <span style="margin-left: auto" />
          <button type="button" class="btn" :disabled="!canSend" @click="decide(rejectRequest)">
            Từ chối kèm lý do
          </button>
          <button type="button" class="btn pri" :disabled="!canSend" @click="decide(approveRequest)">
            <Icon name="check" />
            Vẫn đồng ý kèm lý do
          </button>
        </div>
      </div>
    </template>
  </AppDrawer>
</template>

<style scoped>
.sec {
  padding: 14px 28px 0;
}
.fld {
  margin-top: 0;
}
.req {
  display: flex;
  gap: 18px;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--raised);
  font-size: 13px;
  margin-bottom: 12px;
}
.req span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}
.req b {
  font-weight: 600;
  font-size: 14px;
}
.ftw {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row2 {
  display: flex;
  gap: 10px;
}
.btn:disabled {
  opacity: 0.45;
}
</style>
