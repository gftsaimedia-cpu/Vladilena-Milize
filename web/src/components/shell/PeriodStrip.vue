<script setup lang="ts">
// Thanh kỳ lương trên đầu mọi màn Admin: chọn tháng, trạng thái kỳ, sáu bước, chuông việc cần xử lý.
// Đổi tháng = đổi ?thang= trên đường dẫn (AdminLayout đọc và cập nhật store kỳ lương).
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { usePeriodStore } from '@/stores/period';

defineProps({
  bell: { type: Number, default: 0 },
  showSteps: { type: Boolean, default: true }
});
defineEmits(['open-bell']);
const period = usePeriodStore();
const route = useRoute();
const router = useRouter();
const go = (month?) => month && router.replace({ query: { ...route.query, thang: month } });
</script>

<template>
  <div class="period">
    <div class="mpick">
      <button type="button" aria-label="Tháng trước" :disabled="!period.prevMonth" @click="go(period.prevMonth)">
        <Icon name="chevl" />
      </button>
      <span>{{ period.strip.month }}</span>
      <button type="button" aria-label="Tháng sau" :disabled="!period.nextMonth" @click="go(period.nextMonth)">
        <Icon name="chevr" />
      </button>
    </div>
    <span v-if="showSteps" class="state" :class="period.strip.stateCls">{{ period.strip.state }}</span>
    <div v-if="showSteps" class="steps" aria-label="Các bước kỳ lương">
      <template v-for="([st, label, small], i) in period.strip.steps" :key="label">
        <span v-if="i" class="sep" />
        <span class="step" :class="st">
          <span class="d"><Icon v-if="st === 'done'" name="check" :size="11" :stroke="3" /></span>
          {{ label }}
          <small v-if="small">{{ small }}</small>
        </span>
      </template>
    </div>
    <div class="right">
      <button type="button" class="bell" :aria-label="`Việc cần xử lý: ${bell}`" @click="$emit('open-bell')">
        <Icon name="bell" :size="18" />
        <i v-if="bell">{{ bell }}</i>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mpick button:disabled {
  opacity: 0.35;
  cursor: default;
}
.mpick button {
  cursor: pointer;
}
</style>
