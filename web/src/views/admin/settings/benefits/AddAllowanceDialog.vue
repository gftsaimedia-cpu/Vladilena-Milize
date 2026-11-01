<script setup lang="ts">
// Hộp thoại "Thêm chế độ phụ cấp": khoản mới thành một cột của bảng Chế độ theo loại nhân sự. Mở từ ?hop=them-che-do.
import { computed, reactive, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { addAllowance } from '@/services/admin-settings';
import { usePeriodStore } from '@/stores/period';
import CheckBox from '../fields/CheckBox.vue';
import FieldNum from '../fields/FieldNum.vue';
import SelectBox from '../fields/SelectBox.vue';
import TextBox from '../fields/TextBox.vue';
import { monthOptions } from '../lib/date';
import { REASON_MAX, REASON_MIN, reasonOk } from '../lib/rules';

const props = defineProps({ types: { type: Array as () => any[], required: true } }); // [{ key, name }]
const emit = defineEmits(['close', 'saved']);

const MODES = [
  { value: 'money', label: 'Số tiền cố định (₫)' },
  { value: 'pct', label: '% lương cơ bản' }
];
const months = monthOptions(usePeriodStore().month);

const name = ref('');
const mode = ref('money');
const scale = ref('Không');
const lose = ref('Không mất, không giảm');
const tax = ref('Chịu thuế');
const insurance = ref('Không');
const month = ref(months[0].value);
const reason = ref('');
const saving = ref(false);
// Mỗi loại nhân sự: tick được hưởng + mức
const picks = reactive(Object.fromEntries(props.types.map(t => [t.key, { on: true, amount: null }])));

const valid = computed(() => name.value.trim() !== '' && reasonOk(reason.value));
const unit = computed(() => (mode.value === 'pct' ? '%' : '₫'));

async function submit() {
  if (!valid.value || saving.value) return;
  saving.value = true;
  try {
    const appliesTo = Object.fromEntries(
      props.types.map(t => [t.key, picks[t.key].on ? (picks[t.key].amount == null ? 0 : picks[t.key].amount) : null])
    );
    await addAllowance({
      name: name.value.trim(),
      mode: mode.value,
      scale: scale.value,
      lose: lose.value,
      tax: tax.value,
      insurance: insurance.value,
      appliesTo,
      fromMonth: month.value,
      reason: reason.value.trim()
    });
    emit('saved');
    emit('close');
  } catch (e) {
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Thêm chế độ phụ cấp"
    sub="Khoản mới nằm trong Phụ cấp và thành một cột của bảng Chế độ theo loại nhân sự"
    :width="760"
    :top="40"
    @close="emit('close')"
  >
    <div class="fld">
      <label>Tên khoản</label><TextBox v-model="name" placeholder="Ví dụ: Phụ cấp ăn trưa" label="Tên khoản" />
    </div>
    <div class="g2">
      <div class="fld">
        <label>Cách tính</label><SelectBox v-model="mode" variant="inp" :options="MODES" label="Cách tính" />
      </div>
      <div class="fld">
        <label>Co giãn theo ngày đi làm</label>
        <SelectBox v-model="scale" variant="inp" :options="['Không', 'Có']" label="Co giãn theo ngày đi làm" />
      </div>
      <div class="fld">
        <label>Điều kiện mất hoặc giảm</label>
        <SelectBox
          v-model="lose"
          variant="inp"
          :options="['Không mất, không giảm', 'Mất theo quy tắc chuyên cần']"
          label="Điều kiện mất hoặc giảm"
        />
      </div>
      <div></div>
      <div class="fld">
        <label>Thuế</label
        ><SelectBox v-model="tax" variant="inp" :options="['Chịu thuế', 'Không chịu thuế']" label="Thuế" />
      </div>
      <div class="fld">
        <label>Tính vào bảo hiểm</label>
        <SelectBox v-model="insurance" variant="inp" :options="['Không', 'Có']" label="Tính vào bảo hiểm" />
      </div>
    </div>
    <div style="height: 12px"></div>
    <div class="note">
      <Icon name="info" />
      <div>
        Cách tính thuế và bảo hiểm chỉ có hiệu lực sau khi Kế toán xác nhận; trước đó khoản được tính là chịu thuế và
        không vào bảo hiểm.
      </div>
    </div>
    <div class="fld">
      <label>Loại nhân sự được hưởng và mức</label>
      <div class="lv">
        <div v-for="t in types" :key="t.key" class="lvr">
          <span><CheckBox v-model="picks[t.key].on" :label="t.name" />{{ t.name }}</span>
          <div class="inp">
            <input
              type="text"
              inputmode="numeric"
              :value="picks[t.key].amount == null ? '' : picks[t.key].amount"
              :disabled="!picks[t.key].on"
              :aria-label="`Mức của ${t.name}`"
              @input="
                picks[t.key].amount =
                  ($event.target as HTMLInputElement).value.replace(/\D/g, '') === ''
                    ? null
                    : Number(($event.target as HTMLInputElement).value.replace(/\D/g, ''))
              "
            />
            <span class="end">{{ unit }}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="g2">
      <div class="fld">
        <label>Áp dụng từ tháng</label
        ><SelectBox v-model="month" variant="inp" :options="months" label="Áp dụng từ tháng" />
      </div>
      <div></div>
    </div>
    <div class="fld">
      <label
        >Lý do <small>(bắt buộc, {{ REASON_MIN }}–{{ REASON_MAX }} ký tự)</small></label
      >
      <TextBox
        v-model="reason"
        area
        :maxlength="REASON_MAX"
        placeholder="Ghi rõ lý do để lưu vào nhật ký"
        label="Lý do"
      />
    </div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="valid ? 'pri' : 'off'" :disabled="!valid || saving" @click="submit">
        <Icon name="plus" />Thêm chế độ
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.lv {
  border: 1px solid var(--border);
  border-radius: 12px;
}
.lvr {
  display: grid;
  grid-template-columns: 1fr 260px;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
}
.lvr + .lvr {
  border-top: 1px solid var(--rule);
}
.lvr > span {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
</style>
