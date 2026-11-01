<script setup lang="ts">
// Khối bên trái: lời chào, ca hôm nay, nút Check-in / Check-out, tuần này, các ngày gần đây.
import Icon from '@/components/ui/Icon.vue';

defineProps({ home: { type: Object as () => any, required: true } });
const emit = defineEmits(['check']);
</script>

<template>
  <section class="hero">
    <h1>{{ home.greeting }}</h1>
    <div class="sub">{{ home.dateLine }}</div>
    <div class="shift">
      <div class="h">
        <span>Ca hôm nay</span>
        <span class="pill" :class="home.shift.status.tone">{{ home.shift.status.text }}</span>
      </div>
      <div class="nm">{{ home.shift.name }}</div>
      <div class="meta">
        <template v-for="(line, i) in home.shift.meta" :key="i">
          <br v-if="(i as number) > 0" />
          <template v-for="(seg, j) in line" :key="j">
            <span v-if="seg.tone" :class="seg.tone">{{ seg.t }}</span>
            <template v-else>{{ seg.t }}</template>
          </template>
        </template>
      </div>
      <button
        type="button"
        class="cta"
        :class="{ gold: home.shift.cta.gold }"
        :disabled="home.shift.cta.disabled"
        @click="emit('check', home.shift.cta.kind)"
      >
        <Icon :name="home.shift.cta.kind === 'out' ? 'logout' : 'login'" />{{ home.shift.cta.label }}
        <small>{{ home.shift.cta.hint }}</small>
      </button>
    </div>
    <div class="week">
      <div v-for="w in home.week" :key="w.d" :class="w.cls">
        <b>{{ w.d }}</b
        >{{ w.label }}
      </div>
    </div>
    <div v-if="home.recent" class="rec">
      <div class="lbl">Gần đây</div>
      <div v-for="r in home.recent" :key="r.label">
        <span>{{ r.label }}</span
        ><span>{{ r.range }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  background: #1c1c1c;
  color: #fff;
  border-radius: var(--r-card);
  padding: 24px;
}
.hero h1 {
  margin: 0;
  font-family: var(--display);
  font-size: 28px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.3px;
}
.hero .sub {
  color: #bdbdbd;
  margin-top: 6px;
  font-size: 14px;
}
.shift {
  background: #2a2a2a;
  border-radius: 16px;
  padding: 16px;
  margin-top: 20px;
}
.shift .h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #bdbdbd;
  font-size: 13px;
}
.shift .on {
  background: var(--gold-light);
  color: #5c4310;
}
.shift .idle {
  background: #3a3a3a;
  color: #e0e0e0;
}
.shift .nm {
  font-size: 20px;
  line-height: 26px;
  font-weight: 600;
  margin-top: 6px;
}
.shift .meta {
  margin-top: 6px;
  color: #e0e0e0;
  font-size: 14px;
  line-height: 20px;
}
.shift .meta span {
  color: #9e9e9e;
}
.shift .meta span.light {
  color: #e0e0e0;
}
.shift .meta span.mid {
  color: #bdbdbd;
}
.cta {
  width: 100%;
  border: 0;
  cursor: pointer;
  margin-top: 16px;
  height: 48px;
  border-radius: 12px;
  background: #fff;
  color: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}
.cta small {
  font-weight: 400;
  color: #616161;
  font-size: 14px;
}
.cta.gold {
  background: var(--gold);
}
.cta.gold small {
  color: #5c4310;
}
.cta:disabled {
  background: #3a3a3a;
  color: #9e9e9e;
  cursor: default;
}
.cta:disabled small {
  color: #9e9e9e;
}
.week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-top: 20px;
}
.week div {
  text-align: center;
  padding: 8px 0;
  border-radius: 10px;
  font-size: 12px;
  color: #9e9e9e;
  line-height: 16px;
}
.week div b {
  display: block;
  color: #fff;
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
.week div.cur {
  background: var(--gold-light);
  color: #5c4310;
}
.week div.cur b {
  color: #212121;
}
.week div.hol b {
  color: var(--gold);
}
.week div.off b {
  color: #757575;
  font-weight: 400;
}
.week div.miss b {
  color: #ff9b9b;
}
.week div.pend b {
  color: var(--gold);
}
.rec {
  margin-top: 20px;
  border-top: 1px solid #333;
}
.rec div {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #2c2c2c;
  font-size: 14px;
}
.rec div span:first-child {
  color: #bdbdbd;
}
.rec div span:last-child {
  font-variant-numeric: tabular-nums;
}
.rec .lbl {
  color: #9e9e9e;
  font-size: 12px;
  padding: 14px 0 4px;
  border: 0;
}
</style>
