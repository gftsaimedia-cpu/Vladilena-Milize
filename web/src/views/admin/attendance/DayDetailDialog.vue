<script setup lang="ts">
// Hộp chi tiết một ngày của một người trên dữ liệu giả: trạng thái, giờ vào/ra và việc chờ xử lý của ngày đó (nếu có).
// Người hoặc ngày không có dữ liệu thì đóng ngay, không hiện hộp rỗng. Xử lý xong báo bằng toast rồi đóng.
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import InboxDetail from '@/components/shell/InboxDetail.vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import { useLoad } from '@/composables/useLoad';
import type { InboxItem } from '@/mock/inbox';
import { getDayDetail } from '@/services/admin-attendance';
import { useShellStore } from '@/stores/shell';
import { employeePath } from './links';

const props = defineProps<{ personId: string; date: string }>(); // date: 'YYYY-MM-DD'
const emit = defineEmits<{ close: [] }>();

const route = useRoute();
const shell = useShellStore();
const { data, loading } = useLoad(
  () => getDayDetail(props.personId, props.date),
  () => `${props.personId}|${props.date}|${shell.version}`
);

let firstLoad = true;
watch(loading, busy => {
  if (busy || !firstLoad) return;
  firstLoad = false;
  if (!data.value) emit('close');
});

// Thẻ việc giữ lại bản đã thấy: decide() tăng version làm dữ liệu tải lại và việc biến mất trước khi thẻ kịp báo 'decided';
// thẻ bị gỡ giữa chừng thì emit bị bỏ và toast không hiện.
const item = ref<InboxItem | null>(null);
watch(
  data,
  value => {
    if (value?.item) item.value = value.item;
  },
  { immediate: true }
);

const hasTimes = computed(() => !!data.value && (data.value.cell.in !== null || data.value.cell.out !== null));
const outText = computed(() => {
  const cell = data.value?.cell;
  if (!cell) return '';
  if (cell.out) return cell.out;
  return cell.live ? 'Đang làm' : 'Chưa có';
});
const showProfile = computed(() => route.path !== employeePath(props.personId));
const profileTo = computed(() => ({
  path: employeePath(props.personId),
  query: route.query.thang ? { thang: route.query.thang } : {}
}));

function onDecided({ ok, text }: { id: string; ok: boolean; text: string }) {
  if (ok) toast.ok(text);
  else toast.error(text);
  emit('close');
}
</script>

<template>
  <AppModal v-if="data" :title="data.title" :sub="data.sub" :width="520" @close="emit('close')">
    <dl class="dd">
      <div class="dd-r">
        <dt>Trạng thái</dt>
        <dd>{{ data.cell.label }}</dd>
      </div>
      <template v-if="hasTimes">
        <div class="dd-r">
          <dt>Giờ vào</dt>
          <dd>{{ data.cell.in ?? 'Chưa có' }}</dd>
        </div>
        <div class="dd-r">
          <dt>Giờ ra</dt>
          <dd>{{ outText }}</dd>
        </div>
      </template>
      <div v-else-if="data.cell.text" class="dd-r">
        <dt>Ghi nhận</dt>
        <dd>{{ data.cell.text }}</dd>
      </div>
    </dl>
    <InboxDetail
      v-if="item"
      class="dd-item"
      :item="item"
      :show-person="false"
      :profile-link="false"
      @decided="onDecided"
      @close="emit('close')"
    />
    <template v-if="showProfile" #footer>
      <RouterLink :to="profileTo" class="link">Mở hồ sơ chấm công</RouterLink>
    </template>
  </AppModal>
</template>

<style scoped>
.dd {
  margin: 0;
}
.dd-r {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-top: 1px solid var(--rule);
  font-size: 14px;
  line-height: 20px;
}
.dd-r:first-child {
  border-top: 0;
  padding-top: 0;
}
.dd-r dt {
  color: var(--muted);
}
.dd-r dd {
  margin: 0;
  font-weight: 500;
  text-align: right;
}
.dd-item {
  margin-top: 16px;
  padding-top: 20px;
  border-top: 1px solid var(--rule);
}
/* Hộp đã có nút Đóng ở đầu; nút Đóng chi tiết của thẻ việc chỉ dành cho ngăn kéo chuông. */
.dd-item :deep(.x) {
  display: none;
}
</style>
