<script setup lang="ts">
// Bảng trượt "Khai ngày": một thành phần cho cả ba bảng của thiết kế (xin nghỉ phép năm, khai OT, khai một ngày khác).
// preset = { date: 'YYYY-MM-DD', type } chọn sẵn ngày và loại ngày; gửi xong phát 'saved' (yêu cầu mới) rồi 'close'.
import { computed, reactive, ref } from 'vue';
import { checkForm, isHolidayDate } from '@/builders/staff-requests/form';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getDayFormContext, submitDayRequest } from '@/services/staff-phone';
import { dayLong } from '@/utils/format';
import BottomSheet from './BottomSheet.vue';

const props = defineProps({ preset: { type: Object as () => any, default: () => ({}) } });
const emit = defineEmits(['close', 'saved']);

const { data: ctx } = useLoad(() => getDayFormContext());
const form = reactive({
  date: props.preset.date || '',
  type: props.preset.type || 'di-lam',
  kind: 'ot',
  start: '',
  end: '',
  outMinutes: 0
});
const error = ref('');
const busy = ref(false);

const options = computed(() => [
  {
    value: 'di-lam',
    title: 'Đi làm',
    desc: 'Ngày không khai vẫn tính đi làm theo Check-in/out. Chọn mục này khi cần khai OT hoặc làm bù theo giờ.'
  },
  {
    value: 'phep-nam',
    title: 'Nghỉ phép năm',
    desc: `Trừ vào phép còn lại, cần Admin đồng ý.${ctx.value.leaveLeft === null ? '' : ` Còn ${ctx.value.leaveLeft} ngày phép tính đến hôm nay.`}`
  },
  {
    value: 'khong-luong',
    title: 'Nghỉ không lương',
    desc: 'Không tính lương ngày này. Còn phép năm thì nên dùng phép năm trước.'
  },
  {
    value: 'lam-bu',
    title: 'Nghỉ, sẽ làm bù',
    desc: 'Tính như nghỉ không lương; bù lại bằng giờ làm bù trong tháng.'
  },
  {
    value: 'duyet',
    title: 'Nghỉ được duyệt',
    desc: 'Không lương, không tính vào chuyên cần. Cần Admin đồng ý.'
  }
]);
const dateText = computed(() => (form.date ? `${dayLong(form.date)}/${form.date.slice(0, 4)}` : 'Chọn ngày'));
const monthNo = computed(() => (form.date ? `tháng ${Number(form.date.slice(5, 7))}` : 'tháng này'));
// Ngày lễ: giờ khai là khung giờ đi làm, không có ca và không có làm bù
const holiday = computed(() => isHolidayDate(ctx.value, form.date));

// Mở bảng chọn của trình duyệt khi bấm vào khung (ô ngày, ô giờ)
function showPicker(e?) {
  try {
    e.target.showPicker?.();
  } catch {
    /* trình duyệt không cho mở: bỏ qua, vẫn gõ tay được */
  }
}

// Chỉ kiểm thiếu ô; đúng sai nghiệp vụ (OT tối đa, số dư phép, ngày lễ...) do máy chủ báo
async function submit() {
  error.value = checkForm(form, ctx.value);
  if (error.value || busy.value) return;
  busy.value = true;
  try {
    const res = await submitDayRequest({ ...form }, ctx.value);
    emit('saved', res.item);
    emit('close');
  } catch (e) {
    toast.error(e && e.message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BottomSheet
    v-if="ctx"
    title="Khai ngày"
    sub="Yêu cầu cần Admin đồng ý mới tính vào thu nhập."
    @close="emit('close')"
  >
    <template #badge><span class="pill p-pend">Chờ xử lý</span></template>

    <div class="fld">
      <label for="dr-date">Ngày</label>
      <div class="inp">
        <span>{{ dateText }}</span>
        <span class="end"><Icon name="cal" /></span>
        <input id="dr-date" v-model="form.date" class="over" type="date" @click="showPicker" />
      </div>
    </div>

    <div class="fld"><label id="dr-type">Loại ngày</label></div>
    <div role="radiogroup" aria-labelledby="dr-type">
      <label v-for="o in options" :key="o.value" class="opt" :class="{ on: form.type === o.value }">
        <input v-model="form.type" type="radio" name="dr-type" :value="o.value" />
        <span class="rd" />
        <div>
          <b>{{ o.title }}</b>
          <span class="d">{{ o.desc }}</span>
        </div>
      </label>
    </div>

    <template v-if="form.type === 'di-lam'">
      <div v-if="!holiday" class="fld">
        <label>Ca làm</label>
        <div class="shiftbox">{{ ctx.shiftName }}</div>
        <div class="hint">Ca do Admin gán. Muốn đổi ca thì báo Admin.</div>
      </div>
      <div v-if="!holiday" class="fld">
        <label for="dr-kind">Làm thêm</label>
        <div class="inp">
          <select id="dr-kind" v-model="form.kind">
            <option value="ot">OT · làm thêm có tính tiền</option>
            <option value="lam-bu">Làm bù · bù cho ngày nghỉ</option>
          </select>
          <span class="end"><Icon name="chev" /></span>
        </div>
      </div>
      <div class="g2">
        <div class="fld">
          <label for="dr-start">Giờ bắt đầu <small v-if="!holiday">(trước ca)</small></label>
          <div class="inp" :class="{ ph: !form.start }">
            <input id="dr-start" v-model="form.start" type="time" @click="showPicker" />
            <span class="end"><Icon name="clock" /></span>
          </div>
        </div>
        <div class="fld">
          <label for="dr-end">Giờ kết thúc <small v-if="!holiday">(sau ca)</small></label>
          <div class="inp" :class="{ ph: !form.end }">
            <input id="dr-end" v-model="form.end" type="time" @click="showPicker" />
            <span class="end"><Icon name="clock" /></span>
          </div>
        </div>
      </div>
      <div v-if="!holiday" class="hint">Điền một hoặc cả hai ô. Giờ không hợp lệ sẽ báo ngay khi gửi.</div>
      <div class="fld">
        <label for="dr-out">Ra khỏi văn phòng giữa giờ (phút)</label>
        <div class="inp">
          <input id="dr-out" v-model.number="form.outMinutes" type="number" min="0" inputmode="numeric" />
        </div>
      </div>
    </template>

    <div v-else-if="form.type === 'phep-nam'" class="note warn">
      <Icon name="alert" />
      <div>Nghỉ phép năm cần Admin đồng ý. Trước đó, ngày này chưa tính vào thu nhập.</div>
    </div>
    <div v-else-if="form.type === 'lam-bu'" class="note">
      <Icon name="info" />
      <div>
        Nghỉ, sẽ làm bù: ngày này tính như nghỉ không lương. Khai giờ làm bù trong {{ monthNo }} để được tính lại.
      </div>
    </div>

    <div v-if="error" class="note err" role="alert">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>

    <div class="bt">
      <button type="button" @click="emit('close')">Huỷ</button>
      <button type="button" class="pri" :disabled="busy" @click="submit">Gửi yêu cầu</button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.ph-sheet .inp input.over {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.ph-sheet .inp .end {
  pointer-events: none;
}
.ph-sheet .inp input[type='time']::-webkit-calendar-picker-indicator {
  display: none;
}
.ph-sheet .inp select {
  appearance: none;
  cursor: pointer;
}
.ph-sheet .inp input[type='number']::-webkit-inner-spin-button {
  appearance: none;
}
</style>
