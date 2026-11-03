<script setup lang="ts">
// Hôm nay: "Hôm nay tôi chấm công chưa?" và "Tháng này tôi được khoảng bao nhiêu?". Kịch bản theo ?kb= (ca-dem, ctv, quen-checkout, tts).
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { punchExplanationItem } from '@/builders/staff-requests/punch-explanation';
import logoLight from '@/assets/img/gft-logo-light.png';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getHome, punch } from '@/services/staff-phone';
import { dayLong, dm, vnd } from '@/utils/format';
import ExplanationSheet from './components/ExplanationSheet.vue';

const route = useRoute();
const kb = computed(() => String(route.query.kb || 'mac-dinh'));
const { data, reload } = useLoad(
  () => getHome(),
  () => kb.value
);

// Trạng thái ca giả: Check-in / Check-out chỉ đổi trên màn, không gọi máy chủ thật.
const shift = ref(null);
watch(data, d => (shift.value = d ? { ...d.shift } : null), { immediate: true });
const busy = ref(false);
const punchError = ref('');
const explaining = ref(null); // lần bấm đang chờ giải trình: hộp nhập lý do

const dateText = computed(() => `${dayLong(data.value.today)}/${data.value.today.slice(0, 4)}`);
const monthNo = computed(() => Number(data.value.month.slice(5, 7)));
const pill = computed(() => {
  if (shift.value.state === 'working') return { cls: 'on', text: 'Đang trong ca' };
  if (shift.value.state === 'done') return { cls: 'off', text: 'Đã kết thúc ca' };
  return { cls: 'off', text: 'Chưa vào ca' };
});
const cta = computed(() => {
  const s = shift.value;
  if (s.state === 'working') return { cls: '', icon: 'logout', label: 'Check-out', small: `· ${s.now}`, action: 'out' };
  if (s.state === 'done')
    return { cls: 'dis', icon: 'logout', label: 'Đã Check-out', small: `· ${s.checkOut}`, action: null };
  if (s.locked)
    return {
      cls: 'dis',
      icon: 'login',
      label: 'Check-in',
      small: s.lockedAt ? `· mở lúc ${s.lockedAt}` : '',
      action: null
    };
  return { cls: 'gold', icon: 'login', label: 'Check-in', small: `· ${s.now}`, action: 'in' };
});

async function onCta() {
  const action = cta.value.action;
  if (!action || busy.value) return;
  busy.value = true;
  punchError.value = '';
  try {
    await punch(action);
    await reload();
  } catch (e) {
    const item = punchExplanationItem(e, text => punch(action, undefined, text), data.value && data.value.today);
    if (item) explaining.value = item;
    else punchError.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function onExplained() {
  toast.ok('Đã gửi giải trình');
  await reload();
}
</script>

<template>
  <div v-if="data && shift" class="home">
    <header class="hero">
      <div class="top">
        <img :src="logoLight" alt="GFT" />
        <span class="av">{{ data.user.initials }}</span>
      </div>
      <h1>{{ data.greeting }}, {{ data.user.name }}</h1>
      <div class="sub">{{ dateText }} · {{ data.user.roleLine }}</div>
      <div class="shift">
        <div class="h">
          <span>Ca hôm nay</span>
          <span class="pill" :class="pill.cls">{{ pill.text }}</span>
        </div>
        <div class="name">{{ shift.name }}</div>
        <div v-if="shift.checkIn" class="meta">
          Vào {{ shift.checkIn }} <span v-if="shift.checkInNote">· {{ shift.checkInNote }}</span>
          <template v-if="shift.state === 'done'">
            <span>· ra {{ shift.checkOut }}</span></template
          >
          <br />Đã làm {{ shift.worked }}
        </div>
        <div v-for="n in shift.notes" :key="n.text" class="gps">
          <Icon :name="n.icon" :size="16" />
          <span
            ><b v-if="n.lead">{{ n.lead }}</b> {{ n.text }}</span
          >
        </div>
        <div v-if="punchError" class="gps">
          <Icon name="alert" :size="16" />
          <span>{{ punchError }}</span>
        </div>
        <button type="button" class="cta" :class="cta.cls" :disabled="!cta.action" @click="onCta">
          <Icon :name="cta.icon" :size="18" />{{ cta.label }} <small>{{ cta.small }}</small>
        </button>
      </div>
    </header>

    <div v-if="data.alert" class="alert">
      <div class="h"><Icon name="alert" :size="18" />{{ data.alert.title }}</div>
      <p>{{ data.alert.text }}</p>
      <div class="bs">
        <RouterLink class="link" to="/nv/cham-cong">Xem ngày</RouterLink>
      </div>
    </div>

    <section class="sec card">
      <div class="pay">
        <div class="l">
          <span>Thu nhập tháng {{ monthNo }}</span>
        </div>
        <div class="v est-u">{{ vnd(data.pay.amount) }}<span class="unit">₫</span></div>
        <div class="n">
          Tính trên {{ data.pay.days }} ngày công đến {{ dm(data.pay.asOf) }} · chưa phải lương chính thức.<template v-if="data.payslipDate"> Phiếu lương
          chính thức gửi ngày {{ dm(data.payslipDate) }}.</template>
        </div>
      </div>
      <div v-for="f in data.facts" :key="f.label" class="kv">
        <span class="k"
          >{{ f.label }}<small v-if="f.hint">{{ f.hint }}</small></span
        >
        <span class="v" :class="f.tone">{{ f.value }}</span>
      </div>
      <RouterLink class="more" to="/nv/thu-nhap">
        <span>Xem cách tính</span>
        <Icon name="chevr" :size="18" />
      </RouterLink>
    </section>

    <section class="sec">
      <div class="h2">Việc cần làm<template v-if="data.requestDeadline"> trước {{ dm(data.requestDeadline) }}</template></div>
      <div class="card">
        <div v-for="t in data.todo" :key="t.title" class="ok">
          <span class="ico" :class="t.tone"><Icon :name="t.icon" :size="14" :stroke="2.5" /></span>
          <div>
            {{ t.title }}<small>{{ t.hint }}</small>
          </div>
        </div>
      </div>
    </section>
    <ExplanationSheet v-if="explaining" :item="explaining" @close="explaining = null" @saved="onExplained" />
  </div>
</template>

<style scoped>
/* Trang chủ nhân viên của thiết kế không nạp nv.css: các luật dưới đây ghi đè phần lây từ styles/phone.css cho khớp thiết kế. */
.hero {
  background: #1c1c1c;
  color: #fff;
  padding: 16px 16px 20px;
  border-radius: 0 0 24px 24px;
}
.hero .top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hero .top img {
  width: 52px;
}
.hero .av {
  width: 40px;
  height: 40px;
  background: var(--gold-light);
  color: #212121;
  font-size: 14px;
}
.hero h1 {
  font-family: var(--display);
  font-weight: 600;
  font-size: 26px;
  line-height: 30px;
  margin: 14px 0 4px;
  letter-spacing: -0.2px;
}
.hero .sub {
  color: #bdbdbd;
  font-size: 14px;
  line-height: 20px;
}
.shift {
  background: #2a2a2a;
  border-radius: 16px;
  padding: 16px;
  margin-top: 16px;
}
.shift .h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #bdbdbd;
  font-size: 14px;
}
.shift .on {
  background: var(--gold-light);
  color: #212121;
}
.shift .off {
  background: #3a3a3a;
  color: #e0e0e0;
}
.shift .name {
  font-size: 20px;
  line-height: 26px;
  font-weight: 600;
  margin-top: 6px;
}
.shift .meta {
  margin-top: 8px;
  font-size: 15px;
  line-height: 22px;
  color: #eeeeee;
}
.shift .meta span {
  color: #bdbdbd;
}
.gps {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  font-size: 14px;
  line-height: 20px;
  color: #e0e0e0;
}
.gps svg {
  color: var(--gold);
  flex: none;
  margin-top: 2px;
}
.gps b {
  color: #fff;
  font-weight: 600;
}
.cta {
  width: 100%;
  margin-top: 16px;
  height: 52px;
  border: 0;
  border-radius: 12px;
  background: #fff;
  color: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font: inherit;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
}
.cta small {
  font-weight: 400;
  color: #616161;
  font-size: 15px;
}
.cta.gold {
  background: var(--gold);
  color: #212121;
}
.cta.gold small {
  color: #5c4310;
}
.cta.dis {
  background: #3a3a3a;
  color: #9e9e9e;
  cursor: default;
}
.cta.dis small {
  color: #9e9e9e;
}
.alert {
  margin: 16px 16px 0;
  padding: 14px 16px;
  border-radius: 20px;
  background: var(--pend-bg);
  border: 1px solid #f3d3b0;
}
.alert .h {
  display: flex;
  gap: 10px;
  font-weight: 600;
  font-size: 15px;
  line-height: 22px;
  color: #5e3407;
}
.alert .h svg {
  color: var(--pend-ink);
  flex: none;
  margin-top: 3px;
}
.alert p {
  margin: 6px 0 0 28px;
  font-size: 14px;
  line-height: 20px;
  color: #5e3407;
}
.alert .bs {
  display: flex;
  gap: 14px;
  align-items: center;
  margin: 12px 0 0 28px;
}
.alert .bs .off {
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid #e7c39c;
  background: none;
  font: inherit;
  font-size: 14px;
  color: #a0754a;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.alert .bs .off small {
  font-size: 11px;
  border: 1px solid #e7c39c;
  border-radius: 999px;
  padding: 0 6px;
}
.pay {
  padding: 18px 16px 4px;
}
.pay .l {
  color: var(--muted);
  font-size: 14px;
  display: flex;
  justify-content: space-between;
}
.pay .v {
  font-size: 34px;
  line-height: 40px;
  font-weight: 600;
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}
.pay .n {
  color: var(--muted);
  font-size: 14px;
  line-height: 20px;
  margin-top: 6px;
}
.ph-app .pay + .kv {
  margin-top: 12px;
}
.ph-app .kv {
  align-items: stretch;
  min-height: 0;
  padding: 13px 16px;
}
.kv .k {
  color: var(--text);
}
.kv .v.bad {
  color: var(--err-ink);
}
.kv .v.z {
  color: #a3a3a3;
  font-weight: 500;
}
.ph-app .more {
  padding: 14px 16px;
  min-height: 0;
}
.ph-app .h2 {
  display: block;
  margin: 0 0 8px 4px;
}
.ok {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  align-items: flex-start;
  font-size: 15px;
  line-height: 22px;
}
.ok + .ok {
  border-top: 1px solid var(--rule);
}
.ok .ico {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--done-bg);
  color: var(--done-ink);
  display: grid;
  place-items: center;
  flex: none;
  margin-top: -1px;
}
.ok .ico.pend {
  background: var(--pend-bg);
  color: var(--pend-ink);
}
.ok small {
  display: block;
  color: var(--muted);
  font-size: 13px;
  line-height: 18px;
}
</style>
