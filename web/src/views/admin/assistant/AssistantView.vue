<script setup>
// Trợ lý AI (tro-ly-ai, ai-nhieu-phep): danh sách cảnh báo AI và "Hỏi nhanh".
// ?kb=nhieu-phep chọn câu hỏi "Ai còn nhiều phép?" (mặc định "Còn thiếu gì trước khi chốt công?").
// ?hop=ly-do mở hộp lý do AI của cảnh báo đầu tiên.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLoad } from '@/composables/useLoad.js';
import { getAssistantAnswer, getWarnings } from '@/services/admin-main.js';
import { useSessionStore } from '@/stores/session.js';
import AiReasonDialog from './AiReasonDialog.vue';
import AskCard from './AskCard.vue';
import WarningsCard from './WarningsCard.vue';

const route = useRoute();
const router = useRouter();
// Công tắc Agents tắt thì không có Trợ lý AI: về Tổng quan
if (!useSessionStore().agentsEnabled) router.replace('/admin/tong-quan');

const status = ref('open');
const rule = ref('');
const page = ref(1);
const key = computed(() => String(route.query.kb || 'thieu-gi'));

const { data: warnings, reload } = useLoad(
  () => getWarnings({ status: status.value, rule: rule.value, page: page.value }),
  () => [status.value, rule.value, page.value]
);
const { data: ask } = useLoad(() => getAssistantAnswer(key.value), key);

// Đổi bộ lọc thì về trang 1
watch([status, rule], () => (page.value = 1));
const selectQuestion = k => router.replace({ query: { ...route.query, kb: k === 'thieu-gi' ? undefined : k } });

const reasonId = ref('');
let openedHop = '';
watch(
  () => [route.query.hop, warnings.value],
  ([hop, d]) => {
    if (!hop) openedHop = '';
    if (!d || !hop || hop === openedHop) return;
    openedHop = hop;
    if (hop === 'ly-do') reasonId.value = d.items[0]?.id || '';
  },
  { immediate: true }
);
const time = computed(() => warnings.value?.meta.computedAt.slice(11, 16) || '');
</script>

<template>
  <div v-if="warnings">
    <div class="title">
      <div>
        <h1>Trợ lý AI</h1>
        <p>
          <b>{{ warnings.counts.open }} cảnh báo</b> chưa xử lý · AI kiểm tra {{ warnings.meta.rulesChecked }} quy tắc
          trên {{ warnings.meta.people }} nhân sự lúc {{ time }} hôm nay
        </p>
      </div>
    </div>

    <div class="grid2" style="align-items: start">
      <WarningsCard
        v-model:status="status"
        v-model:rule="rule"
        :data="warnings"
        @update:page="page = $event"
        @reason="reasonId = $event"
      />
      <AskCard v-if="ask" :data="ask" @select="selectQuestion" />
    </div>

    <AiReasonDialog v-if="reasonId" :id="reasonId" @close="reasonId = ''" @skipped="reload" />
  </div>
</template>
