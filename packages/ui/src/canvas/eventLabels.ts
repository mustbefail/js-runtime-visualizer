import type { EventKind } from '../types';

export const EVENT_LABELS: Record<EventKind, string> = {
  'enter-frame': 'Function entered',
  'leave-frame': 'Function returned',
  assign: 'Variable assigned',
  allocate: 'Object allocated',
  lookup: 'Variable read',
  mutate: 'Property updated',
  console: 'console.log',
  'proto-walk': 'Walked [[Prototype]] chain',
  'proto-set': '[[Prototype]] set',
  'bind-this': 'this bound',
  error: 'Error thrown',
  'unwind-frame': 'Frame unwound',
  catch: 'Caught',
};
