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
  ElTabs: {
    template: '<div><slot /></div>'
  },
  ElTabPane: {
    template: '<div><slot name="label" /><slot /></div>'
  },
  ElAlert: {
    template: '<div />'
  },
  ElRadioGroup: {
    template: '<div><slot /></div>'
  },
  ElRadioButton: {
    template: '<button><slot /></button>'
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
