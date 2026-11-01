<script setup lang="ts">
// Hộp "Gán ca cho nhiều người": gán cùng một ca cho những người đã chọn ở danh sách Nhân sự.
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { toast } from '@/components/shell/toast';
import { assignShifts, getStaffOptions } from '@/services/admin-hr';
import FldSelect from './fields/FldSelect.vue';

const props = defineProps({ usernames: { type: Array as () => any[], required: true } });
const emit = defineEmits(['close', 'saved']);
const { data: opts } = useLoad(() => getStaffOptions());
const shift = ref('n1');
const shifts = computed(() => (opts.value?.shifts || []).filter(s => s.value));
const saving = ref(false);
async function save() {
  if (!props.usernames.length || saving.value) return;
  saving.value = true;
  try {
    await assignShifts(props.usernames, shift.value);
    emit('saved');
  } catch (e) {
    toast.error(e && e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Gán ca cho nhiều người"
    sub="Gán cùng một ca cố định cho những người đã chọn"
    :width="560"
    :top="160"
    @close="emit('close')"
  >
    <FldSelect v-model="shift" label="Ca cố định" :options="shifts" />
    <div style="height: 14px" />
    <div class="note" :class="{ warn: !usernames.length }">
      <Icon name="info" />
      <div v-if="usernames.length">
        Sẽ gán ca cho <b>{{ usernames.length }} người</b> đã chọn.
      </div>
      <div v-else>Chưa chọn ai. Đóng hộp này, tick chọn các dòng trong danh sách rồi bấm lại.</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="!usernames.length || saving" @click="save">
        <Icon name="check" />Gán ca
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
