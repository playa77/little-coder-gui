// WP-001 probe v2: same staged flow but captures the raw HTTP request/response
// pair and the session's tool_execution events, to verify that (a) pi 1.0.0
// actually sent the tool definitions to the fake server and (b) write-guard's
// `tool_call` block fired. Writes evidence to evidence.log.
import { appendFileSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const LOG = "/tmp/ports/probe/evidence.log";
writeFileSync(LOG, "");
const mark = (s) => appendFileSync(LOG, `${s}\n`);

process.on("uncaughtException", (e) => {
  mark(`UNCAUGHT ${e?.stack || e}`);
  process.exit(3);
});
process.on("unhandledRejection", (e) => {
  mark(`UNHANDLED_REJECTION ${e?.stack || e}`);
  process.exit(4);
});

const HERE = "/tmp/ports/probe";
mark("importing pi");
const piPkg =
  await import("file:///home/daniel/projects/little-coder-gui/node_modules/@earendil-works/pi-coding-agent/dist/index.js");
mark("importing write-guard");
const writeGuardMod = await import("file:///tmp/ports/write-guard/index.ts");

mark("spawning fake server (log mode)");
const fakeProc = spawn(process.execPath, [path.join(HERE, "fake-server-log.mjs")], {
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
  fakeProc.stdout.on("data", function onData(d) {
    if (String(d).includes(":8901")) {
      fakeProc.stdout.off("data", onData);
      resolve();
    }
  });
  fakeProc.once("error", reject);
  setTimeout(() => reject(new Error("fake server never came up")), 10000);
});
mark("fake server on :8901");

let exitCode = 1;
try {
  const work = path.join(HERE, "workspace");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  writeFileSync(path.join(work, "probe-exists.txt"), "original contents — keep\n");

  const modelRuntime = await piPkg.ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(work, "auth.json"),
    refreshOnCreate: false,
  });
  modelRuntime.registerProvider("llamacpp", {
    name: "llamacpp",
    baseUrl: "http://127.0.0.1:8901/v1",
    apiKey: "probe-no-auth",
    authHeader: true,
    api: "openai-completions",
    models: [
      {
        id: "Qwen3.5-9B",
        name: "Qwen3.5-9B",
        api: "openai-completions",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 16384,
        maxTokens: 4096,
      },
    ],
  });
  const model = modelRuntime.getModel("llamacpp", "Qwen3.5-9B");
  mark(`model=${model?.provider}/${model?.id}`);

  const loader = new piPkg.DefaultResourceLoader({
    cwd: work,
    agentDir: path.join(work, "agent"),
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "You are a coding agent. Use tools to act.",
    extensionFactories: [{ name: "lc:write-guard", hidden: true, factory: writeGuardMod.default }],
  });
  await loader.reload();
  mark("loader reloaded");

  const { session } = await piPkg.createAgentSession({
    cwd: work,
    model,
    modelRuntime,
    resourceLoader: loader,
    sessionManager: piPkg.SessionManager.inMemory(),
    scopedModels: [{ model, thinkingLevel: "medium" }],
    thinkingLevel: "medium",
    tools: ["read", "bash", "edit", "write"],
  });
  mark("session created");

  // Session-level event rows the GUI transcript would consume.
  session.subscribe((e) => {
    if (e.type === "tool_execution_start") mark(`SESS tool_start ${e.toolName}`);
    else if (e.type === "tool_execution_end")
      mark(
        `SESS tool_end isError=${e.isError} text=${String(JSON.stringify(e.result ?? "")).slice(0, 400)}`,
      );
  });

  mark("prompting");
  await session.prompt("please overwrite probe-exists.txt with new text");
  mark("prompt settled");

  const fileAfter = readFileSync(path.join(work, "probe-exists.txt"), "utf8");
  const intact = fileAfter.includes("original contents");
  exitCode = intact ? 0 : 1;
  mark(`final intact=${intact} verdict=${intact ? "PASS" : "FAIL"}`);
} catch (e) {
  mark(`RUN ERROR ${e?.stack || e}`);
  exitCode = 5;
} finally {
  fakeProc.kill();
}
process.exit(exitCode);
