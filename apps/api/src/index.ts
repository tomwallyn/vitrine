import { buildApp } from './app.js';
import { startReconcileWorker } from './services/reconcile-worker.js';

const app = buildApp();
const port = Number(process.env.PORT ?? 8080);

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`vitrine-api à l'écoute sur :${port}`);

    // Finalisation côté serveur (générations queued/processing → done/failed
    // + push Expo) — no-op si RECONCILE_WORKER=off ou DATABASE_URL absent.
    const stopReconcileWorker = startReconcileWorker(app.log);

    // Shutdown propre (Cloud Run envoie SIGTERM) : stoppe la boucle puis Fastify.
    let shuttingDown = false;
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        if (shuttingDown) return;
        shuttingDown = true;
        app.log.info(`${signal} reçu — arrêt du worker puis du serveur`);
        stopReconcileWorker();
        app
          .close()
          .then(() => process.exit(0))
          .catch((err: unknown) => {
            app.log.error(err);
            process.exit(1);
          });
      });
    }
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
