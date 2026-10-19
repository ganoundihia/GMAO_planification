// api/server.js — point d'entrée du serveur API (développement / auto-hébergé).
import 'dotenv/config.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`🚀 API SETRAM → http://localhost:${PORT}  (health: /healthz)`);
});

// Arrêt propre (Docker, systemd, Ctrl+C)
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n${sig} reçu, arrêt du serveur…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
