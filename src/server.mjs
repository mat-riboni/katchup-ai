import { mkdir } from 'node:fs/promises';
import { readConfig } from './config.mjs';
import { createAdapter } from './llm/adapter.mjs';
import { LectureAgent } from './agent/agent.mjs';
import { LectureStore } from './lectures/store.mjs';
import { createApp } from './app.mjs';

const config = readConfig();
await mkdir(config.dataDir, { recursive: true });
const app = createApp({ config,
  store: new LectureStore(config.dataDir, config.exampleDir),
  agent: new LectureAgent(createAdapter(config)),
});
// Demo locale: esporre su internet richiederebbe autenticazione e limiti per utente.
app.listen(config.port, '127.0.0.1', () => console.log(`Lecture Assistant API: http://127.0.0.1:${config.port}/api/health`));
