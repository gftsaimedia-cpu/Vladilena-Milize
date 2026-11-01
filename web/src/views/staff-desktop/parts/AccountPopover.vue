<script setup lang="ts">
// Menu tài khoản mở từ góc phải thanh trên (nvpc-linh-menu): hồ sơ, đổi mật khẩu, đăng xuất.
import { onBeforeUnmount, onMounted } from 'vue';
import Icon from '@/components/ui/Icon.vue';

defineProps({ me: { type: Object as () => any, required: true } });
const emit = defineEmits(['close', 'profile', 'password', 'logout']);

const onKey = (e?) => {
  if (e.key === 'Escape') emit('close');
};
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="catch" @click="emit('close')" />
  <div class="pop" role="menu">
    <div class="me2">
      <span class="av">{{ me.initials }}</span>
      <div>
        <b>{{ me.name }}</b
        ><span>{{ me.username }} · {{ me.roleLine }}</span>
      </div>
    </div>
    <button type="button" class="mi first" role="menuitem" @click="emit('profile')">
      <Icon name="user" />Hồ sơ của tôi
    </button>
    <button type="button" class="mi" role="menuitem" @click="emit('password')"><Icon name="key" />Đổi mật khẩu</button>
    <button type="button" class="mi dz" role="menuitem" @click="emit('logout')"><Icon name="logout" />Đăng xuất</button>
  </div>
</template>

<style scoped>
.catch {
  position: fixed;
  inset: 0;
  z-index: 40;
}
.pop {
  position: absolute;
  z-index: 41;
  top: 68px;
  right: 32px;
  width: 280px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}
.me2 {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--rule);
}
.me2 .av {
  background: var(--gold-light);
  color: #212121;
}
.me2 b {
  display: block;
  font-size: 14px;
}
.me2 span:not(.av) {
  font-size: 12px;
  color: var(--muted);
}
.mi {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font-size: 14px;
  border: 0;
  border-top: 1px solid var(--rule);
  background: none;
  text-align: left;
  cursor: pointer;
}
.mi svg {
  color: var(--muted);
}
.mi.dz svg {
  color: var(--err-ink);
}
.mi.first {
  border-top: 0;
}
.mi.dz {
  color: var(--err-ink);
}
</style>
