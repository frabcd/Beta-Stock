import 'dotenv/config';
import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = await createApp();

const close = async (signal: string) => {
  app.log.info({ signal }, 'Stopping Beta-Stock');
  await app.close();
  process.exitCode = 0;
};

process.once('SIGINT', () => void close('SIGINT'));
process.once('SIGTERM', () => void close('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port, listenTextResolver: (address) => address });
  app.log.info({ address: `http://${config.host}:${config.port}` }, 'Beta-Stock is ready');
} catch (error) {
  app.log.fatal({ errorName: error instanceof Error ? error.name : 'Unknown' }, 'Beta-Stock could not start');
  await app.close();
  process.exitCode = 1;
}
