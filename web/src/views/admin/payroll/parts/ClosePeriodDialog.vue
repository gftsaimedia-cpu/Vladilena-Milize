<script setup lang="ts">
// Hộp "Chốt công tháng …" (dlg-t10-chot-cong, dlg-t11-chot-cong): các việc còn lại trước khi khoá bảng công.
// Việc bỏ qua được thì tick "Bỏ qua" và ghi lý do; việc không bỏ qua được chặn nút Chốt công.
import { computed, reactive, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { closeHours, getCloseChecks } from '@/services/admin-payroll';
import { monthShort } from '@/utils/format';
import DlgField from './DlgField.vue';

const props = defineProps({ month: { type: String, required: true } });
const emit = defineEmits(['close', 'done']);

const { data } = useLoad(() => getCloseChecks(props.month));
const skipped = reactive(new Set());
const reason = ref('');
const error = ref('');
const busy = ref(false);

const PILL = { err: 'p-err', pend: 'p-pend', draft: 'p-draft' };
const LINKS = { req: '/admin/yeu-cau', nostart: '/admin/nhan-su', noshift: '/admin/nhan-su' };
const linkOf = (id?) => LINKS[id] || '/admin/cham-cong';
const blocked = computed(() => Boolean(data.value?.items.some(i => i.mode === 'block')));

function toggle(id?) {
  if (skipped.has(id)) skipped.delete(id);
  else skipped.add(id);
  error.value = '';
}
async function submit() {
  if (blocked.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await closeHours(props.month, { skipped: [...skipped], reason: reason.value });
    emit('done');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal
    :title="`Chốt công tháng ${monthShort(month)}`"
    :sub="data?.sub"
    :width="blocked ? 680 : 640"
    :top="blocked ? 72 : 120"
    :dismissable="false"
    @close="emit('close')"
  >
    <template v-if="data">
      <p>
        Chốt công là khoá bảng công tháng {{ Number(month.slice(5, 7)) }}: sau khi chốt không sửa được nữa. Muốn mở lại
        phải có quyền và ghi lý do.
      </p>
      <div v-for="it in data.items" :key="it.id" class="chk">
        <span>
          <span class="pill" :class="PILL[it.tone]" style="min-width: 34px; justify-content: center">{{ it.n }}</span>
        </span>
        <span>{{ it.label }}</span>
        <span class="r">
          <template v-if="it.mode === 'skip'">
            <button
              type="button"
              class="cb"
              :class="{ on: skipped.has(it.id) }"
              role="checkbox"
              :aria-checked="skipped.has(it.id)"
              aria-label="Bỏ qua, tính như hiện tại"
              @click="toggle(it.id)"
            >
              <Icon v-if="skipped.has(it.id)" name="check" :size="12" :stroke="3" />
            </button>
            Bỏ qua, tính như hiện tại
          </template>
          <span v-else-if="it.mode === 'block'">Không bỏ qua được</span>
          <span v-else>Chỉ để biết, không chặn</span>
          <RouterLink class="link" :to="linkOf(it.id)">Xem</RouterLink>
        </span>
      </div>
      <div style="height: 12px" />
      <div v-if="blocked" class="note err">
        <Icon name="alert" />
        <div>{{ data.blockedNote }}</div>
      </div>
      <div v-else class="note">
        <Icon name="info" />
        <div>Việc nào bỏ qua được thì tick <b>Bỏ qua</b> và ghi lý do để chốt.</div>
      </div>
      <DlgField
        v-model="reason"
        label="Lý do bỏ qua"
        hint="(bắt buộc nếu bỏ qua việc nào)"
        area
        placeholder="Ghi rõ lý do để lưu vào nhật ký"
        :maxlength="300"
      />
      <div v-if="error && !blocked" class="note err" style="margin-top: 12px">
        <Icon name="alert" />
        <div>{{ error }}</div>
      </div>
    </template>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="blocked ? 'off' : 'pri'" :disabled="busy" @click="submit">
        <Icon name="lock" />Chốt công
      </button>
    </template>
  </AppModal>
</template>
