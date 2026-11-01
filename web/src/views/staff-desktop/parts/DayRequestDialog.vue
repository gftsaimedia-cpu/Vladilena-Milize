<script setup lang="ts">
// Hộp "Khai ngày" của khối Yêu cầu: cùng trường với bảng trượt Khai ngày của điện thoại.
// preset = { date: 'YYYY-MM-DD', type } chọn sẵn ngày và loại ngày; gửi xong phát 'saved' rồi 'close'.
import { computed, reactive, ref } from 'vue';
import { checkForm, isHolidayDate } from '@/builders/staff-requests/form';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getStaffDayFormContext, submitStaffDayRequest } from '@/services/staff-desktop';

const props = defineProps({ preset: { type: Object as () => any, default: () => ({}) } });
const emit = defineEmits(['close', 'saved']);

const { data: ctx } = useLoad(() => getStaffDayFormContext());
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

const TYPES = [
  { value: 'di-lam', title: 'Đi làm' },
  { value: 'phep-nam', title: 'Nghỉ phép năm' },
  { value: 'khong-luong', title: 'Nghỉ không lương' },
  { value: 'lam-bu', title: 'Nghỉ, sẽ làm bù' },
  { value: 'duyet', title: 'Nghỉ được duyệt' }
];
// Ngày lễ: giờ khai là khung giờ đi làm, không có ca và không có làm bù
const holiday = computed(() => !!ctx.value && isHolidayDate(ctx.value, form.date));

// Chỉ kiểm thiếu ô; đúng sai nghiệp vụ (OT tối đa, số dư phép, ngày lễ...) do máy chủ báo
async function submit() {
  error.value = checkForm(form, ctx.value);
  if (error.value || busy.value) return;
  busy.value = true;
  try {
    const res = await submitStaffDayRequest({ ...form }, ctx.value);
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
  <AppModal
    v-if="ctx"
    title="Khai ngày"
    sub="Yêu cầu cần Admin đồng ý mới tính vào thu nhập."
    :width="560"
    @close="emit('close')"
  >
    <div class="fld">
      <label for="dr-date">Ngày</label>
      <div class="inp"><input id="dr-date" v-model="form.date" type="date" /></div>
    </div>
    <div class="fld">
      <label for="dr-type">Loại ngày</label>
      <div class="inp">
        <select id="dr-type" v-model="form.type">
          <option v-for="o in TYPES" :key="o.value" :value="o.value">{{ o.title }}</option>
        </select>
      </div>
    </div>

    <template v-if="form.type === 'di-lam'">
      <div v-if="!holiday" class="fld">
        <label>Ca làm</label>
        <div class="shiftbox">{{ ctx.shiftName }}</div>
      </div>
      <div v-if="!holiday" class="fld">
        <label for="dr-kind">Làm thêm</label>
        <div class="inp">
          <select id="dr-kind" v-model="form.kind">
            <option value="ot">OT · làm thêm có tính tiền</option>
            <option value="lam-bu">Làm bù · bù cho ngày nghỉ</option>
          </select>
        </div>
      </div>
      <div class="g2">
        <div class="fld">
          <label for="dr-start">Giờ bắt đầu <small v-if="!holiday">(trước ca)</small></label>
          <div class="inp"><input id="dr-start" v-model="form.start" type="time" /></div>
        </div>
        <div class="fld">
          <label for="dr-end">Giờ kết thúc <small v-if="!holiday">(sau ca)</small></label>
          <div class="inp"><input id="dr-end" v-model="form.end" type="time" /></div>
        </div>
      </div>
      <div class="fld">
        <label for="dr-out">Ra khỏi văn phòng giữa giờ (phút)</label>
        <div class="inp"><input id="dr-out" v-model.number="form.outMinutes" type="number" min="0" /></div>
      </div>
    </template>

    <div v-if="error" class="note err" role="alert">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>

    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="busy" @click="submit">Gửi yêu cầu</button>
    </template>
  </AppModal>
</template>
