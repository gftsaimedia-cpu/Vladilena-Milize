<script setup lang="ts">
// Thẻ đen thực nhận (J6 mục 8.1, K1 cột 3): số tiền, ngày trả lương, trạng thái duyệt phiếu, tổng thu nhập và khấu trừ.
// Phiếu chính thức (Admin đã duyệt) ghi "Thực nhận"; còn lại là số tạm tính, ghi "Thực nhận dự kiến".
// Nhãn của vùng theo tháng đang xem ("Thực nhận tháng 9/2026").
// Dùng ở IncomeView (điện thoại) và IncomeColumn (máy tính), nên dòng "trả ngày" nằm ở đây.
//   <NetCard :income="data" />
import { computed } from 'vue';
import type { IncomeView } from '@/mock/staff-phone';
import { dm } from '@/utils/format';

const props = defineProps<{ income: IncomeView }>();
const official = computed(() => props.income.state === 'Chính thức');
const region = computed(() => `Thực nhận ${props.income.label.replace(/^Tháng/, 'tháng')}`);
</script>

<template>
  <section class="hero on-dark" :aria-label="region">
    <span class="dim">{{ official ? 'Thực nhận' : 'Thực nhận dự kiến' }}</span>
    <div class="amt">{{ income.net }} <span>₫</span></div>
    <span v-if="income.payDate" class="dim sm">trả ngày {{ dm(income.payDate) }}</span>
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
