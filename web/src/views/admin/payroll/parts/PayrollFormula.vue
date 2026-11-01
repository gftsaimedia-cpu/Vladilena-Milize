<script setup lang="ts">
// Dải công thức: quỹ lương − bảo hiểm − thuế TNCN − tạm ứng = thực nhận (số có sẵn từ máy chủ).
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { vnd } from '@/utils/format';

const props = defineProps({ formula: { type: Object as () => any, required: true } });

const ITEMS = [
  ['income', 'Quỹ lương'],
  ['insurance', 'Bảo hiểm'],
  ['tax', 'Thuế TNCN'],
  ['advance', 'Tạm ứng'],
  ['net', 'Thực nhận']
];
const cls = (key?) => {
  if (props.formula.locked) return '';
  return key === 'income' || key === 'net' ? 'est-u' : 'est';
};
const items = computed(() => ITEMS);
</script>

<template>
  <div class="formula" aria-label="Thực nhận bằng quỹ lương trừ bảo hiểm, thuế và tạm ứng">
    <template v-for="([key, label], i) in items" :key="key">
      <div v-if="i" class="op">{{ key === 'net' ? '=' : '−' }}</div>
      <div :class="{ lead: key === 'net' }">
        <div class="l">
          {{ label }}
          <span v-if="key === 'income' && formula.locked" class="lockp">
            <Icon name="lock" :size="11" />Đã chốt số
          </span>
        </div>
        <div class="v" :class="cls(key)">{{ vnd(formula[key]) }}<span class="unit">₫</span></div>
        <div class="n">{{ formula.notes[key] }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.lockp {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--text);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  vertical-align: 3px;
  margin-left: 6px;
}
</style>
