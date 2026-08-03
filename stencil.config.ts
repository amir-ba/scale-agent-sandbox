import { Config } from '@stencil/core';

export const config: Config = {
  namespace: 'scale-barcamp',
  outputTargets: [
    { type: 'dist' },
    { type: 'www', serviceWorker: null },
  ],
};
