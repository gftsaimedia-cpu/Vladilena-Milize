<script setup lang="ts">
// Thẻ ca hôm nay (J1 mục 4.2, K1 cột 1): vòng cung giờ làm, nút Check-out (R7). Dùng ở HomeView (điện thoại) và TodayColumn (máy tính).
// Tự gọi checkOut(), phát kết quả cho màn cha thay dữ liệu, rồi đưa focus về chính thẻ (nút Check-out biến mất).
//   <ShiftCard :home="data" @checked-out="v => (data = v)" />
import { computed, nextTick, ref } from 'vue';
import type { HomeView } from '@/mock/staff-phone';
import { checkOut } from '@/services/staff-phone';
import PhIcon from './PhIcon.vue';

const props = defineProps<{ home: HomeView }>();
const emit = defineEmits<{ checkedOut: [view: HomeView] }>();

const busy = ref(false);
const hero = ref<HTMLElement | null>(null);

// Vòng cung: nửa đường tròn bán kính 100, phần đã làm = phút đã làm / phút ca; núm tròn nằm ở cuối phần đã làm.
const HALF = Math.PI * 100;
const arc = computed(() => {
  const d = props.home;
  const f = Math.min(1, d.workedMin / d.shiftMin);
  const a = Math.PI * (1 - f);
  return {
    dash: `${(f * HALF).toFixed(1)} 400`,
    kx: (120 + 100 * Math.cos(a)).toFixed(1),
    ky: (120 - 100 * Math.sin(a)).toFixed(1)
  };
});

async function doCheckOut() {
  if (busy.value) return;
  busy.value = true;
  try {
    emit('checkedOut', await checkOut());
    // Nút Check-out biến mất (R7): đưa focus về thẻ ca để bàn phím và trình đọc màn hình không rơi xuống <body>.
    await nextTick();
    hero.value?.focus();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section ref="hero" class="hero on-dark" aria-label="Ca hôm nay" tabindex="-1">
    <div class="hero-top">
      <span>{{ home.shiftLabel }}</span>
      <span class="live" role="status"><i v-if="!home.checkOut" />{{ home.checkOut ? 'Đã check-out' : 'Đang trong ca' }}</span>
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
        <div class="worked">{{ home.worked }}</div>
        <div class="since">đã làm · vào {{ home.checkIn }}{{ home.checkOut ? ` · ra ${home.checkOut}` : '' }}</div>
      </div>
    </div>
    <div class="ends"><span>{{ home.shiftStart }}</span><span>{{ home.shiftEnd }}</span></div>
    <template v-if="!home.checkOut">
      <button type="button" class="cta" :aria-label="`Check-out lúc ${home.now}`" :disabled="busy" @click="doCheckOut">
        <PhIcon name="out" :size="20" :stroke="2" />Check-out<small>· {{ home.now }}</small>
      </button>
      <div class="loc"><PhIcon name="pin" :size="16" />{{ home.location }}</div>
    </template>
  </section>
</template>

<style scoped>
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
</style>
