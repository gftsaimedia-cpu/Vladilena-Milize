<script setup lang="ts">
// Phiếu thu nhập đọc từ trên xuống dưới: số thực nhận, nhóm Thu nhập, nhóm Các khoản trừ, dòng tổng.
// Mọi số (tổng nhóm, thực nhận) là số máy chủ trả sẵn; ở đây chỉ định dạng.
import { vnd, vndSigned } from '@/utils/format';

defineProps({
  figure: { type: Object as () => any, required: true },
  groups: { type: Array as () => any[], required: true },
  total: { type: Object as () => any, required: true },
  official: { type: Boolean, default: false }
});

// Khoản trừ hiện dấu −, khoản cộng hiện số thường
const amount = (n?) => (n < 0 ? vndSigned(n) : vnd(n));
const money = (n?) => `${amount(n)} ₫`;
</script>

<template>
  <section class="sec card slip">
    <div class="fig1">
      <div class="l">{{ figure.label }}</div>
      <div class="v" :class="{ 'est-u': !official }">{{ vnd(figure.amount) }}<span class="unit">₫</span></div>
      <div class="n">{{ figure.note }}</div>
    </div>
    <template v-for="g in groups" :key="g.title">
      <div class="grp">
        <span>{{ g.title }}</span
        ><span class="v">{{ money(g.total) }}</span>
      </div>
      <div v-for="r in g.rows" :key="r.label" class="kv">
        <span class="k"
          >{{ r.label }}<small v-if="r.hint">{{ r.hint }}</small></span
        >
        <span class="v" :class="{ z: r.amount === 0 }">{{ amount(r.amount) }}</span>
      </div>
    </template>
    <div class="tot">
      <span>{{ total.label }}</span>
      <span class="v" :class="{ est: !official }">{{ money(total.amount) }}</span>
    </div>
  </section>
</template>

<style scoped>
.fig1 {
  padding: 18px 16px 16px;
}
.fig1 .l {
  color: var(--muted);
  font-size: 14px;
}
.fig1 .v {
  font-size: 36px;
  line-height: 44px;
  font-weight: 600;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.fig1 .n {
  color: var(--muted);
  font-size: 14px;
  line-height: 20px;
  margin-top: 6px;
}
.grp {
  display: flex;
  justify-content: space-between;
  padding: 14px 16px 6px;
  font-weight: 600;
  font-size: 15px;
  line-height: 24px;
  border-top: 1px solid var(--rule);
  margin: 0;
  color: var(--text);
}
.grp .v {
  font-variant-numeric: tabular-nums;
}
.slip .kv {
  padding-left: 28px;
  border-top: 0;
  min-height: 40px;
  padding-top: 8px;
  padding-bottom: 8px;
}
.slip .kv .v {
  font-weight: 500;
}
.slip .kv .v.z {
  color: #a3a3a3;
  font-weight: 400;
}
.tot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--gold-pale);
  border-top: 1px solid #f1e4c4;
  border-radius: 0 0 20px 20px;
  font-weight: 600;
}
.tot .v {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
</style>
