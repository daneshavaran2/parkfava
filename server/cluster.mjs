// Runs the built Nitro server across several worker processes.
//
// Node is single-threaded, so a plain `node .output/server/index.mjs` uses
// exactly one CPU core no matter how large the container is — the ceiling on
// an SSR-rendering app is throughput, and that left most of the machine idle.
// The workers share one listening socket (the OS balances accepted
// connections), and a worker that dies is replaced.
//
// Safe with this app's local-disk uploads: workers are processes on the same
// container, so they see the same filesystem. Anything that must be
// consistent *between* workers (rate limiting) lives in Postgres, not
// process memory.
//
// WEB_CONCURRENCY overrides the worker count; default is the number of
// available cores, capped at 4 so a big shared host doesn't spawn dozens of
// processes each holding its own Postgres pool.
import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Resolved against this file's location, not the working directory — a bare
// "./.output/..." specifier in an ESM import resolves relative to the module,
// which put it under server/ and made every worker fail to boot.
const SERVER_ENTRY = pathToFileURL(
  resolve(dirname(fileURLToPath(import.meta.url)), "../.output/server/index.mjs"),
).href;

const configured = Number(process.env.WEB_CONCURRENCY);
const workerCount =
  Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : Math.min(availableParallelism(), 4);

// Restarting a worker is right for a one-off crash, but if the app simply
// cannot start (bad env var, unreachable database at boot) an unconditional
// respawn becomes a fork bomb that pins the CPU and buries the real error in
// scrollback. Past this many restarts inside the window, stop and exit
// non-zero so the platform's own restart policy takes over.
const MAX_RESTARTS = 10;
const RESTART_WINDOW_MS = 60_000;

if (workerCount === 1) {
  // No point paying for a supervisor process to manage a single worker.
  await import(SERVER_ENTRY);
} else if (cluster.isPrimary) {
  console.log(`[cluster] starting ${workerCount} workers`);
  for (let i = 0; i < workerCount; i++) cluster.fork();

  let shuttingDown = false;
  let restarts = [];

  cluster.on("exit", (worker, code, signal) => {
    if (shuttingDown) return;

    const now = Date.now();
    restarts = restarts.filter((t) => now - t < RESTART_WINDOW_MS);
    restarts.push(now);

    if (restarts.length > MAX_RESTARTS) {
      console.error(
        `[cluster] ${restarts.length} worker crashes in ${RESTART_WINDOW_MS / 1000}s — ` +
          `not restarting again; exiting so the platform can restart the container.`,
      );
      shuttingDown = true;
      for (const w of Object.values(cluster.workers ?? {})) w?.kill("SIGTERM");
      process.exit(1);
    }

    console.error(`[cluster] worker ${worker.process.pid} exited (${signal || code}) — restarting`);
    cluster.fork();
  });

  // Forward termination to the workers so the platform's stop/redeploy is a
  // clean shutdown rather than a hard kill.
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      shuttingDown = true;
      for (const worker of Object.values(cluster.workers ?? {})) worker?.kill(signal);
      process.exit(0);
    });
  }
} else {
  await import(SERVER_ENTRY);
}
