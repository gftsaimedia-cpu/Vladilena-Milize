<script setup lang="ts">
// Thanh lưu (.savebar): bật khi có thay đổi. "Xem trước và lưu" gọi hàm lưu của màn (mockSave).
import { computed } from 'vue';

const props = defineProps({
  changes: { type: Number, default: 0 },
  saving: { type: Boolean, default: false },
  saved: { type: Boolean, default: false },
  error: { type: String, default: '' }
});
defineEmits(['cancel', 'save']);

const text = computed(() => {
  if (props.error) return props.error;
  if (props.changes) return `Có ${props.changes} thay đổi chưa lưu`;
  return props.saved ? 'Đã lưu thay đổi' : 'Chưa có thay đổi';
});
</script>

<template>
  <div class="savebar">
    <span>{{ text }}</span>
    <span class="r">
      <button
        type="button"
        class="btn sm"
        :class="{ off: !changes }"
        :disabled="!changes || saving"
        @click="$emit('cancel')"
      >
        Huỷ
      </button>
      <button
        type="button"
        class="btn sm"
        :class="changes ? 'pri' : 'off'"
        :disabled="!changes || saving"
        @click="$emit('save')"
      >
        Xem trước và lưu
      </button>
    </span>
  </div>
</template>
