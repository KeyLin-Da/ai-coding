import { config } from '@vue/test-utils';

config.global.stubs = {
  ElButton: {
    template: '<button><slot /></button>'
  },
  ElDialog: {
    template: '<div><slot name="header" /><slot /></div>'
  },
  ElEmpty: {
    template: '<div><slot /></div>'
  },
  ElScrollbar: {
    template: '<div><slot /></div>'
  },
  ElTag: {
    template: '<span><slot /></span>'
  },
  ElSelect: {
    template: '<select><slot /></select>'
  },
  ElOption: {
    template: '<option><slot /></option>'
  },
  ElDrawer: {
    template: '<div><slot /></div>'
  },
  ElTimeline: {
    template: '<div><slot /></div>'
  },
  ElTimelineItem: {
    template: '<div><slot /></div>'
  }
};

config.global.directives = {
  loading: {}
};
