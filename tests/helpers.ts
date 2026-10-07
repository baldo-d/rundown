import type { Entry } from '../src/shared/types';

let n = 0;
export function entry(partial: Partial<Entry>): Entry {
  n++;
  return {
    id: partial.id ?? `e${n}`,
    rundownId: 'r',
    sortOrder: n,
    type: 'event',
    cue: '',
    title: '',
    speakers: '',
    duration: 0,
    timeStart: null,
    note: '',
    color: '',
    isPublic: true,
    skip: false,
    custom: {},
    ...partial,
  };
}

export const h = (hh: number, mm = 0) => hh * 3600 + mm * 60;
export const min = (m: number) => m * 60;
