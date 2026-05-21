import { config } from '@vue/test-utils';

config.global.stubs = {
  ElButton: {
    template: '<button><slot /></button>'
  },
  ElEmpty: {
    template: '<div><slot /></div>'
  },
  ElScrollbar: {
    template: '<div><slot /></div>'
  },
  ElTag: {
    template: '<span><slot /></span>'
  }
};
