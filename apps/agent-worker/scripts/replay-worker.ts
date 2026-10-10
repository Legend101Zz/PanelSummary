/**
 * The replay worker: answers the agent worker's HTTP API from a saved run. No model call, no MiniMax key.
 *
 *   AGENT_WORKER_TOKEN=... AGENT_WORKER_PORT=8788 REPLAY_PACKAGE=scripts/fixtures/replays/happy-prince-two-tales \
 *     tsx scripts/replay-worker.ts [--delays understanding=8,plan=5,page=3-6] [--fail-pages 7,12] [--provider-stop limit@page=5]
 *
 * Normally ./start.sh starts it (PANELSUMMARY_REPLAY_WORKER=<package>). See docs/v0.2/F1-replay-worker.md.
 */
import { buildReplayServer, loadPackage, OptionError, parseOptions, ReplayHandler } from "../src/replay/index.js";

let options;
try {
  options = parseOptions(process.argv.slice(2), process.env);
} catch (error) {
  if (error instanceof OptionError) {
    console.error(`replay worker: ${error.message}`);
    process.exit(2);
  }
  throw error;
}

const pkg = loadPackage(options.packageDir);
const app = buildReplayServer({ token: options.token, handler: new ReplayHandler(pkg, options), logger: true });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down replay worker");
  await app.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

app.log.info(
  { package: pkg.dir, title: pkg.title, pages_in_plan: pkg.plan.pages.length, saved_specs: pkg.specs.size, fail_pages: [...options.failPages], provider_stop: options.providerStop ?? null, costs: options.costs },
  "REPLAY WORKER: no model is called, nothing is spent",
);
await app.listen({ host: options.host, port: options.port });
