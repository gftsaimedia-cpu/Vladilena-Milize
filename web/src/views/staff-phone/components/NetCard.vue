<script setup lang="ts">
// Thẻ đen thực nhận dự kiến (J6 mục 8.1, K1 cột 3): số tiền, trạng thái duyệt phiếu, tổng thu nhập và khấu trừ.
//   <NetCard :income="data" />
import type { IncomeView } from '@/mock/staff-phone';

defineProps<{ income: IncomeView }>();
</script>

<template>
  <section class="hero on-dark" aria-label="Thực nhận tháng 10">
    <span class="dim">Thực nhận dự kiến</span>
    <div class="amt">{{ income.net }} <span>₫</span></div>
    <span class="st live"><i class="dot pend" />{{ income.review }}</span>
    <div class="duo">
      <div>
        <span class="dim sm">Tổng thu nhập</span><b>{{ income.gross }}</b>
      </div>
      <div>
        <span class="dim sm">Khấu trừ</span><b>{{ income.deduction }}</b>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dim {
  color: #9e9e9e;
}
/* Thẻ đen thực nhận dự kiến (lớp on-dark: focus trắng) */
.hero {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px;
  border-radius: 24px;
  background: var(--surface-dark);
  color: #ffffff;
}
.amt {
  font-size: 32px;
  line-height: 40px;
  font-weight: 600;
}
.amt span {
  font-size: 20px;
  color: #9e9e9e;
  font-weight: 500;
}
.live {
  color: #ffffff;
}
.duo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}
.duo div {
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--surface-dark-raised);
}
.duo b {
  display: block;
  margin-top: 2px;
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
</style>
