<script setup lang="ts">
// Hộp "Thêm khoản cộng/trừ" (dlg-t11-them-khoan): khoản một lần cho một người trong tháng, chờ phê duyệt mới vào lương.
import { reactive, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { addExtra, searchExtraPeople } from '@/services/admin-payroll';
import { monthShort } from '@/utils/format';
import DlgField from './DlgField.vue';

const props = defineProps({ month: { type: String, required: true } });
const emit = defineEmits(['close', 'done']);

const KINDS = [
  { value: 'plus', label: 'Cộng thêm' },
  { value: 'minus', label: 'Trừ bớt' }
];
const TAXES = [
  { value: 'taxable', label: 'Chịu thuế' },
  { value: 'exempt', label: 'Không chịu thuế' }
];
const INSURED = [
  { value: 'no', label: 'Không' },
  { value: 'yes', label: 'Có' }
];

const form = reactive({ kind: 'plus', amount: '', label: '', line: '', tax: 'taxable', insured: 'no', reason: '' });
const person = ref(null); // { username, name } đã chọn
const query = ref('');
const found = ref([]);
const showList = ref(false);
const error = ref('');
const busy = ref(false);

async function loadList() {
  showList.value = true;
  found.value = await searchExtraPeople(query.value);
}
function onQuery() {
  person.value = null;
  loadList();
}
function hideList() {
  setTimeout(() => (showList.value = false), 150);
}
function pick(p?) {
  person.value = p;
  query.value = p.name;
  showList.value = false;
}
async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await addExtra(props.month, {
      username: person.value?.username || '',
      name: person.value?.name || '',
      kind: form.kind,
      amount: Number(String(form.amount).replace(/\D/g, '')),
      label: form.label,
      line: form.line || form.label,
      taxable: form.tax === 'taxable',
      insured: form.insured === 'yes',
      reason: form.reason
    });
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
    title="Thêm khoản cộng/trừ"
    :sub="`Khoản một lần cho một người trong tháng ${monthShort(month)} · khoản chờ phê duyệt chưa vào lương`"
    :width="860"
    :top="64"
    :dismissable="false"
    @close="emit('close')"
  >
    <div class="fld pick">
      <label for="extra-person">Người nhận</label>
      <div class="inp">
        <input
          id="extra-person"
          v-model="query"
          type="text"
          autocomplete="off"
          placeholder="Gõ tên hoặc tên đăng nhập"
          @input="onQuery"
          @focus="loadList"
          @blur="hideList"
        />
        <span class="end"><Icon name="search" /></span>
      </div>
      <ul v-if="showList && found.length" class="list">
        <li v-for="p in found" :key="p.username">
          <button type="button" @click="pick(p)">
            {{ p.name }} <small>{{ p.username }}</small>
          </button>
        </li>
      </ul>
    </div>
    <div class="g2">
      <DlgField v-model="form.kind" label="Loại khoản" :options="KINDS" />
      <DlgField v-model="form.amount" label="Số tiền" inputmode="numeric" :maxlength="15">
        <template #end>₫</template>
      </DlgField>
      <DlgField v-model="form.label" label="Tên khoản" :maxlength="100" />
      <DlgField v-model="form.line" label="Dòng trên phiếu" hint="(để trống thì dùng tên khoản)" :maxlength="100" />
      <DlgField v-model="form.tax" label="Thuế" :options="TAXES" />
      <DlgField v-model="form.insured" label="Tính vào bảo hiểm" :options="INSURED" />
    </div>
    <div style="height: 12px" />
    <div class="note">
      <Icon name="info" />
      <div>
        Cách tính thuế và bảo hiểm của khoản chỉ có hiệu lực sau khi Kế toán xác nhận; trước đó khoản được tính là chịu
        thuế và không vào bảo hiểm.
      </div>
    </div>
    <DlgField
      v-model="form.reason"
      label="Lý do"
      hint="(bắt buộc, 10–300 ký tự)"
      area
      placeholder="Ghi rõ lý do để lưu vào nhật ký"
      :maxlength="300"
    />
    <div v-if="error" class="note err" style="margin-top: 12px">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="busy" @click="submit"><Icon name="send" />Gửi phê duyệt</button>
    </template>
  </AppModal>
</template>

<style scoped>
.pick {
  position: relative;
}
.pick .inp:focus-within {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e9e9e9;
}
.pick input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  padding: 0;
}
.pick input::placeholder {
  color: #9e9e9e;
}
.list {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  margin: 4px 0 0;
  padding: 4px;
  list-style: none;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.list button {
  width: 100%;
  text-align: left;
  border: 0;
  background: none;
  font: inherit;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.list button:hover {
  background: var(--raised);
}
.list small {
  color: var(--muted);
  margin-left: 6px;
}
</style>
