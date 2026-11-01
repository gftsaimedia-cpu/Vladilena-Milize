<script setup lang="ts">
// Hộp chi tiết một ô ngày của Bảng công (dlg-cc-chi-tiet-ngay): các lượt Check-in/out trong ngày và form sửa giờ.
import { computed, ref, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getDayDetail, saveTimeFix } from '@/services/admin-attendance';
import { ApiError } from '@/services/http';
import { dayLong } from '@/utils/format';
import FldInput from '@/views/admin/staff/fields/FldInput.vue';
import FldSelect from '@/views/admin/staff/fields/FldSelect.vue';

const props = defineProps({
  personId: { type: String, required: true },
  date: { type: String, required: true } // 'YYYY-MM-DD'
});
const emit = defineEmits(['close', 'saved']);

const { data } = useLoad(
  () => getDayDetail(props.personId, props.date),
  () => props.personId + props.date
);
const title = computed(() =>
  data.value ? `${data.value.name} · ${dayLong(props.date).replace(', ', ' ')}/${props.date.slice(0, 4)}` : ''
);
const punches = computed(() => data.value?.punches || []);

const form = ref({ punchId: '', shift: '', checkIn: '', checkOut: '', reason: '' });
const punchOptions = computed(() =>
  punches.value.map(p => ({ value: String(p.id), label: `Lượt #${p.id} · ${p.checkIn}–${p.checkOut || '…'}` }))
);
const fillFrom = (id?) => {
  const p = punches.value.find(x => String(x.id) === String(id));
  form.value.punchId = p ? String(p.id) : '';
  form.value.checkIn = p?.checkIn || '';
  form.value.checkOut = p?.checkOut || '';
};
watch(data, d => d && fillFrom(d.punches[0]?.id), { immediate: true });

const timeOk = (t?) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t).trim());
const canSave = computed(
  () => punches.value.length && timeOk(form.value.checkIn) && timeOk(form.value.checkOut) && form.value.reason.trim()
);
const saving = ref(false);
async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    await saveTimeFix({ personId: props.personId, date: props.date, ...form.value, reason: form.value.reason.trim() });
    emit('saved');
  } catch (e) {
    // Câu lỗi của máy chủ hiện nguyên văn
    if (!(e instanceof ApiError)) throw e;
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    :title="title"
    :sub="data ? `${data.role} · ${data.shiftLabel}` : ''"
    :width="720"
    :top="56"
    @close="emit('close')"
  >
    <template v-if="data">
      <div v-for="p in punches" :key="p.id" class="lu">
        <div class="h">
          <b>Lượt #{{ p.id }}</b>
          <span class="pill" :class="p.closed ? 'p-done' : 'p-pend'">{{ p.status }}</span>
        </div>
        <div class="kv4">
          <div>
            <span>Check-in – Check-out</span><b>{{ p.checkIn }} – {{ p.checkOut || '…' }}</b>
          </div>
          <div>
            <span>Vào muộn</span><b>{{ p.lateMin }} phút</b>
          </div>
          <div>
            <span>OT đã khai</span><b>{{ p.ot }}</b>
          </div>
          <div>
            <span>Ngày công</span><b>{{ p.result }}</b>
          </div>
        </div>
        <div class="pun">
          <span
            ><b>{{ p.checkIn }}</b> Check-in</span
          >
          <span v-if="p.checkOut"
            ><b>{{ p.checkOut }}</b> Check-out</span
          >
          <span class="raw">giờ bấm gốc, luôn được giữ nguyên</span>
        </div>
      </div>
      <p v-if="!punches.length" class="none">Ngày này chưa có lượt Check-in nào.</p>

      <template v-if="punches.length">
        <div class="hd2">Sửa giờ Check-in/out</div>
        <div class="g2">
          <FldSelect
            :model-value="form.punchId"
            label="Lượt cần sửa"
            :options="punchOptions"
            @update:model-value="fillFrom"
          />
          <FldSelect v-model="form.shift" label="Ca đối chiếu" :options="data.shiftOptions" />
          <FldInput v-model="form.checkIn" label="Giờ vào" kind="time" icon="clock" />
          <FldInput v-model="form.checkOut" label="Giờ ra" kind="time" icon="clock" />
        </div>
        <FldInput
          v-model="form.reason"
          label="Lý do"
          small="bắt buộc"
          kind="area"
          placeholder="Ghi rõ lý do để lưu vào nhật ký"
        />
        <div style="height: 12px" />
        <div class="note">
          <Icon name="info" />
          <div>Chưa xem trước được ngày công và tiền khi sửa giờ: số mới hiện ở Bảng lương sau khi lưu.</div>
        </div>
      </template>
    </template>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
      <button v-if="punches.length" type="button" class="btn pri" :disabled="!canSave || saving" @click="save">
        <Icon name="check" />Lưu thay đổi
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.lu {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
}
.lu + .lu {
  margin-top: 12px;
}
.lu .h {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lu .h b {
  font-size: 15px;
}
.lu .h .pill {
  margin-left: auto;
}
.kv4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 12px;
}
.kv4 span {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.kv4 b {
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.pun {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.pun span {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--raised);
  border: 1px solid var(--border);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.pun span b {
  font-weight: 600;
}
.pun span.raw {
  background: none;
  border: 0;
  color: var(--muted);
  padding: 0;
}
.hd2 {
  margin: 20px 0 0;
  font-size: 14px;
  font-weight: 600;
}
.none {
  margin: 0;
  color: var(--muted);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
