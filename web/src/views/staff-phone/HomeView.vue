<script setup lang="ts">
// J1 · Hôm nay (spec 4): lời chào, thẻ ca hôm nay có vòng cung và nút Check-out, thẻ "Tuần này", thu nhập, hai yêu cầu mới nhất.
// Dữ liệu là bản giả (services/staff-phone); bấm Check-out gọi checkOut() rồi thay cả dữ liệu màn bằng kết quả trả về (R7).
import { computed, nextTick, ref } from 'vue';
import type { HomeView } from '@/mock/staff-phone';
import { toast } from '@/components/shell/toast';
import { checkIn, checkOut, getHome } from '@/services/staff-phone';
import PhIcon from './components/PhIcon.vue';
import RequestRow from './components/RequestRow.vue';

const data = ref<HomeView | null>(null);
const busy = ref(false);
const hero = ref<HTMLElement | null>(null);
getHome().then(v => (data.value = v));

// Vòng cung: nửa đường tròn bán kính 100, phần đã làm = phút đã làm / phút ca; núm tròn nằm ở cuối phần đã làm.
const HALF = Math.PI * 100;
const arc = computed(() => {
  const d = data.value;
  const f = d ? Math.min(1, d.workedMin / d.shiftMin) : 0;
  const a = Math.PI * (1 - f);
  return {
    dash: `${(f * HALF).toFixed(1)} 400`,
    kx: (120 + 100 * Math.cos(a)).toFixed(1),
    ky: (120 - 100 * Math.sin(a)).toFixed(1)
  };
});

// Check-in (máy chủ thật; dữ liệu giả luôn đã vào ca): thay cả màn bằng kết quả, lỗi (ngoài vùng…) hiện thành thông báo.
async function doCheckIn() {
  if (busy.value) return;
  busy.value = true;
  try {
    data.value = await checkIn();
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = false;
  }
}

async function doCheckOut() {
  if (busy.value) return;
  busy.value = true;
  try {
    data.value = await checkOut();
    // Nút Check-out biến mất (R7): đưa focus về thẻ ca để bàn phím và trình đọc màn hình không rơi xuống <body>.
    await nextTick();
    hero.value?.focus();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="ph home">
    <template v-if="data">
      <header class="hello">
        <span class="avatar" aria-hidden="true">{{ data.initials }}</span>
        <div class="who-col">
          <div class="mut">{{ data.greeting }}</div>
          <div class="name">{{ data.name }}</div>
        </div>
        <span class="mut sm date">{{ data.weekday }}<br />{{ data.date }}</span>
      </header>

      <section ref="hero" class="hero on-dark" aria-label="Ca hôm nay" tabindex="-1">
        <div class="hero-top">
          <span>{{ data.shiftLabel }}</span>
          <span class="live" role="status"
            ><i v-if="data.checkIn && !data.checkOut" />{{
              !data.checkIn ? 'Chưa check-in' : data.checkOut ? 'Đã check-out' : 'Đang trong ca'
            }}</span
          >
        </div>
        <div class="gauge">
          <svg aria-hidden="true" width="240" height="132" viewBox="0 0 240 132" focusable="false">
            <path d="M20 120 A100 100 0 0 1 220 120" fill="none" stroke="#2a2a2a" stroke-width="14" stroke-linecap="round" />
            <path
              d="M20 120 A100 100 0 0 1 220 120"
              fill="none"
              stroke="#e8c372"
              stroke-width="14"
              stroke-linecap="round"
              :stroke-dasharray="arc.dash"
            />
            <circle :cx="arc.kx" :cy="arc.ky" r="9" fill="#e8c372" stroke="#1c1c1c" stroke-width="4" />
          </svg>
          <div class="gauge-in">
            <div class="worked">{{ data.worked }}</div>
            <div v-if="data.checkIn" class="since">đã làm · vào {{ data.checkIn }}{{ data.checkOut ? ` · ra ${data.checkOut}` : '' }}</div>
            <div v-else class="since">chưa vào ca</div>
          </div>
        </div>
        <div class="ends"><span>{{ data.shiftStart }}</span><span>{{ data.shiftEnd }}</span></div>
        <template v-if="!data.checkIn">
          <button type="button" class="cta" :aria-label="`Check-in lúc ${data.now}`" :disabled="busy" @click="doCheckIn">
            <PhIcon name="clock" :size="20" :stroke="2" />Check-in<small>· {{ data.now }}</small>
          </button>
          <div class="loc"><PhIcon name="pin" :size="16" />{{ data.location }}</div>
        </template>
        <template v-else-if="!data.checkOut">
          <button type="button" class="cta" :aria-label="`Check-out lúc ${data.now}`" :disabled="busy" @click="doCheckOut">
            <PhIcon name="out" :size="20" :stroke="2" />Check-out<small>· {{ data.now }}</small>
          </button>
          <div class="loc"><PhIcon name="pin" :size="16" />{{ data.location }}</div>
        </template>
      </section>

      <section class="card week" aria-label="Tuần này">
        <div class="sh"><h2>Tuần này</h2><span class="mut">{{ data.week.range }}</span></div>
        <div class="days">
          <div v-for="c in data.week.cells" :key="c.date">
            <div class="dw">{{ c.dow }}</div>
            <RouterLink
              v-if="c.open"
              :to="`/nv/cham-cong?ngay=${c.date}`"
              class="dn"
              :class="[c.kind, { today: c.today }]"
              :aria-label="c.label"
              >{{ c.day }}</RouterLink
            >
            <span v-else class="dn" :class="[c.kind, { today: c.today }]" role="img" :aria-label="c.label">{{
              c.day
            }}</span>
          </div>
        </div>
        <RouterLink v-if="data.alert" :to="`/nv/cham-cong?ngay=${data.alert.date}`" class="att">
          <i class="dot todo" /><span class="t">{{ data.alert.text }}</span>
          <PhIcon name="right" :size="18" :stroke="2" />
        </RouterLink>
      </section>

      <RouterLink to="/nv/thu-nhap" class="card pay">
        <div class="pay-text">
          <div class="mut">{{ data.income.label }}</div>
          <div class="amt">{{ data.income.net }} <span>₫</span></div>
        </div>
        <PhIcon name="right" :size="20" :stroke="2" />
      </RouterLink>

      <section class="reqs">
        <div class="sh">
          <h2>Yêu cầu của tôi</h2>
          <RouterLink to="/nv/yeu-cau" class="lk">Xem tất cả</RouterLink>
        </div>
        <div class="card ls">
          <RequestRow v-for="r in data.requests" :key="r.id" :row="r" />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.hello {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar {
  width: 48px;
  height: 48px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50px;
  background: var(--gold-light);
  font-weight: 600;
}
.who-col {
  flex: 1 1 auto;
  min-width: 0;
}
.name {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.date {
  text-align: right;
}

/* Thẻ ca hôm nay: nền đen, chữ trắng */
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px;
  border-radius: 24px;
  background: var(--surface-dark);
  color: #ffffff;
}
.hero-top {
  align-self: stretch;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #9e9e9e;
}
.live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #ffffff;
  font-size: 13px;
}
.live i {
  width: 8px;
  height: 8px;
  border-radius: 50px;
  background: var(--gold);
}
.gauge {
  position: relative;
  width: 240px;
  height: 132px;
  margin-top: 8px;
}
.gauge-in {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 4px;
  text-align: center;
}
.worked {
  font-size: 32px;
  line-height: 40px;
  font-weight: 600;
}
.since {
  color: #9e9e9e;
}
.ends {
  width: 240px;
  display: flex;
  justify-content: space-between;
  color: #9e9e9e;
  font-size: 12px;
  line-height: 16px;
}
.cta {
  align-self: stretch;
  height: 52px;
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  background: var(--gold);
  color: var(--text);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.cta small {
  font-size: 14px;
  font-weight: 400;
}
.loc {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  color: #9e9e9e;
  font-size: 13px;
}

/* Thẻ "Tuần này" */
.week {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}
.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  justify-items: center;
  gap: 6px;
}
.days > div {
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* Ô ngày co theo cột (tối đa 40px, luôn vuông) để bảy ô vừa thẻ ở mọi bề ngang từ 320px */
.days .dn {
  width: 100%;
  max-width: 40px;
  height: auto;
  aspect-ratio: 1;
}
.dw {
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
  text-align: center;
}
.att {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--page);
  color: var(--text);
  text-decoration: none;
}
.att .t {
  flex: 1 1 auto;
  min-width: 0;
}

/* Thẻ thu nhập */
.pay {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 16px 20px;
  color: inherit;
  text-decoration: none;
}
.pay-text {
  flex: 1 1 auto;
}
.amt {
  margin-top: 2px;
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
}
.amt span {
  font-size: 16px;
  color: var(--muted);
  font-weight: 500;
}

.reqs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reqs .sh {
  padding: 0 4px;
}
</style>
