// Bảng trượt mở sẵn theo ?hop=<tên> và mở bằng nút trên màn: const { hop, open, close } = useHop();
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function useHop() {
  const route = useRoute();
  const router = useRouter();
  const read = () => (route.query.hop ? String(route.query.hop) : null);
  const hop = ref(read());
  watch(
    () => route.query.hop,
    () => (hop.value = read())
  );

  const open = (name?) => {
    hop.value = name;
  };
  const close = () => {
    hop.value = null;
    if (route.query.hop) {
      const { hop: _hop, ...rest } = route.query;
      router.replace({ query: rest });
    }
  };
  return { hop, open, close };
}
