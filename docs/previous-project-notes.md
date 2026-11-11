> Historical development notes. For the current submission, use [the README](../README.md). The interface and prepared Lecture 5a path are now implemented, and the optional backend agent now requests English output.

# Lecture Assistant — demo

## Frontend: Katchup (English)

Katchup listens to a live lecture with the student. Three tools, one click each, never leaving the slide:
- **Katchup** (`K`): what was said before this slide.
- **Explain this slide** (`E`): the current slide in plain words.
- **Glossary** (`G`): every term on the slide. Hovering a term highlights it on the slide, and clicking a term on the slide opens it here.

It lives in `web/` (`index.html`, `styles.css`, `app/`). Like the rest of the repo it uses plain ES modules, with no build step and no runtime npm dependencies.

### Run the demo

```sh
npm run web            # http://localhost:5173  (use "localhost", not 127.0.0.1: it is the origin the backend allows)
npm start              # optional: the existing backend on :3001
npm run seed:sample    # once: imports the sample lesson into the backend (data/katchup-sample)
```

With the backend running and the sample seeded, "Automatic" answers come from the backend's provider (`.env`). If that provider is unreachable (for example Ollama not started), Katchup shows the sample answer, says why, and offers "Ask the server again".

- `http://localhost:5173/#present` (or press `P`) opens the presentation: three beats followed by a walkthrough of the three tools.
- URL options: `?start=4` (slide the lecture is on), `?paused`, `?speed=2`.
- Keys: `←`/`→` change slide, `End` jumps back to live, `Esc` closes the focused panel.

### Live transcript

In class, the transcript arrives while the professor speaks. In this demo, the lesson's transcript is played back word by word (`web/app/live.mjs`): the slide follows the professor, slides not presented yet are locked, and every AI request is built only from what was heard so far (`heardLesson`). When a panel is open the student stays on their slide, and "Live is on slide N →" brings them back. To use real speech-to-text, replace the simulated source in `live.mjs` with one that emits the same snapshots. No such endpoint exists today.

### The professor's slides

Put them in **`web/lesson/`**: a `lesson.json` (slide text, transcript, optional glossary) and optionally `slides/*.png`, exported from the PDF. See [`web/lesson/README.md`](web/lesson/README.md). Without the file, the built-in sample lesson is used.

### AI provider (Settings)

- **Automatic** (default): uses the backend's provider from `.env` when the backend has this lesson (same `id`, imported with `npm run import:lecture`), otherwise pre-written answers labelled *Sample answer*.
- **Claude**, **OpenAI** or **Ollama (local)**: called directly from the browser, because the backend reads its provider and key only from `.env`, its CORS policy allows no auth header, and it rejects unknown body fields. Keys are kept in `sessionStorage` for this tab only: never in `localStorage`, the URL, logs or the repo. Only the last 4 characters are shown. Clients are in `web/app/api/claude.mjs` (model `claude-opus-5-5`) and `web/app/api/providers.mjs`.
- **Ollama** needs `OLLAMA_ORIGINS=http://localhost:5173 ollama serve` so the page may call it, and only local addresses are allowed.

### Endpoints

Used: `GET /api/health`, `GET /api/lectures/:id` (does the server have this lesson?), `POST /api/lectures/:id/actions` (with `transcriptThroughSlide` limited to what was heard).

Missing, handled behind the adapter `web/app/api/lesson.mjs`:
- live transcription (simulated);
- streaming answers (the backend returns the whole answer, which the UI reveals progressively);
- a per-user provider or key.

The backend agent's prompt is in Italian, so answers from the server provider may come back in Italian. Fixing that needs a backend change, which was out of scope.

### Tests

```sh
npm test               # unit tests (node:test): test/companion-*.test.mjs
npx playwright install chromium   # once
npm run test:e2e       # end-to-end (Playwright; backend, Claude, OpenAI and Ollama mocked at the network layer)
```

---

Base funzionante per una piattaforma web che aiuta a recuperare il filo di una lezione e a chiarire la terminologia della slide corrente. **Nessuna interfaccia grafica è stata implementata.** Sono pronti backend, agente, adapter LLM, importazione dei materiali, client e controller per il futuro frontend.

Node.js **22.9 o successivo**, zero dipendenze npm. Nessun database, framework di agenti, account utente o servizio aggiuntivo obbligatorio.

## Avvio

Da questa cartella:

```sh
cp .env.example .env
# Compila LLM_PROVIDER, LLM_MODEL e l'eventuale chiave in .env.
npm start
```

Su PowerShell, usa `Copy-Item .env.example .env`. Non serve `npm install`.

Il server ascolta su `http://127.0.0.1:3001`. `GET /api/health` verifica l'avvio e la presenza della configurazione; non verifica credenziali o disponibilità effettiva del modello. Senza configurazione puoi comunque leggere la lezione di esempio; le azioni restituiscono `LLM_NOT_CONFIGURED`, senza simulare risposte.

| Provider | Configurazione |
| --- | --- |
| OpenAI | `LLM_PROVIDER=openai`, `LLM_MODEL=<modello disponibile>`, `OPENAI_API_KEY=<chiave>` |
| Claude | `LLM_PROVIDER=claude`, `LLM_MODEL=<modello disponibile>`, `ANTHROPIC_API_KEY=<chiave>` |
| Ollama | Avvia Ollama, scarica un modello con `ollama pull <modello>`, imposta `LLM_PROVIDER=ollama` e `LLM_MODEL=<modello>` |

Per OpenAI scegli un modello compatibile con Chat Completions e JSON mode; per Ollama un modello istruito che gestisca JSON strutturato. Il nome del modello è intenzionalmente configurabile. Le chiavi restano sul server. La sottoscrizione ChatGPT non sostituisce la configurazione dell'API OpenAI.

## Le tre azioni

| Azione API | Futuro pulsante | Risultato |
| --- | --- | --- |
| `context` | **Ho perso il filo** | Al massimo tre passaggi che collegano quanto spiegato prima alla slide corrente, con fonti |
| `glossary` | **Glossario** | Fino a otto termini o simboli presenti nella slide e loro significato locale |
| `explain` | **Spiega questa slide** | Spiegazione della slide fondata sui materiali disponibili |

Nessuna generazione parte quando si cambia slide: tutte e tre le azioni sono facoltative e devono essere richiamate esplicitamente. Il controller mantiene risultati separati per i tre pannelli e li azzera al cambio slide. Per il frontend previsto: visualizzatore slide e navigazione a sinistra; pulsanti, testo generato e pannello glossario a destra.

L'agente prepara le fonti, esegue l'azione richiesta, chiama realmente il provider e valida il JSON restituito. Se il contenuto non rispetta il contratto, riprova una sola volta. Errori di rete o HTTP non vengono ritentati automaticamente. È un flusso guidato dalle tre azioni, senza cicli autonomi o tool esterni.

## Slide e trascrizioni

La lezione di esempio `demo` contiene quattro slide testuali sintetiche su A*. **Non include un PDF**: serve a provare API e agente prima di ricevere i vostri materiali.

Il formato di ingresso è un PDF e un manifest JSON che associa **una pagina a una slide e al relativo pezzo di trascrizione**:

```json
{
  "id": "mia-lezione",
  "title": "Titolo della lezione",
  "slides": [
    {
      "number": 1,
      "title": "Titolo prima slide",
      "text": "Testo e formule visibili nella prima slide",
      "transcript": "Parole pronunciate mentre viene spiegata questa slide"
    }
  ]
}
```

```sh
npm run import:lecture -- /percorso/lecture.json /percorso/slides.pdf
```

Il PDF è facoltativo, il manifest obbligatorio. I file vengono copiati in `data/<id>/`; un identificativo già esistente non viene sovrascritto. Numeri consecutivi da 1, massimo 150 slide, manifest massimo 3 MB e PDF massimo 25 MB. L'id `demo` è riservato. Non includere segreti o dati personali non necessari nei materiali.

Per mantenere piccola la demo, **non sono implementati OCR, estrazione automatica del testo, riconoscimento vocale o allineamento audio-slide**. Il testo della slide va inserito nel manifest; può includere una descrizione fedele dei diagrammi. I modelli ricevono questo testo, non l'immagine della pagina. L'import verifica la firma PDF, ma non il numero di pagine: la corrispondenza pagina/slide deve essere verificata quando si preparano i materiali.

## Quale contesto può leggere l'agente

Alla slide `N` l'agente riceve il testo delle slide da 1 a N e, per impostazione predefinita, le trascrizioni fino a N−1. Le slide successive non entrano mai nel prompt. Gli ID delle fonti sono `slide:1`, `transcript:1`, ecc.

Se si sta rivedendo una slide già spiegata, inviare `transcriptThroughSlide: N` permette di usare anche la sua spiegazione orale. In alternativa si può indicare una soglia precedente. Il controller espone `setCurrentTranscriptAvailable(true)`; al cambio slide torna al valore predefinito. Questo è un limite per slide intere, **non una sincronizzazione dal vivo a livello di secondo**.

L'agente deve dichiarare `insufficient_context` se non trova il contesto necessario. Il validatore rifiuta citazioni inesistenti e termini del glossario assenti dalla slide. **L'esistenza della citazione non garantisce che l'affermazione sia corretta**: la risposta include le fonti originali per verificarla. I simboli mantengono il significato locale, senza un glossario globale che li unifichi arbitrariamente.

Il contesto ha un limite di 65.000 caratteri: oltre tale limite la richiesta viene rifiutata, senza tagli silenziosi. Usate inizialmente lezioni brevi e un modello con finestra di contesto adeguata; il limite in caratteri non è un conteggio di token. Il provider, specialmente Ollama, va configurato per accogliere l'intero prompt.

## API e prova rapida

| Metodo | Percorso | Scopo |
| --- | --- | --- |
| GET | `/api/health` | Stato del server e configurazione LLM |
| GET | `/api/lectures` | Elenco lezioni |
| GET | `/api/lectures/:id` | Slide, trascrizioni e URL PDF |
| GET | `/api/lectures/:id/pdf` | Documento originale da mostrare a sinistra |
| POST | `/api/lectures/:id/actions` | Esegue una delle tre azioni |

```sh
curl http://127.0.0.1:3001/api/lectures/demo

curl http://127.0.0.1:3001/api/lectures/demo/actions \
  -H 'Content-Type: application/json' \
  -d '{"slideNumber":3,"action":"context"}'
```

Ripeti sostituendo `context` con `glossary` o `explain`. La risposta contiene `summary`, `points`, `terms`, `missingContext` e `sources`. Le fonti contengono testo originale, tipo e numero di slide. Gli errori hanno forma `{ "error": { "code": "...", "message": "..." } }`.

È ammessa una generazione alla volta: una richiesta contemporanea riceve HTTP 429. Il timeout del singolo tentativo è configurabile; due tentativi di validazione possono richiedere fino a circa il doppio. Non vengono salvati su disco prompt o risposte generate. Con OpenAI o Claude il materiale selezionato viene inviato al rispettivo servizio; con Ollama all'indirizzo configurato.

## Struttura del codice

| Percorso | Responsabilità |
| --- | --- |
| `src/server.mjs` | Avvio e collegamento dei componenti |
| `src/app.mjs` | Endpoint HTTP, errori, CORS e limite di concorrenza |
| `src/config.mjs` | Configurazione dal server |
| `src/lectures/` | Validazione manifest e lettura dei materiali |
| `src/agent/context.mjs` | Selezione delle fonti e limite temporale |
| `src/agent/agent.mjs` | Istruzioni, chiamata LLM e singolo tentativo di correzione |
| `src/agent/output.mjs` | Schema e validazione della risposta |
| `src/llm/adapter.mjs` | Un'interfaccia, tre implementazioni HTTP selezionate dal provider |
| `web/api.mjs` | Client per le API e URL delle pagine PDF |
| `web/controller.mjs` | Stato, navigazione e azioni del futuro frontend |
| `web/contracts.d.ts` | Tipi di riferimento per l'integrazione web |
| `scripts/import-lecture.mjs` | Importazione locale dei materiali |
| `examples/demo/lecture.json` | Lezione sintetica per le prove |
| `test/` | Test dell'agente, adapter, API e controller |

I moduli web sono ES modules utilizzabili da React, Vue o JavaScript. Esempio di collegamento futuro:

```js
import { createApi } from './web/api.mjs';
import { createLectureController } from './web/controller.mjs';

const api = createApi('http://127.0.0.1:3001');
const controller = createLectureController(api, state => {
  // Qui la futura vista renderizza slide a sinistra e state.panels a destra.
});
await controller.load('demo');
controller.selectSlide(3);
// Handler del futuro pulsante «Ho perso il filo»:
await controller.run('context');
```

`api.pdfUrl(lecture, page)` produce un URL con `#page=N`, utilizzabile inizialmente con il visualizzatore PDF del browser. Il supporto al cambio pagina dipende dal browser; per un rendering controllato si potrà aggiungere PDF.js. I dati generati vanno renderizzati come testo, o Markdown sanitizzato, mai tramite HTML non filtrato. L'interfaccia deve mostrare caricamento ed errori e disabilitare le azioni mentre `pendingAction` è valorizzato. Le risposte tardive vengono ignorate dopo un cambio di slide o lezione.

## Verifica e limiti della consegna

```sh
npm test
```

I test usano il runner integrato di Node: controllo delle fonti, esclusione del futuro, validazione, adapter HTTP, importazione, API reali su loopback e concorrenza del controller. I provider sono simulati nei test: **non è stata eseguita un'inferenza reale con credenziali o un modello Ollama**. Dopo la configurazione, il comando `curl` delle azioni costituisce la prima prova completa da eseguire.

Questa è una demo locale: nessuna autenticazione, caricamento dal browser, UI, streaming o sincronizzazione audio. Prima di pubblicarla servirebbero accesso controllato e limiti d'uso. La prossima attività è fornire una breve lezione reale, verificarne l'allineamento e provare soprattutto `context` e `glossary`; successivamente si potrà costruire la vista a due colonne.

Riferimenti API usati per gli adapter: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat), [Claude Messages](https://platform.claude.com/docs/en/api/messages), [Ollama Chat](https://docs.ollama.com/api/chat).
