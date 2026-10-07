# Scaletta · Utopian Hours 2026

Web app per gestire la scaletta (rundown) di **Utopian Hours 2026**: più giorni, più palchi/sale, orari calcolati automaticamente, import/export Excel. L'interfaccia è ispirata a [Ontime](https://github.com/cpvalente/ontime).

_English summary at the bottom._

## Funzionalità

- **Giorni × palchi**: ogni combinazione giorno/palco ha la sua scaletta, accessibile dalla barra laterale.
- **Editor tabellare**: si modifica direttamente nella tabella (cue, inizio, durata, titolo, relatori, note e campi personalizzati), con un pannello _Dettagli_ per note lunghe, colore e campi extra.
  - **Eventi**: per default seguono la voce precedente (🔗). Se scrivi un orario, l'evento diventa a **orario fisso** (🔒) e la scaletta segnala **pause** e **sovrapposizioni**.
  - **Blocchi**: intestazioni colorate (es. "Mattina") con orario, durata e numero di eventi.
  - **Ritardi**: spostano gli orari successivi. Accanto all'orario pianificato compare quello previsto.
  - Voci da **saltare**, voci **non pubbliche**, colori.
  - Riordino con **trascinamento** o `Alt + ↑/↓`, selezione multipla e modifica multipla, duplica ed elimina.
  - Inserimento rapido degli orari: `14:30`, `1430`, `9`. Durate: `45`, `1h30`, `1:30`, `00:45:00`.
- **Collaborazione in tempo reale**: più persone possono lavorare insieme e ogni modifica appare subito agli altri (WebSocket).
- **Panoramica**: la giornata con tutti i palchi affiancati su un unico asse orario, per vedere a colpo d'occhio sovrapposizioni e buchi.
- **Import / Export**:
  - import da **Excel (.xlsx)** o **CSV** con abbinamento delle colonne (riconosciuto in automatico), avvisi sulle righe non valide e anteprima calcolata;
  - export in **Excel** (una scaletta, oppure tutte con un foglio per giorno/palco) e in **CSV**;
  - **backup/ripristino JSON** completo;
  - **versione stampabile / PDF** per un palco o per l'intera giornata, con opzioni "solo eventi pubblici", note e campi personalizzati.
- **Accesso con PIN**: tutta l'app è protetta da un PIN unico per la redazione, con una sessione di 30 giorni. Se cambi il PIN, tutte le sessioni vengono invalidate.

### Scorciatoie da tastiera (editor)

| Tasti | Azione |
| --- | --- |
| `↑` / `↓` | seleziona voce |
| `Alt + ↑/↓` | sposta voce |
| `Invio` | modifica titolo |
| `E` / `B` / `R` | nuovo evento / blocco / ritardo dopo la selezione |
| `Ctrl/⌘ + D` | duplica |
| `Canc` | elimina |
| `Ctrl/⌘ + clic`, `Maiusc + clic` | selezione multipla |

## Sviluppo

Requisiti: **Node.js ≥ 22.13**. Il database è SQLite tramite il modulo integrato `node:sqlite`, quindi non serve compilare nulla.

```bash
npm install
npm run dev          # server su :4000 + Vite su :5173 (apri http://localhost:5173, PIN di sviluppo: 2026)
npm test             # test unitari e API (vitest)
npm run typecheck
npm run build        # client in dist/client, server in dist/server
npm start            # avvia la build di produzione
```

Il primo avvio crea una scaletta di esempio (3 giorni, 2 sale). Per partire da un database vuoto usa `SEED=false`.

Smoke test end-to-end con Playwright (richiede un server avviato):

```bash
BASE_URL=http://localhost:4000 EDITOR_PIN=2026 npm run smoke
# se Chromium non è nel percorso predefinito: CHROMIUM_PATH=/percorso/chrome
```

### Struttura

```
src/shared/   tipi, schemi zod, parsing orari, motore di calcolo (timeline.ts), mappatura import
src/server/   Fastify + SQLite: auth PIN, API REST, WebSocket, import/export xlsx/csv/json
src/client/   React + Vite: editor scaletta, panoramica, impostazioni, import/export, stampa
tests/        test vitest (timeline, parsing, import, API)
scripts/      smoke test Playwright
```

## Configurazione

| Variabile | Default | Descrizione |
| --- | --- | --- |
| `EDITOR_PIN` | `2026` solo in sviluppo | PIN di accesso. **Obbligatorio in produzione.** |
| `SESSION_SECRET` | casuale a ogni avvio | Chiave per firmare i cookie di sessione. Impostala per non perdere le sessioni a ogni riavvio. |
| `DATA_DIR` | `./data` | Cartella del database `rundown.db`. |
| `PORT` | `4000` | Porta HTTP. |
| `SEED` | `true` | `false` per non creare la scaletta di esempio. |

## Deploy nel cloud

L'app è un unico container: il server serve sia le API sia il client, e i dati stanno in un file SQLite. Serve quindi **un disco persistente** montato su `DATA_DIR` e **una sola istanza**.

### Fly.io (configurazione inclusa)

```bash
fly launch --no-deploy --copy-config      # usa fly.toml; cambia "app" se il nome è occupato
fly volumes create rundown_data --size 1 --region fra
fly secrets set EDITOR_PIN=scegli-un-pin SESSION_SECRET=$(openssl rand -hex 32)
fly deploy
```

### Altre piattaforme (Render, Railway, VPS con Docker…)

```bash
docker build -t uh-rundown .
docker run -d -p 8080:8080 -v uh-data:/data \
  -e EDITOR_PIN=scegli-un-pin -e SESSION_SECRET=$(openssl rand -hex 32) uh-rundown
```

Su Render o Railway, collega il repository come servizio Docker, aggiungi un disco persistente su `/data` e imposta le variabili `EDITOR_PIN` e `SESSION_SECRET`.

**Backup**: dalla pagina _Importa / Esporta_ scarica regolarmente il backup JSON, soprattutto prima e durante l'evento.

## Possibili sviluppi

Il modello dati è già pronto per aggiungere, in stile Ontime, il **timer live** (avvio/pausa/avanti con conteggio di anticipo e ritardo) e le **viste di uscita** (timer per i relatori, backstage, programma pubblico).

---

## English summary

Rundown admin app for the Utopian Hours 2026 festival, inspired by Ontime:

- multi-day, multi-stage rundowns;
- an inline-editable table with events, blocks and delays, start/end times that compute themselves, fixed versus linked start times with gap and overlap warnings, and custom fields;
- real-time sync between editors, a day overview across stages, XLSX/CSV import with column mapping and preview, XLSX/CSV/JSON export, and a printable/PDF view;
- an Italian UI behind a single editor PIN.

Stack: React and Vite on the client, with Fastify and SQLite (`node:sqlite`) on the server. It deploys as a single Docker container with a persistent volume. See the commands above.
