<script setup lang="ts">
// Dải AI trên Bảng lương: tóm tắt phát hiện của AI và các nút xử lý (xem, chạy lại, tính lại, bỏ qua có lý do).
import Icon from '@/components/ui/Icon.vue';
import { AI_BUTTONS } from '../scenarios';
import RichText from './RichText.vue';

defineProps({ ai: { type: Object as () => any, required: true } });
defineEmits(['button']);
</script>

<template>
  <div class="bnr ai">
    <span class="tag"><Icon name="spark" :size="11" />AI</span>
    <span class="t"><RichText :segs="ai.segs" /></span>
    <span class="bs">
      <button v-for="k in ai.buttons" :key="k" type="button" class="btn sm" @click="$emit('button', k)">
        {{ AI_BUTTONS[k] }}
      </button>
    </span>
  </div>
</template>

<style scoped>
.bnr {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0 24px 14px;
  padding: 12px 16px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 19px;
}
.bnr .t {
  flex: 1;
}
.bnr .bs {
  display: flex;
  gap: 8px;
  flex: none;
}
.bnr.ai {
  background: var(--gold-pale);
  border: 1px solid #f1e4c4;
}
.bnr.ai .tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--text);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  flex: none;
}
.bnr.ai .tag svg {
  color: var(--gold);
}
</style>
