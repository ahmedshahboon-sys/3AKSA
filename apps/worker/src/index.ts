import 'dotenv/config';

let stopping = false;

console.info(JSON.stringify({
  level: 'info',
  service: '3aksa-worker',
  message: 'worker foundation started; no destructive jobs are enabled yet',
  timestamp: new Date().toISOString()
}));

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;

  console.info(JSON.stringify({
    level: 'info',
    service: '3aksa-worker',
    signal,
    message: 'worker shutdown requested',
    timestamp: new Date().toISOString()
  }));

  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
