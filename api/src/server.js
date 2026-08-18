const { createApp } = require('./app');
const { createTaskStore } = require('./db');

const port = Number(process.env.PORT || 3000);
const taskStore = createTaskStore();

async function start() {
  await taskStore.initialize();
  const server = createApp(taskStore).listen(port, '0.0.0.0', () => {
    console.log(`API listening on port ${port}`);
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down`);
    server.close(async () => {
      await taskStore.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(async (error) => {
  console.error('Failed to start API', error);
  await taskStore.close();
  process.exit(1);
});

