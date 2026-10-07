import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Entry, EntryInput, RundownWithEntries } from '../../shared/types';
import { useToast } from '../components/Toast';

export const metaKey = ['meta'] as const;
export const rundownKey = (dayId: string, stageId: string) => ['rundown', dayId, stageId] as const;

export function useMeta() {
  return useQuery({ queryKey: metaKey, queryFn: api.meta });
}

export function useRundown(dayId: string | undefined, stageId: string | undefined) {
  return useQuery({
    queryKey: rundownKey(dayId ?? '', stageId ?? ''),
    queryFn: () => api.rundown(dayId!, stageId!),
    enabled: Boolean(dayId && stageId),
  });
}

/** Invalidates every cached rundown with the given id (or all of them). */
export function invalidateRundown(qc: QueryClient, rundownId?: string) {
  return qc.invalidateQueries({
    queryKey: ['rundown'],
    predicate: (q) => !rundownId || (q.state.data as RundownWithEntries | undefined)?.rundown.id === rundownId,
  });
}

/**
 * Mutations on one rundown. Edits are applied optimistically to the cache so the table
 * responds instantly; the server state is refetched afterwards.
 */
export function useRundownActions(dayId: string, stageId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = rundownKey(dayId, stageId);

  const optimistic = <V>(fn: (vars: V, data: RundownWithEntries) => RundownWithEntries) => ({
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<RundownWithEntries>(key);
      if (previous) qc.setQueryData(key, fn(vars, previous));
      return { previous };
    },
    onError: (err: Error, _vars: V, ctx?: { previous?: RundownWithEntries }) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error(err.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: metaKey });
    },
  });

  const mergePatch = (entries: Entry[], ids: string[], patch: EntryInput) =>
    entries.map((e) =>
      ids.includes(e.id)
        ? {
            ...e,
            ...patch,
            custom: patch.custom ? { ...e.custom, ...patch.custom } : e.custom,
            timeStart:
              (patch.type ?? e.type) !== 'event' ? null : patch.timeStart !== undefined ? patch.timeStart : e.timeStart,
          }
        : e,
    );

  const plain = {
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: metaKey });
    },
  };

  const updateEntry = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: EntryInput }) => api.updateEntry(id, patch),
    ...optimistic<{ id: string; patch: EntryInput }>(({ id, patch }, d) => ({
      ...d,
      entries: mergePatch(d.entries, [id], patch),
    })),
  });

  const batchUpdate = useMutation({
    mutationFn: ({ ids, patch }: { ids: string[]; patch: EntryInput }) => api.batchUpdate(ids, patch),
    ...optimistic<{ ids: string[]; patch: EntryInput }>(({ ids, patch }, d) => ({
      ...d,
      entries: mergePatch(d.entries, ids, patch),
    })),
  });

  const reorder = useMutation({
    mutationFn: ({ rundownId, ids }: { rundownId: string; ids: string[] }) => api.reorder(rundownId, ids),
    ...optimistic<{ rundownId: string; ids: string[] }>(({ ids }, d) => ({
      ...d,
      entries: ids.map((id) => d.entries.find((e) => e.id === id)).filter((e): e is Entry => Boolean(e)),
    })),
  });

  const deleteEntries = useMutation({
    mutationFn: (ids: string[]) => api.deleteEntries(ids),
    ...optimistic<string[]>((ids, d) => ({ ...d, entries: d.entries.filter((e) => !ids.includes(e.id)) })),
  });

  const createEntry = useMutation({
    mutationFn: ({ rundownId, input }: { rundownId: string; input: EntryInput & { afterId?: string | null } }) =>
      api.createEntry(rundownId, input),
    ...plain,
  });

  const duplicate = useMutation({ mutationFn: (ids: string[]) => api.duplicateEntries(ids), ...plain });

  const updateRundown = useMutation({
    mutationFn: ({ rundownId, startTime }: { rundownId: string; startTime: number }) =>
      api.updateRundown(rundownId, { startTime }),
    ...optimistic<{ rundownId: string; startTime: number }>(({ startTime }, d) => ({
      ...d,
      rundown: { ...d.rundown, startTime },
    })),
  });

  return { updateEntry, batchUpdate, reorder, deleteEntries, createEntry, duplicate, updateRundown };
}

export type RundownActions = ReturnType<typeof useRundownActions>;
