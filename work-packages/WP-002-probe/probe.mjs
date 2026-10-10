// WP-002 probe: driver session open against a fake llama.cpp endpoint.
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { PiSdkDriver } from "../../packages/pi-sdk-driver/dist/pi-sdk-driver.js";
import {
  FIXED_PROVIDER_ID,
  FIXED_MODEL_ID,
  lastFixedModelRegistration,
} from "../../packages/pi-sdk-driver/dist/fixed-model.js";

const root = await mkdtemp(join(tmpdir(), "wp002-probe-"));
const agentDir = join(root, "agent");
const cwd = join(root, "workspace");
await mkdir(agentDir);
await mkdir(cwd);
await writeFile(join(agentDir, "auth.json"), "{}");
await writeFile(
  join(agentDir, "settings.json"),
  JSON.stringify({ packages: [], cacheWarming: "off" }),
);
await writeFile(
  join(agentDir, "models.json"),
  JSON.stringify({
    providers: {
      openai: {
        baseUrl: "http://127.0.0.1:9/x",
        apiKey: "NOPE",
        api: "openai-completions",
        models: [],
      },
    },
  }),
);

const serverProc = spawn(
  process.execPath,
  [new URL("./fake-server.mjs", import.meta.url).pathname],
  { stdio: ["ignore", "pipe", "pipe"] },
);
await new Promise((resolve) => serverProc.stdout.once("data", resolve));
process.env.LLAMACPP_BASE_URL = "http://127.0.0.1:52393/v1";

const results = [];
const record = (name, pass, detail) => results.push({ name, pass, detail });

const driver = new PiSdkDriver({ agentDir, catalogFilePath: join(root, "catalogs.json") });
try {
  const snapshot = await driver.createSession({ workspaceId: "probe", path: cwd });
  const reg = lastFixedModelRegistration();
  record("session opens", true, `config=${snapshot.config?.provider}:${snapshot.config?.modelId}`);
  record(
    "fixed pair resolved",
    snapshot.config?.provider === FIXED_PROVIDER_ID && snapshot.config?.modelId === FIXED_MODEL_ID,
    "",
  );
  record(
    "context window probed from /props",
    reg?.contextWindow === 131072 && reg?.contextWindowProbed === true,
    `window=${reg?.contextWindow} probed=${reg?.contextWindowProbed}`,
  );
  record(
    "models.json openai provider NOT the session model",
    snapshot.config?.provider !== "openai",
    "",
  );
  // a real turn resolves through the same endpoint: model + generation + settle
  const ref = snapshot.ref;
  await driver.sendUserMessage(ref, { text: "say hello" });
  record("turn completed against fake endpoint", true, "");
} catch (e) {
  record("session/turn path", false, String(e?.stack || e).slice(0, 600));
}
try {
  await driver.setSessionThinkingLevel({ workspaceId: "probe", sessionId: "no-session" }, "high");
  record("thinking re-selection refused", false, "no error thrown");
} catch (e) {
  record(
    "thinking re-selection refused",
    /pins thinking/.test(String(e?.message ?? e)),
    String(e?.message ?? e).slice(0, 120),
  );
}

serverProc.kill();
console.log(JSON.stringify(results, null, 2));
process.exit(results.every((r) => r.pass) ? 0 : 1);
