import type { Repo } from '../repo';

const h = (hh: number, mm = 0) => hh * 3600 + mm * 60;
const min = (m: number) => m * 60;

/** Fills an empty database with an example structure so the app is usable right away. */
export function seed(repo: Repo) {
  if (!repo.isEmpty()) return;
  repo.updateSettings({ name: 'Utopian Hours 2026', timezone: 'Europe/Rome', defaultDuration: min(30) });

  const day1 = repo.createDay({ label: 'Giorno 1', date: null });
  repo.createDay({ label: 'Giorno 2', date: null });
  repo.createDay({ label: 'Giorno 3', date: null });

  const main = repo.createStage({ name: 'Sala principale', color: '#ff7597' });
  const second = repo.createStage({ name: 'Sala 2', color: '#779be7' });

  const regia = repo.createCustomField({ label: 'Regia', color: '#77c785' });
  const audio = repo.createCustomField({ label: 'Audio', color: '#e8a76d' });

  const r1 = repo.ensureRundown(day1.id, main.id);
  repo.importEntries(
    r1.id,
    [
      { type: 'block', title: 'Apertura', color: '#ff7597' },
      { type: 'event', cue: '1', title: 'Apertura porte', duration: min(30), isPublic: false, color: '#5f6b7a' },
      {
        type: 'event',
        cue: '2',
        title: 'Saluti di benvenuto',
        speakers: 'Organizzazione',
        duration: min(15),
        custom: { [regia.id]: 'Video sigla', [audio.id]: '2 radiomicrofoni' },
      },
      { type: 'event', cue: '3', title: 'Keynote di apertura', speakers: 'Da definire', duration: min(45) },
      { type: 'block', title: 'Mattina', color: '#779be7' },
      {
        type: 'event',
        cue: '4',
        title: 'Panel',
        speakers: 'Moderatore + 3 ospiti',
        duration: min(60),
        note: 'Preparare 4 sedie e 4 microfoni',
        custom: { [audio.id]: '4 radiomicrofoni' },
      },
      { type: 'event', cue: '5', title: 'Pausa pranzo', duration: min(90), timeStart: h(13), color: '#5f6b7a' },
      { type: 'block', title: 'Pomeriggio', color: '#77c785' },
      { type: 'event', cue: '6', title: 'Talk', speakers: 'Da definire', duration: min(30) },
      { type: 'event', cue: '7', title: 'Talk', speakers: 'Da definire', duration: min(30) },
      { type: 'event', cue: '8', title: 'Chiusura', duration: min(15) },
    ],
    'replace',
    h(10),
  );

  const r2 = repo.ensureRundown(day1.id, second.id);
  repo.importEntries(
    r2.id,
    [
      { type: 'event', cue: 'W1', title: 'Workshop', speakers: 'Da definire', duration: min(90) },
      { type: 'event', cue: 'W2', title: 'Workshop', speakers: 'Da definire', duration: min(90), timeStart: h(14, 30) },
    ],
    'replace',
    h(11),
  );
}
