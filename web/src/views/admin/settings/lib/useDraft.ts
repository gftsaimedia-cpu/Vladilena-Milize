// Bản nháp của một màn sửa được: sửa trên bản sao, so với bản đã lưu để biết có thay đổi hay không.
//   const form = useDraft(() => data.value && data.value.form);
//   form.draft (ref) sửa trực tiếp · form.changes (số chỗ khác) · form.reset() · await form.save(d => saveX(d))
import { computed, ref, watch } from 'vue';

const plain = (v?) => (v == null ? v : JSON.parse(JSON.stringify(v)));

// Gom mọi giá trị lá về dạng đường dẫn → giá trị để đếm số chỗ khác nhau (kể cả dòng thêm/bớt)
function leaves(v?, path?, out?) {
  if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') Object.keys(v).forEach(k => leaves(v[k], `${path}.${k}`, out));
  else out[path] = v;
  return out;
}

export function countChanges(a?, b?) {
  const x = leaves(a, '', {});
  const y = leaves(b, '', {});
  let n = 0;
  for (const k of new Set<any>([...Object.keys(x), ...Object.keys(y)])) if (x[k] !== y[k]) n++;
  return n;
}

export function useDraft(source?) {
  const base = ref(null);
  const draft = ref(null);
  const saving = ref(false);
  const saved = ref(false);
  const error = ref('');

  watch(
    source,
    v => {
      base.value = plain(v);
      draft.value = plain(v);
      saved.value = false;
    },
    { immediate: true }
  );

  const changes = computed(() => (base.value && draft.value ? countChanges(base.value, draft.value) : 0));
  watch(changes, n => {
    if (n) saved.value = false;
  });

  function reset() {
    draft.value = plain(base.value);
    error.value = '';
  }

  /** Gửi bản nháp qua hàm dịch vụ; xong thì coi bản nháp là bản đã lưu. Trả true nếu thành công. */
  async function save(fn?) {
    saving.value = true;
    error.value = '';
    try {
      await fn(plain(draft.value));
      base.value = plain(draft.value);
      saved.value = true;
      return true;
    } catch (e) {
      error.value = e && e.message ? e.message : 'Không lưu được, thử lại sau.';
      return false;
    } finally {
      saving.value = false;
    }
  }

  return { draft, changes, saving, saved, error, reset, save };
}
