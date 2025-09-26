import type { Messages } from '~/shared/types';

declare module 'webext-bridge' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface ProtocolMap extends Messages {}
}
