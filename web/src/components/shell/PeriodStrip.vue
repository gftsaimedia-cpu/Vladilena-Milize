<script setup lang="ts">
// Dải bước kỳ lương dưới thanh trên: trạng thái kỳ và các bước; chỉ hiện ở Chấm công, KPI, Bảng lương.
import Icon from '@/components/ui/Icon.vue';
import { usePeriodStore } from '@/stores/period';

const period = usePeriodStore();
</script>

<template>
  <div class="period">
    <span class="state" :class="period.strip.stateCls">{{ period.strip.state }}</span>
    <div class="steps" role="region" aria-label="Các bước kỳ lương" tabindex="0">
      <template v-for="([st, label, small], i) in period.strip.steps" :key="label">
        <span v-if="i" class="sep" />
        <span class="step" :class="st">
          <span class="d"><Icon v-if="st === 'done'" name="check" :size="11" :stroke="3" /></span>
          {{ label }}
          <small v-if="small">{{ small }}</small>
        </span>
      </template>
    </div>
  </div>
</template>
