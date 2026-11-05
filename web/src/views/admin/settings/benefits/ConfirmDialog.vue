<script setup lang="ts">
// Hộp "Lưu chế độ": chọn tháng áp dụng (tháng này trở đi), xem các ô sẽ đổi so với phiên bản đang hiệu lực ở tháng đó,
// thêm lý do rồi bấm Lưu. Tháng mà mọi ô đã bằng số mới thì không có gì để lưu, nút Lưu tắt.
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import type { BenefitsView } from '@/builders/api/benefits';
import { benefitChangesAt } from '@/services/admin-settings';
import { usePeriodStore } from '@/stores/period';
import SelectBox from '../fields/SelectBox.vue';
import TextBox from '../fields/TextBox.vue';
import { monthOptions } from '../lib/date';
import { REASON_MAX } from '../lib/rules';

const props = defineProps({
  draft: { type: Object as () => BenefitsView, required: true },
  saving: { type: Boolean, default: false }
});
const emit = defineEmits(['close', 'confirm']);

const period = usePeriodStore();
const months = monthOptions(period.current);
const month = ref(months[0].value);
const reason = ref('');
const lines = computed(() => benefitChangesAt(month.value, props.draft).lines);
</script>

<template>
  <AppModal title="Lưu chế độ" :width="560" :top="120" :dismissable="!saving" @close="emit('close')">
    <div class="fld">
      <label>Áp dụng từ tháng</label>
      <SelectBox v-model="month" variant="inp" :options="months" label="Áp dụng từ tháng" />
    </div>
    <div class="fld">
      <label>Các ô sẽ đổi</label>
      <ul v-if="lines.length" class="chg">
        <li v-for="l in lines" :key="l">{{ l }}</li>
      </ul>
      <p v-else class="none">Không có thay đổi ở tháng này</p>
    </div>
    <div class="fld">
      <label>Lý do <small>(không bắt buộc)</small></label>
      <TextBox v-model="reason" area :maxlength="REASON_MAX" label="Lý do" />
    </div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">Huỷ</button>
      <button
        type="button"
        class="btn"
        :class="lines.length ? 'pri' : 'off'"
        :disabled="!lines.length || saving"
        @click="emit('confirm', month, reason.trim())"
      >
        Lưu
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.chg {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
}
.none {
  margin: 0;
  color: var(--muted);
}
</style>
