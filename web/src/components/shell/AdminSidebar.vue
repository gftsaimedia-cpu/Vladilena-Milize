<script setup lang="ts">
// Thanh bên Admin (thiết kế 22/10, shell.js): logo, các mục theo nhóm, Cài đặt và tài khoản ở đáy.
import Icon from '@/components/ui/Icon.vue';
import logoDark from '@/assets/img/gft-logo.png';
import logoLight from '@/assets/img/gft-logo-light.png';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { ADMIN_SIDEBAR_GROUPS } from '@/views/admin/settings/nav';

defineProps({
  id: { type: String, default: 'admin-navigation' },
  mobileOpen: { type: Boolean, default: false },
  mobileInert: { type: Boolean, default: false },
  active: { type: String, default: '' },
  me: { type: Object as () => any, default: () => ({}) }
});
const emit = defineEmits(['open-menu', 'navigate']);
const ui = useUiStore();
const route = useRoute();
const linkTarget = (path: string) => ({
  path,
  query: route.query.thang ? { thang: route.query.thang } : {}
});

// [khoá meta.nav, biểu tượng, nhãn, đường dẫn (null = sắp có)]
const groups = computed(() => ADMIN_SIDEBAR_GROUPS);
</script>

<template>
  <aside :id="id" class="side" :class="{ 'mobile-open': mobileOpen }" :inert="mobileInert">
    <div class="side-in">
      <div class="brand">
        <img :src="ui.side === 'dark' ? logoLight : logoDark" alt="GFT" />
        <b>AiCB</b>
      </div>
      <nav class="nav" aria-label="Điều hướng">
        <template v-for="([grp, items], gi) in groups" :key="gi">
          <div v-if="grp" class="grp">{{ grp }}</div>
          <template v-for="[key, icon, label, to] in items" :key="key">
            <RouterLink
              v-if="to"
              :to="linkTarget(to)"
              class="item"
              :class="{ on: key === active }"
              :aria-current="key === active ? 'page' : undefined"
              :tabindex="mobileInert ? -1 : undefined"
              @click="emit('navigate')"
            >
              <Icon :name="icon" :size="20" />
              <span>{{ label }}</span>
            </RouterLink>
            <div v-else class="item" aria-disabled="true">
              <Icon :name="icon" :size="20" />
              <span>{{ label }}</span>
              <span class="soon">Sắp có</span>
            </div>
          </template>
        </template>
      </nav>
      <div class="side-foot">
        <RouterLink
          :to="linkTarget('/admin/cai-dat')"
          class="item"
          :class="{ on: active === 'cai-dat' }"
          :aria-current="active === 'cai-dat' ? 'page' : undefined"
          :tabindex="mobileInert ? -1 : undefined"
          @click="emit('navigate')"
        >
          <Icon name="sliders" :size="20" />
          <span>Cài đặt</span>
        </RouterLink>
        <button
          type="button"
          class="me"
          aria-haspopup="menu"
          :tabindex="mobileInert ? -1 : undefined"
          @click="
            emit('open-menu');
            emit('navigate');
          "
        >
          <span class="av" style="background: var(--gold-light); color: #212121">{{ me.initials }}</span>
          <div>
            <b>{{ me.name }}</b>
            <span>{{ me.roleLabel }}</span>
          </div>
        </button>
      </div>
    </div>
  </aside>
</template>
