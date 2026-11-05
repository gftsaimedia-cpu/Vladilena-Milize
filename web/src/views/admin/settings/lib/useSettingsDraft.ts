// Bản nháp của một nhóm cài đặt theo tháng: tải nhóm ở tháng đang chọn, giữ số đã gõ khi đổi tháng, kiểm tra, dựng câu xác nhận và lưu.
// Ô chưa đụng tới đi theo giá trị hiệu lực ở tháng đang chọn; ô đã gõ giữ số đã gõ.
// backToMinMonth: lưu xong hoặc Huỷ thì về tháng đang mở (minMonth) và tải lại (Tất cả cài đặt, Ruling R16); không có thì giữ tháng đang chọn.
//   const d = useSettingsDraft('payCalendar', ['payDay']);  → d.draft.payDay là v-model của ô; d.save() sau khi người dùng xác nhận.
import { computed, ref, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import {
  confirmLines,
  groupErrors,
  GROUP_PATH,
  type GroupKey,
  type GroupState,
  type Values
} from '@/builders/api/settings';
import { getSettings, isStale, saveSettingsGroup, STALE_TEXT } from '@/services/settings-store';
import { monthOptions } from './date';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function useSettingsDraft(group: GroupKey, fields: string[], opts: { backToMinMonth?: boolean } = {}) {
  const ready = ref(false);
  const error = ref<unknown>(null); // lỗi của lần tải đầu (chưa có số nào để hiện); null khi tải được
  const minMonth = ref('');
  const month = ref('');
  const state = ref<GroupState | null>(null);
  const draft = ref<Values>({});
  const reason = ref('');
  const saving = ref(false);

  const touched = new Set<string>(); // các ô đã gõ
  let base: Values = {}; // giá trị draft được đồng bộ lần cuối từ state; lệch khỏi base = người dùng vừa gõ
  let syncing = false;
  let seq = 0;

  const months = computed(() => (minMonth.value ? monthOptions(minMonth.value, 6) : []));

  watch(
    draft,
    () => {
      if (syncing) return;
      for (const f of fields) if (!same(draft.value[f], base[f])) touched.add(f);
    },
    { deep: true, flush: 'sync' }
  );

  // Nhóm `group` ở tháng đang chọn; lượt tải cũ về muộn bị bỏ.
  async function load() {
    const mine = ++seq;
    try {
      const res = await getSettings(month.value || undefined);
      if (mine !== seq) return;
      const next = res.groups[group];
      syncing = true;
      state.value = next;
      const merged: Values = { ...clone(next.values) };
      for (const f of touched) merged[f] = draft.value[f];
      draft.value = merged;
      base = clone(next.values);
      syncing = false;
      ready.value = true;
      error.value = null;
    } catch (e) {
      syncing = false;
      if (mine !== seq) return;
      // Chưa có gì để hiện: thẻ hiện dòng "Không tải được" (error); đã có số rồi thì chỉ báo nhanh, số cũ vẫn đứng.
      if (ready.value) toast.error(e.message);
      else error.value = e;
    }
  }

  // Đổi tháng là tải ngay (sync), để `loading` luôn là lượt tải của tháng vừa đặt.
  let loading: Promise<void> = Promise.resolve();
  watch(month, () => (loading = load()), { flush: 'sync' });
  async function init() {
    error.value = null;
    try {
      const first = await getSettings();
      minMonth.value = first.minMonth;
      month.value = first.minMonth; // watcher của month tải nhóm
    } catch (e) {
      error.value = e;
    }
  }
  init();

  // Nút Thử lại của dòng "Không tải được": chưa biết tháng thì đọc lại từ đầu, biết rồi thì tải lại nhóm ở tháng đang chọn.
  function retry() {
    if (!minMonth.value) return init();
    return (loading = load());
  }

  const changed = computed(() => {
    const s = state.value;
    if (!s) return [];
    return fields.filter(f => !same(draft.value[f], s.values[f]));
  });

  const errors = computed(() => {
    const s = state.value;
    if (!s) return {};
    const all = groupErrors(group, draft.value, s);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(all)) if (k === '_sum' || fields.includes(k.split('.')[0])) out[k] = v;
    return out;
  });

  const canSave = computed(() => changed.value.length > 0 && Object.keys(errors.value).length === 0 && !saving.value);

  // Chỉ các ô đã đổi; riêng trọng số KPI luôn gửi đủ các ô vì máy chủ kiểm tra tổng.
  const sendFields = () => (group === 'kpiWeights' ? fields : changed.value);

  const lines = computed(() => {
    const s = state.value;
    if (!s) return [];
    const after: Values = {};
    for (const f of changed.value) after[f] = draft.value[f];
    return confirmLines(group, s.values, after, month.value);
  });

  // Về minMonth nếu backToMinMonth và đang ở tháng khác; true = đã đổi tháng, watcher của month đã bắt đầu tải (`loading`).
  function backToMin(): boolean {
    if (!opts.backToMinMonth || !minMonth.value || month.value === minMonth.value) return false;
    month.value = minMonth.value;
    return true;
  }

  function reset() {
    touched.clear();
    reason.value = '';
    if (state.value) {
      syncing = true;
      draft.value = clone(state.value.values);
      base = clone(state.value.values);
      syncing = false;
    }
    backToMin();
  }

  async function save(): Promise<boolean> {
    const s = state.value;
    if (!s || !canSave.value) return false;
    const values: Values = {};
    for (const f of sendFields()) values[f] = draft.value[f];
    saving.value = true;
    try {
      await saveSettingsGroup(GROUP_PATH[group], {
        effectiveMonth: month.value,
        values,
        reason: reason.value.trim() || null,
        stamp: s.stamp
      });
      toast.ok('Đã lưu');
      touched.clear();
      reason.value = '';
      if (!backToMin()) loading = load();
      await loading;
      return true;
    } catch (e) {
      if (isStale(e)) {
        toast.error(STALE_TEXT);
        await load();
      } else toast.error(e.message);
      return false;
    } finally {
      saving.value = false;
    }
  }

  return {
    ready,
    error,
    minMonth,
    month,
    months,
    state,
    draft,
    reason,
    changed,
    errors,
    canSave,
    lines,
    saving,
    reset,
    save,
    retry,
    reload: load
  };
}
