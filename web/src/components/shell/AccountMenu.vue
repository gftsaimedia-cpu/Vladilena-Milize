<script setup lang="ts">
// Menu tài khoản mở từ tên ở đáy thanh bên (pop-menu-tai-khoan.html).
// Hợp đồng: props { me: { name, roleLabel, initials, username } }; emit('close'), emit('change-password').
// Kiểu thanh bên, màu nền và mật độ bảng ghi qua useUiStore().set({ side, ground, density }); bảng nổi nằm trên nút tên tài khoản.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { logout } from '@/services/session';
import { useUiStore } from '@/stores/ui';

defineProps({ me: { type: Object as () => any, default: () => ({}) } });
const emit = defineEmits(['close', 'change-password']);
const ui = useUiStore();
const router = useRouter();
const root = ref(null);
const bottom = ref(72);

// Bấm lên chính nút tên tài khoản thì để nút tự đóng/mở
const onDown = (e?) => {
  if (root.value && !root.value.contains(e.target) && !e.target.closest('.me')) emit('close');
};
const onKey = (e?) => {
  if (e.key === 'Escape') emit('close');
};
onMounted(() => {
  const anchor = document.querySelector('.side .me');
  if (anchor) bottom.value = Math.round(window.innerHeight - anchor.getBoundingClientRect().top + 8);
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDown);
  document.removeEventListener('keydown', onKey);
});

async function signOut() {
  await logout();
  emit('close');
  router.push('/dang-nhap');
}
</script>

<template>
  <div ref="root" class="pop" role="menu" :style="{ bottom: bottom + 'px' }">
    <div class="me2">
      <span class="av">{{ me.initials }}</span>
      <div>
        <b>{{ me.name }}</b>
        <span>{{ me.roleLabel }} · {{ me.username }}</span>
      </div>
    </div>
    <div class="mr">
      <span>Thanh bên</span>
      <span class="seg">
        <button type="button" :class="{ on: ui.side === 'dark' }" @click="ui.set({ side: 'dark' })">Tối</button>
        <button type="button" :class="{ on: ui.side === 'light' }" @click="ui.set({ side: 'light' })">Sáng</button>
      </span>
    </div>
    <div class="mr">
      <span>Màu nền</span>
      <span class="seg">
        <button type="button" :class="{ on: !ui.ground }" @click="ui.set({ ground: '' })">Xám</button>
        <button type="button" :class="{ on: ui.ground === 'kem' }" @click="ui.set({ ground: 'kem' })">Kem</button>
      </span>
    </div>
    <div class="mr" style="padding-bottom: 12px">
      <span>Mật độ bảng</span>
      <span class="seg">
        <button type="button" :class="{ on: !ui.density }" @click="ui.set({ density: '' })">Thoải mái</button>
        <button type="button" :class="{ on: ui.density === 'gon' }" @click="ui.set({ density: 'gon' })">Gọn</button>
      </span>
    </div>
    <button type="button" class="mi" role="menuitem" @click="emit('change-password')">
      <Icon name="key" />
      Đổi mật khẩu
    </button>
    <button type="button" class="mi dz" role="menuitem" @click="signOut">
      <Icon name="logout" />
      Đăng xuất
    </button>
  </div>
</template>

<style scoped>
.pop {
  position: fixed;
  left: 28px;
  width: 300px;
  z-index: 60;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
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
.me2 span {
  font-size: 12px;
  color: var(--muted);
}
.mr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  font-size: 14px;
}
.mi {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 16px;
  font: inherit;
  font-size: 14px;
  color: inherit;
  text-align: left;
  background: none;
  border: 0;
  border-top: 1px solid var(--rule);
  cursor: pointer;
}
.mi:last-child {
  border-radius: 0 0 16px 16px;
}
.mi svg {
  color: var(--muted);
}
.mi.dz,
.mi.dz svg {
  color: var(--err-ink);
}
/* Ngăn kéo điện thoại không có lề nổi nên bảng lùi về sát mép */
@media (max-width: 767px) {
  .pop {
    left: 12px;
  }
}
</style>
