import { z } from 'zod';

const seconds = z.number().int().min(-86400 * 7).max(86400 * 7);
const color = z.string().max(32);

export const entryTypeSchema = z.enum(['event', 'block', 'delay']);

export const entryInputSchema = z
  .object({
    type: entryTypeSchema,
    cue: z.string().max(64),
    title: z.string().max(500),
    speakers: z.string().max(1000),
    duration: seconds,
    timeStart: seconds.nullable(),
    note: z.string().max(10000),
    color,
    isPublic: z.boolean(),
    skip: z.boolean(),
    custom: z.record(z.string(), z.string().max(5000)),
  })
  .partial();

export const createEntrySchema = entryInputSchema.extend({
  /** Insert after this entry; omitted = append at the end, null = insert at the top. */
  afterId: z.string().nullable().optional(),
});

export const batchPatchSchema = z.object({
  ids: z.array(z.string()).min(1).max(1000),
  patch: entryInputSchema,
});

export const idsSchema = z.object({ ids: z.array(z.string()).min(1).max(1000) });

export const reorderSchema = z.object({ ids: z.array(z.string()).max(5000) });

export const rundownPatchSchema = z.object({ startTime: seconds });

export const importEntriesSchema = z.object({
  mode: z.enum(['replace', 'append']),
  startTime: seconds.optional(),
  entries: z.array(entryInputSchema).max(5000),
});

export const settingsSchema = z
  .object({
    name: z.string().min(1).max(200),
    timezone: z.string().min(1).max(64),
    defaultDuration: z.number().int().min(0).max(86400),
  })
  .partial();

export const dayInputSchema = z
  .object({
    label: z.string().min(1).max(100),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  })
  .partial();

export const stageInputSchema = z
  .object({
    name: z.string().min(1).max(100),
    color,
  })
  .partial();

export const customFieldInputSchema = z
  .object({
    label: z.string().min(1).max(100),
    color,
  })
  .partial();

export const loginSchema = z.object({ pin: z.string().min(1).max(100) });

const daySchema = z.object({
  id: z.string(),
  label: z.string(),
  date: z.string().nullable(),
  sortOrder: z.number().int(),
});

const stageSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  sortOrder: z.number().int(),
});

export const backupSchema = z.object({
  format: z.literal('utopian-hours-rundown'),
  version: z.literal(1),
  exportedAt: z.string(),
  settings: z.object({ name: z.string(), timezone: z.string(), defaultDuration: z.number().int() }),
  days: z.array(daySchema),
  stages: z.array(stageSchema),
  customFields: z.array(
    z.object({ id: z.string(), label: z.string(), color: z.string(), sortOrder: z.number().int() }),
  ),
  rundowns: z.array(
    z.object({
      id: z.string(),
      dayId: z.string(),
      stageId: z.string(),
      startTime: z.number().int(),
      revision: z.number().int(),
    }),
  ),
  entries: z.array(
    z.object({
      id: z.string(),
      rundownId: z.string(),
      sortOrder: z.number().int(),
      type: entryTypeSchema,
      cue: z.string(),
      title: z.string(),
      speakers: z.string(),
      duration: z.number().int(),
      timeStart: z.number().int().nullable(),
      note: z.string(),
      color: z.string(),
      isPublic: z.boolean(),
      skip: z.boolean(),
      custom: z.record(z.string(), z.string()),
    }),
  ),
});
