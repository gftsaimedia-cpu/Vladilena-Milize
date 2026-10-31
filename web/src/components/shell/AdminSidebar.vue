<script setup>
// Thanh bên Admin (thiết kế 22/10, shell.js): logo, các mục theo nhóm, Cài đặt và tài khoản ở đáy.
import Icon from '@/components/ui/Icon.vue';
import logoDark from '@/assets/img/gft-logo.png';
import logoLight from '@/assets/img/gft-logo-light.png';
import { computed } from 'vue';
import { useSessionStore } from '@/stores/session.js';
import { useUiStore } from '@/stores/ui.js';

defineProps({
  active: { type: String, default: '' },
  me: { type: Object, default: () => ({}) },
  counts: { type: Object, default: () => ({}) }
});
defineEmits(['open-menu']);
const ui = useUiStore();
const session = useSessionStore();

// [khoá meta.nav, biểu tượng, nhãn, đường dẫn (null = sắp có)]
const GROUPS = [
  [
    null,
    [
      ['tong-quan', 'grid', 'Tổng quan', '/admin/tong-quan'],
      ['duyet', 'inbox', 'Yêu cầu', '/admin/yeu-cau']
    ]
  ],
  [
    'Kỳ lương',
    [
      ['cham-cong', 'clock', 'Chấm công & phép', '/admin/cham-cong'],
      ['kpi', 'target', 'Đánh giá KPI', '/admin/kpi'],
      ['luong', 'cash', 'Bảng lương', '/admin/bang-luong']
    ]
  ],
  ['Đội ngũ', [['ho-so', 'file', 'Nhân sự', '/admin/nhan-su']]],
  ['Phân tích', [['tro-ly', 'spark', 'Trợ lý AI', '/admin/tro-ly-ai']]]
];
// Mục Trợ lý AI chỉ có khi công tắc Agents bật
const groups = computed(() =>
  GROUPS.map(([grp, items]) => [grp, items.filter(([key]) => key !== 'tro-ly' || session.agentsEnabled)]).filter(
    ([, items]) => items.length
  )
);
</script>

<template>
  <aside class="side">
    <div class="side-in">
      <div class="brand">
        <img :src="ui.side === 'dark' ? logoLight : logoDark" alt="GFT" />
        <b>AiCB</b>
      </div>
      <div class="scope">Lương, chấm công, phúc lợi · GFT</div>
      <nav class="nav" aria-label="Điều hướng">
        <template v-for="([grp, items], gi) in groups" :key="gi">
          <div v-if="grp" class="grp">{{ grp }}</div>
          <template v-for="[key, icon, label, to] in items" :key="key">
            <RouterLink v-if="to" :to="to" class="item" :class="{ on: key === active }">
              <Icon :name="icon" />
              <span>{{ label }}</span>
              <span v-if="key === 'duyet' && counts.requests" class="cnt">{{ counts.requests }}</span>
            </RouterLink>
            <div v-else class="item" aria-disabled="true">
              <Icon :name="icon" />
              <span>{{ label }}</span>
              <span class="soon">Sắp có</span>
            </div>
          </template>
        </template>
      </nav>
      <div class="side-foot">
        <RouterLink to="/admin/cai-dat" class="item" :class="{ on: active === 'cai-dat' }">
          <Icon name="sliders" />
          <span>Cài đặt</span>
        </RouterLink>
        <button type="button" class="me" aria-haspopup="menu" @click="$emit('open-menu')">
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
