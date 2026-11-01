<script setup lang="ts">
// Khối thu nhập của tháng: thực nhận, các dòng chính, và bảng "cách tính" mở rộng.
import { ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { vnd, vndSigned } from '@/utils/format';
import { smallText } from './small-text';

const props = defineProps({
  data: { type: Object as () => any, required: true },
  month: { type: String, default: '' },
  staff: { type: Object as () => any, default: () => ({}) }, // { username, name } của người đang xem
  initialExpanded: { type: Boolean, default: false }
});

const expanded = ref(props.initialExpanded && !!props.data.breakdown);

const amount = (v?) => (v < 0 ? vndSigned(v) : vnd(v));
const rowValue = (r?) => (r.text != null ? r.text : r.signed ? vndSigned(r.value) : vnd(r.value));
// Phiếu A4 mở ở tab mới (trang in của nhóm phiếu lương: /in/phieu-luong/:month/:username)
const openPayslip = () => {
  const { username = '', name = '' } = props.staff || {};
  const q = name ? `?ten=${encodeURIComponent(name)}` : '';
  window.open(`/in/phieu-luong/${props.month}/${encodeURIComponent(username)}${q}`, '_blank', 'noopener');
};
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ data.title }}</h2>
    </div>
    <div class="fig">
      <div class="lab">{{ data.netLabel }}</div>
      <div class="v" :class="{ 'est-u': data.estimated }">{{ vnd(data.net) }}<span class="unit">₫</span></div>
      <div class="n">{{ data.note }}</div>
    </div>
    <div v-if="data.lock" class="lockr"><Icon name="lock" :size="13" />{{ data.lock }}</div>
    <div v-if="data.alert" class="alertc">
      <div class="note warn">
        <Icon :name="data.alert.icon" />
        <div>{{ data.alert.text }}</div>
      </div>
    </div>
    <template v-if="!expanded">
      <div v-for="r in data.rows" :key="r.label" class="kv">
        <span>
          {{ r.label }}<small v-if="r.small">{{ smallText(r.small) }}</small>
        </span>
        <span class="v" :class="r.tone">{{ rowValue(r) }}</span>
      </div>
    </template>
    <template v-else>
      <template v-for="g in data.breakdown.groups" :key="g.label">
        <div class="kv grpk">
          <span>{{ g.label }}</span
          ><span class="v">{{ amount(g.total) }}</span>
        </div>
        <div v-for="l in g.lines" :key="l.label" class="kv sub2">
          <span>
            {{ l.label }}<small v-if="l.small">{{ smallText(l.small) }}</small>
          </span>
          <span class="v" :class="l.tone">{{ amount(l.value) }}</span>
        </div>
      </template>
      <div class="kv net">
        <span>{{ data.breakdown.netLabel }}</span>
        <span class="v" :class="{ est: data.estimated }">{{ vnd(data.breakdown.net) }}</span>
      </div>
    </template>
    <div class="foot">
      <template v-for="(k, i) in data.links" :key="k">
        <span v-if="(i as number) > 0">·</span>
        <button v-if="k === 'calc'" type="button" class="link" @click="expanded = !expanded">
          {{ expanded ? 'Thu gọn' : 'Xem cách tính' }}
        </button>
        <button v-else type="button" class="link" @click="openPayslip">Xem phiếu A4</button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.fig {
  padding: 0 24px 16px;
}
.fig .lab {
  color: var(--muted);
  font-size: 13px;
}
.fig .v {
  font-size: 34px;
  line-height: 40px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fig .n {
  color: var(--muted);
  font-size: 13px;
  line-height: 18px;
  margin-top: 8px;
}
.kv {
  display: flex;
  justify-content: space-between;
  padding: 10px 24px;
  border-top: 1px solid var(--rule);
  font-size: 14px;
}
.kv .v {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.kv .v.mid {
  font-weight: 500;
}
.kv .v.muted {
  color: #a3a3a3;
  font-weight: 400;
}
.kv .v.none {
  color: var(--muted);
  font-weight: 400;
}
.kv small {
  display: block;
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}
.kv.sub2 span:first-child {
  padding-left: 14px;
  color: var(--muted);
}
.kv.grpk {
  background: var(--raised);
  font-weight: 600;
}
.kv.net {
  background: var(--gold-pale);
  font-weight: 600;
  border-top: 1.5px solid var(--text);
}
.kv.net .v {
  font-size: 16px;
}
.kv.net .v.est {
  color: var(--est);
}
.alertc {
  margin: 0 24px 16px;
}
.lockr {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--done-ink);
  font-size: 12px;
  font-weight: 500;
  padding: 0 24px 12px;
}
</style>
