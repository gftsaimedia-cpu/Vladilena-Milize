// Hộp thoại/ngăn kéo mở sẵn theo ?hop=<tên> (mục lục thiết kế). open = true khi đường dẫn mang đúng tên;
// close() đóng và bỏ ?hop khỏi đường dẫn để tải lại trang không mở lại.
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function useHop(name?) {
  const route = useRoute();
  const router = useRouter();
  const open = ref(false);
  watch(
    () => route.query.hop,
    hop => {
      open.value = hop === name;
    },
    { immediate: true }
  );
  function close() {
    open.value = false;
    if (route.query.hop === name) {
      const { hop, ...rest } = route.query;
      router.replace({ query: rest });
    }
  }
  return { open, close };
}
