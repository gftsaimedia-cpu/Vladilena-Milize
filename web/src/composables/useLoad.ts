// Tải dữ liệu cho một màn: const { data, loading, error, reload } = useLoad(() => getX(month.value), () => month.value)
// source (tuỳ chọn): đổi giá trị thì tải lại; lượt tải cũ về muộn bị bỏ.
import { ref, watch } from 'vue';

export function useLoad(fn?, source?) {
  const data = ref(null);
  const loading = ref(true);
  const error = ref(null);
  let seq = 0;
  async function run() {
    const mine = ++seq;
    loading.value = true;
    error.value = null;
    try {
      const value = await fn();
      if (mine === seq) data.value = value;
    } catch (e) {
      if (mine === seq) error.value = e;
    } finally {
      if (mine === seq) loading.value = false;
    }
  }
  if (source) watch(source, run, { immediate: true });
  else run();
  return { data, loading, error, reload: run };
}
