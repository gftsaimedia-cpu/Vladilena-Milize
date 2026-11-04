<script setup lang="ts">
// Ngăn kéo hồ sơ nhân sự (bảng I2): nổi bên phải, 480px, mở bằng ?nv=<id>. Đầu dựng ngay, thân và chân chờ hồ sơ.
// Bẫy focus, Escape và trả focus nhờ registerOverlayFocus; việc đổi URL là của màn (emit close, prev, next).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { employeePath } from '../attendance/links';
import Icon from '@/components/ui/Icon.vue';
import { lockScroll, registerOverlayFocus, unlockScroll } from '@/components/ui/overlay-lock';
import { useLoad } from '@/composables/useLoad';
import { getStaffProfile } from '@/services/admin-hr';
import StatusPill from './parts/StatusPill.vue';

const props = defineProps<{ id: string; hasPrev: boolean; hasNext: boolean }>();
const emit = defineEmits<{ close: []; prev: []; next: [] }>();

const route = useRoute();
const { data } = useLoad(() => getStaffProfile(props.id), () => props.id);
// Đang đổi người thì thân tạm trống, không hiện hồ sơ của người trước dưới địa chỉ của người sau.
const profile = computed(() => (data.value && data.value.id === props.id ? data.value : null));

const attendanceTo = computed(() => {
  const thang = route.query.thang;
  return {
    path: employeePath(props.id),
    query: typeof thang === 'string' && thang ? { thang } : {}
  };
});

const aside = ref<HTMLElement | null>(null);
const prevBtn = ref<HTMLButtonElement | null>(null);
const nextBtn = ref<HTMLButtonElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);
let unregister = () => {};

onMounted(() => {
  lockScroll();
  if (aside.value) unregister = registerOverlayFocus(aside.value, () => emit('close'), () => true);
});
onBeforeUnmount(() => {
  unregister();
  unlockScroll();
});

// Nút đang giữ focus bị tắt (tới đầu hay cuối danh sách) thì focus sang nút còn lại, không rơi về body.
watch([() => props.hasPrev, () => props.hasNext], async () => {
  const held = document.activeElement;
  await nextTick();
  if (held === prevBtn.value && !props.hasPrev) (props.hasNext ? nextBtn : closeBtn).value?.focus();
  else if (held === nextBtn.value && !props.hasNext) (props.hasPrev ? prevBtn : closeBtn).value?.focus();
});
</script>

<template>
  <Teleport to="body">
    <div class="pf-root">
      <div class="pf-scrim" @click="emit('close')" />
      <aside
        ref="aside"
        class="pf"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="profile ? `Hồ sơ của ${profile.name}` : 'Hồ sơ nhân sự'"
      >
        <div class="pf-h">
          <h2>Hồ sơ nhân sự</h2>
          <button ref="prevBtn" type="button" class="ib" aria-label="Người trước" :disabled="!hasPrev" @click="emit('prev')">
            <Icon name="chevl" :size="18" />
          </button>
          <button ref="nextBtn" type="button" class="ib" aria-label="Người sau" :disabled="!hasNext" @click="emit('next')">
            <Icon name="chevr" :size="18" />
          </button>
          <button ref="closeBtn" type="button" class="ib mu" aria-label="Đóng" @click="emit('close')">
            <Icon name="x" :size="18" />
          </button>
        </div>

        <div v-if="profile" class="pf-b">
          <div class="idr">
            <span class="av">{{ profile.initials }}</span>
            <div class="who2">
              <div class="nm">{{ profile.name }}</div>
              <div class="sb">{{ profile.code }} · {{ profile.title }}</div>
            </div>
            <StatusPill :status="profile.status" :label="profile.statusLabel" />
          </div>

          <div v-if="profile.note" class="nt">
            <i aria-hidden="true" />
            <div>
              <div class="nt-t">{{ profile.note.title }}</div>
              <div class="nt-s">{{ profile.note.text }}</div>
            </div>
          </div>

          <section v-for="g in profile.groups" :key="g.title" class="pg">
            <h3>{{ g.title }}</h3>
            <dl>
              <div v-for="f in g.facts" :key="f.label" class="fr">
                <dt>{{ f.label }}</dt>
                <dd :class="{ none: f.value === '—' }">{{ f.value }}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div v-if="profile" class="pf-f">
          <RouterLink class="fl" :to="attendanceTo">Xem chấm công</RouterLink>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.pf-root {
  position: fixed;
  inset: 0;
  z-index: 70;
}
.pf-scrim {
  position: absolute;
  inset: 0;
  background: rgba(28, 28, 28, 0.32);
}
.pf {
  position: absolute;
  top: 16px;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 480px;
  max-width: calc(100% - 32px);
  border-radius: 24px;
  background: var(--surface);
  box-shadow: none;
  color: var(--text);
}
.pf:focus {
  outline: none;
}
.pf :focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.pf-h {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 20px 16px 0 24px;
}
.pf-h h2 {
  flex: 1;
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.ib {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text);
  cursor: pointer;
}
.ib.mu {
  color: var(--muted);
}
.ib:hover:not(:disabled) {
  background: var(--raised);
}
.ib:disabled {
  color: var(--control);
  cursor: default;
}
.pf-b {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  padding: 16px 24px 24px;
  overflow-y: auto;
}
.idr {
  display: flex;
  align-items: center;
  gap: 12px;
}
.av {
  display: grid;
  flex: none;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--gold-light);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
}
.who2 {
  flex: 1;
  min-width: 0;
}
.nm {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.sb {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.nt {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--ground);
}
.nt i {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--status-done);
}
.nt-t {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
}
.nt-s {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pg h3 {
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--muted);
}
dl {
  margin: 0;
}
.fr {
  display: grid;
  grid-template-columns: 148px 1fr;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  line-height: 20px;
}
dt {
  color: var(--muted);
}
dd {
  min-width: 0;
  margin: 0;
  font-weight: 500;
  overflow-wrap: anywhere;
}
dd.none {
  color: var(--muted);
}
.pf-f {
  padding: 12px 24px 16px;
  border-top: 1px solid var(--border);
}
.fl {
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  border: 1px solid var(--control);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}
.fl:hover {
  background: var(--raised);
}
@media (max-width: 767px) {
  .pf {
    left: 16px;
    width: auto;
    max-width: none;
  }
}
</style>
