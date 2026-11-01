<script setup lang="ts">
// Dải chọn phiếu: gợi ý chọn hàng loạt, hoặc số phiếu đã chọn cùng nút Trả lại / Phê duyệt.
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';

defineProps({
  total: { type: Number, default: 0 }, // tổng phiếu đã chọn
  onPage: { type: Number, default: 0 }, // trong đó ở trang này
  others: { type: Number, default: 0 } // ở các trang khác
});
defineEmits(['select-all', 'clear', 'return', 'approve']);
</script>

<template>
  <div class="bnr sel">
    <template v-if="total > 0">
      <span class="t">
        <b>Đã chọn {{ total }} phiếu</b>
        · {{ onPage }} phiếu ở trang này<template v-if="others">, {{ others }} ở các trang khác</template>
      </span>
      <span class="bs">
        <button type="button" class="tact" style="align-self: center; margin-right: 8px" @click="$emit('clear')">
          Bỏ chọn
        </button>
        <button type="button" class="btn sm" @click="$emit('return')">Trả lại</button>
        <button type="button" class="btn sm pri" @click="$emit('approve')">
          <Icon name="check" />Phê duyệt {{ total }} phiếu
        </button>
      </span>
    </template>
    <template v-else>
      <span class="t"> Chọn phiếu để phê duyệt hoặc trả lại. </span>
      <span class="bs">
        <button type="button" class="btn sm" @click="$emit('select-all')">Chọn mọi phiếu</button>
        <button type="button" class="btn sm off" disabled>Trả lại</button>
        <button type="button" class="btn sm off" disabled>Phê duyệt phiếu</button>
      </span>
    </template>
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
.bnr.sel {
  background: var(--raised);
  border: 1px solid var(--border);
}
.bnr.sel b {
  font-weight: 600;
}
</style>
