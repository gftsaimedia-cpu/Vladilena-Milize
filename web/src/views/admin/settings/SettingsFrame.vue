<script setup lang="ts">
// Khung chung của mọi trang Cài đặt: tiêu đề + ô tìm, menu con bên trái (nav.sub) và vùng nội dung (.main).
//   <SettingsFrame active="lich"> <template #sub>…câu mô tả dưới tiêu đề…</template> …nội dung… </SettingsFrame>
// Slot #acts thay ô tìm mặc định (vd. nút trên trang Nhật ký).
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getSettingsBadges } from '@/services/admin-settings';
import { SETTINGS_NAV, PATHS } from './nav';
import './settings-extra.css';

defineProps({ active: { type: String, required: true } });

const router = useRouter();
const { data: badges } = useLoad(() => getSettingsBadges());

// Ô tìm: Enter chuyển sang trang Tất cả cài đặt với từ khoá
const q = ref('');
function search() {
  const text = q.value.trim();
  router.push({ path: PATHS.tatCa, query: text ? { q: text } : {} });
}
</script>

<template>
  <div class="title">
    <div>
      <h1>Cài đặt</h1>
      <p><slot name="sub" /></p>
    </div>
    <div class="acts">
      <slot name="acts">
        <label class="search ssearch">
          <Icon name="search" :size="14" />
          <input
            v-model="q"
            type="text"
            placeholder="Tìm cài đặt: tạm ứng, ca đêm, hệ số OT…"
            aria-label="Tìm cài đặt"
            @keydown.enter="search"
          />
        </label>
      </slot>
    </div>
  </div>

  <div class="set">
    <nav class="card sub" aria-label="Mục cài đặt">
      <template v-for="[group, items] in SETTINGS_NAV" :key="group">
        <div class="g">{{ group }}</div>
        <RouterLink
          v-for="[key, icon, label, to] in items"
          :key="key"
          :to="to"
          class="it"
          :class="{ on: key === active }"
        >
          <Icon :name="icon" />
          {{ label }}
          <span v-if="badges && badges[key]" class="cnt2">{{ badges[key] }}</span>
        </RouterLink>
      </template>
    </nav>
    <div class="main"><slot /></div>
  </div>
</template>

<style scoped>
.ssearch input {
  flex: 1;
  color: var(--text);
}
</style>
