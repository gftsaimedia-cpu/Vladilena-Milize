<script setup lang="ts">
// Thẻ ca hôm nay (J1 mục 4.2, K1 cột 1): vòng cung giờ làm, nút Check-in / Check-out (R7). Dùng ở HomeView (điện thoại) và TodayColumn (máy tính).
// Tự gọi checkIn() / checkOut(), phát kết quả cho màn cha thay dữ liệu. Check-out xong đưa focus về chính thẻ (nút biến mất).
// Check-in chỉ hiện với máy chủ thật (dữ liệu giả luôn đã vào ca). Check-in hay Check-out bị từ chối (ngoài vùng, ngày đã khoá,
// ngày nghỉ, mất mạng…) hiện câu lỗi thành thông báo. Đã chấm mà chưa tải lại được màn thì báo "Đã check-in" / "Đã check-out"
// và phát null: màn cha tự tải lại. Dòng vị trí chỉ có khi máy chủ gửi kết quả vị trí (home.location).
// Có vùng chấm công (home.zone) và còn nút chấm công thì theo dõi vị trí máy (watchLocation) cho tới khi thẻ đóng hoặc nút biến mất:
// vào vùng thì nút mở khoá, không cần tải lại. Ca đã xong (không còn nút) thì không xin vị trí. Ngoài vùng, không lấy được vị trí
// (kèm nút "Thử lại"), hay (Check-in) ngày không phải ngày làm thì nút đang hiện bị khoá và dòng lý do thay dòng vị trí
// (checkInLock). Check-out không bị chặn vì ngày nghỉ.
//   <ShiftCard :home="data" @checked-in="onPunch" @checked-out="onPunch" />   onPunch(v) { v ? (data = v) : reload() }
import { computed, nextTick, ref, useId, watch } from 'vue';
import { checkInLock, type LatLng } from '@/builders/api/check-in';
import { toast } from '@/components/shell/toast';
import type { HomeView } from '@/mock/staff-phone';
import { checkIn, checkOut, watchLocation } from '@/services/staff-phone';
import PhIcon from './PhIcon.vue';

const props = defineProps<{ home: HomeView }>();
const emit = defineEmits<{ checkedIn: [view: HomeView | null]; checkedOut: [view: HomeView | null] }>();

const busy = ref(false);
const hero = ref<HTMLElement | null>(null);
const reasonId = useId();

// undefined: đang lấy vị trí; null: không lấy được. Theo dõi chạy khi có vùng và còn nút; bấm "Thử lại" (attempt) thì theo dõi lại.
const position = ref<LatLng | null | undefined>(undefined);
const tracking = computed(() => !!props.home.zone && !props.home.checkOut);
const attempt = ref(0);
watch(
  [tracking, attempt],
  ([on], _old, onCleanup) => {
    position.value = undefined;
    if (!on) return;
    onCleanup(watchLocation(at => (position.value = at)));
  },
  { immediate: true }
);

// Khoá nút đang hiện: Check-in khi chưa vào ca, Check-out khi đang trong ca.
const lock = computed(() =>
  checkInLock({
    kind: props.home.checkIn ? 'out' : 'in',
    workday: props.home.workday,
    zone: props.home.zone,
    position: position.value
  })
);
const lockReason = computed(() => (lock.value.locked ? lock.value.reason : null));
// "Thử lại" chỉ khi lý do khoá là không lấy được vị trí (ngày không phải ngày làm của Check-in được xét trước vị trí).
const canRetry = computed(() => !!props.home.zone && position.value === null && (!!props.home.checkIn || props.home.workday));

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

async function doCheckIn() {
  if (busy.value || lock.value.locked) return;
  busy.value = true;
  try {
    const view = await checkIn();
    if (!view) toast.ok('Đã check-in');
    emit('checkedIn', view);
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = false;
  }
}

async function doCheckOut() {
  if (busy.value || lock.value.locked) return;
  busy.value = true;
  try {
    const view = await checkOut();
    if (!view) toast.ok('Đã check-out');
    emit('checkedOut', view);
    // Nút Check-out biến mất (R7): đưa focus về thẻ ca để bàn phím và trình đọc màn hình không rơi xuống <body>.
    await nextTick();
    hero.value?.focus();
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section ref="hero" class="hero on-dark" aria-label="Ca hôm nay" tabindex="-1">
    <div class="hero-top">
      <span>{{ home.shiftLabel }}</span>
      <span class="live" role="status"
        ><i v-if="home.checkIn && !home.checkOut" />{{
          !home.checkIn ? 'Chưa check-in' : home.checkOut ? 'Đã check-out' : 'Đang trong ca'
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
        <div class="worked">{{ home.worked }}</div>
        <div v-if="home.checkIn" class="since">đã làm · vào {{ home.checkIn }}{{ home.checkOut ? ` · ra ${home.checkOut}` : '' }}</div>
        <div v-else class="since">chưa vào ca</div>
      </div>
    </div>
    <div class="ends"><span>{{ home.shiftStart }}</span><span>{{ home.shiftEnd }}</span></div>
    <template v-if="!home.checkIn">
      <button
        type="button"
        class="cta"
        :aria-label="`Check-in lúc ${home.now}`"
        :disabled="busy || lock.locked"
        :aria-describedby="lockReason ? reasonId : undefined"
        @click="doCheckIn"
      >
        <PhIcon name="clock" :size="20" :stroke="2" />Check-in<small>· {{ home.now }}</small>
      </button>
      <div v-if="lockReason" class="loc">
        <PhIcon name="pin" :size="16" /><span :id="reasonId">{{ lockReason }}</span>
        <button v-if="canRetry" type="button" class="retry" @click="attempt++">Thử lại</button>
      </div>
      <div v-else-if="home.location" class="loc"><PhIcon name="pin" :size="16" />{{ home.location }}</div>
    </template>
    <template v-else-if="!home.checkOut">
      <button
        type="button"
        class="cta"
        :aria-label="`Check-out lúc ${home.now}`"
        :disabled="busy || lock.locked"
        :aria-describedby="lockReason ? reasonId : undefined"
        @click="doCheckOut"
      >
        <PhIcon name="out" :size="20" :stroke="2" />Check-out<small>· {{ home.now }}</small>
      </button>
      <div v-if="lockReason" class="loc">
        <PhIcon name="pin" :size="16" /><span :id="reasonId">{{ lockReason }}</span>
        <button v-if="canRetry" type="button" class="retry" @click="attempt++">Thử lại</button>
      </div>
      <div v-else-if="home.location" class="loc"><PhIcon name="pin" :size="16" />{{ home.location }}</div>
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
.cta:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cta small {
  font-size: 14px;
  font-weight: 400;
}
.retry {
  border: 0;
  background: none;
  padding: 0;
  color: var(--gold);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
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
