import { createApp, defineComponent, h, ref } from 'vue';
import AppDrawer from '../../src/components/ui/AppDrawer.vue';
import AppModal from '../../src/components/ui/AppModal.vue';
import '../../src/styles/base.css';
import '../../src/styles/overlay.css';

const DRAWER_WIDTH = 960;

const App = defineComponent({
  setup() {
    const modalOpen = ref(false);
    const drawerOpen = ref(false);
    const lockedModalOpen = ref(false);
    return () =>
      h('main', { 'data-drawer-width': DRAWER_WIDTH }, [
        h('button', { id: 'open-modal', onClick: () => (modalOpen.value = true) }, 'Open modal'),
        h('button', { id: 'open-locked-modal', onClick: () => (lockedModalOpen.value = true) }, 'Open locked modal'),
        modalOpen.value
          ? h(
              AppModal,
              { title: 'Outer modal', width: 960, onClose: () => (modalOpen.value = false) },
              {
                default: () => [
                  h('button', { id: 'open-drawer', onClick: () => (drawerOpen.value = true) }, 'Open drawer'),
                  h('button', { id: 'outer-last' }, 'Outer last'),
                  h('div', { style: 'height: 1200px' }, 'Long modal content'),
                  drawerOpen.value
                    ? h(
                        AppDrawer,
                        { title: 'Inner drawer', width: DRAWER_WIDTH, onClose: () => (drawerOpen.value = false) },
                        {
                          default: () => [
                            h('button', { id: 'drawer-action' }, 'Drawer action'),
                            h('div', { style: 'height: 1200px' }, 'Long drawer content'),
                            h('button', { id: 'drawer-last' }, 'Drawer last')
                          ],
                          footer: () => h('button', { id: 'drawer-footer' }, 'Drawer footer action')
                        }
                      )
                    : null
                ],
                footer: () => h('button', { id: 'modal-footer' }, 'Modal footer action')
              }
            )
          : null,
        lockedModalOpen.value
          ? h(
              AppModal,
              { title: 'Locked modal', dismissable: false, onClose: () => (lockedModalOpen.value = false) },
              { default: () => h('button', { id: 'locked-content' }, 'Locked content') }
            )
          : null
      ]);
  }
});

createApp(App).mount('#app');
