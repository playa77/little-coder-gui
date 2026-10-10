// Staged WP-001 probe: instruments each stage to /tmp/ports/probe/stages.log so
// a silent death shows exactly which stage killed the process.
import { appendFileSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const LOG = "/tmp/ports/probe/stages.log";
writeFileSync(LOG, "");
const mark = (s) => {
  appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`);
};

process.on("uncaughtException", (e) => {
  mark(`UNCAUGHT ${e?.stack || e}`);
  process.exit(3);
});
process.on("unhandledRejection", (e) => {
  mark(`UNHANDLED_REJECTION ${e?.stack || e}`);
  process.exit(4);
});
process.on("exit", (c) => mark(`process exit ${c}`));

mark("stage: importing pi");
const piPkg =
  await import("file:///home/daniel/projects/little-coder-gui/node_modules/@earendil-works/pi-coding-agent/dist/index.js");
mark(`stage: pi imported (${Object.keys(piPkg).length} exports)`);

mark("stage: importing write-guard TS");
const writeGuardMod = await import("file:///tmp/ports/write-guard/index.ts");
mark(`stage: write-guard imported, default=${typeof writeGuardMod.default}`);

const HERE = "/tmp/ports/probe";

mark("stage: spawning fake server");
const fakeProc = spawn(process.execPath, [path.join(HERE, "fake-server.mjs")], {
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
mark("stage: fake server on :8901");

let exitCode = 1;
try {
  const work = path.join(HERE, "workspace");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  writeFileSync(path.join(work, "probe-exists.txt"), "original contents — keep\n");
  mark("stage: workspace prepared");

  const baseUrl = "http://127.0.0.1:8901/v1";
  const modelRuntime = await piPkg.ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(work, "auth.json"),
    refreshOnCreate: false,
  });

  modelRuntime.registerProvider("llamacpp", {
    name: "llamacpp",
    baseUrl,
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
  mark("stage: provider registered");
  const model = modelRuntime.getModel("llamacpp", "Qwen3.5-9B");
  mark(`stage: model resolved=${model ? `${model.provider}/${model.id}` : "UNDEFINED"}`);

  const loader = new piPkg.DefaultResourceLoader({
    cwd: work,
    agentDir: path.join(work, "agent"),
    noExtensions: false,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "You are a coding agent. Use tools to act.",
    extensionFactories: [{ name: "lc:write-guard", hidden: true, factory: writeGuardMod.default }],
  });
  mark("stage: loader constructed; reloading");
  await loader.reload();
  mark("stage: loader reloaded");

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
  mark("stage: session created");

  const events = [];
  session.subscribe((e) => {
    if (e.type !== "message_update") events.push(e);
  });
  mark("stage: prompting");
  await session.prompt("please overwrite probe-exists.txt with new text");
  mark(`stage: prompt settled, events=${events.length}`);

  const summarize = (ev) => {
    if (ev.type === "tool_execution_start")
      return `tool_start ${ev.toolName} ${JSON.stringify(ev.args)}`;
    if (ev.type === "tool_execution_end")
      return `tool_end isError=${ev.isError} ${String(ev.result?.output?.content ?? ev.result ?? "").slice(0, 220)}`;
    if (ev.type === "agent_end") return "agent_end";
    if (ev.type === "message_start") return `message_start role=${ev.message?.role}`;
    return ev.type;
  };
  for (const ev of events) mark(summarize(ev));

  const fileAfter = readFileSync(path.join(work, "probe-exists.txt"), "utf8");
  const intact = fileAfter.includes("original contents");
  exitCode = intact ? 0 : 1;
  mark(`stage: final — intact=${intact} verdict=${intact ? "PASS" : "FAIL"}`);
} finally {
  fakeProc.kill();
}
process.exit(exitCode);
