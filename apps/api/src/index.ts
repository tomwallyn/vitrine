import { buildApp } from './app.js';

const app = buildApp();
const port = Number(process.env.PORT ?? 8080);

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`vitrine-api à l'écoute sur :${port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
