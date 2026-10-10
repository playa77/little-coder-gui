import assert from "node:assert/strict";
import test from "node:test";
import {
  createFixedModelExtension,
  FIXED_MODEL_API,
  FIXED_MAX_TOKENS,
  FIXED_MODEL_ID,
  FIXED_PROVIDER_ID,
  FIXED_TEMPERATURE,
  fixedModelRequiredMessage,
  fixedModelConfig,
  lastFixedModelRegistration,
  propsUrlFor,
  probeFixedModelContextWindow,
  requireFixedSessionModel,
  resetLastFixedModelRegistration,
  type ModelRuntime,
} from "../dist/fixed-model.js";

type RuntimeStub = Pick<requireFixedSessionModelParams, "getModel">;
type requireFixedSessionModelParams = Parameters<typeof requireFixedSessionModel>[0];

const runtimeWithFixed = (model: { provider: string; id: string } | undefined): RuntimeStub => ({
  getModel: (provider: string, modelId: string) =>
    provider === FIXED_PROVIDER_ID && modelId === FIXED_MODEL_ID ? model : undefined,
});

await test("requireFixedSessionModel accepts only the fixed pair", () => {
  const rt = runtimeWithFixed({ provider: FIXED_PROVIDER_ID, id: FIXED_MODEL_ID });
  assert.ok(requireFixedSessionModel(rt, FIXED_PROVIDER_ID, FIXED_MODEL_ID));
});

await test("requireFixedSessionModel rejects a mutated model id", () => {
  assert.throws(
    () =>
      requireFixedSessionModel(
        runtimeWithFixed({ provider: FIXED_PROVIDER_ID, id: FIXED_MODEL_ID }),
        FIXED_PROVIDER_ID,
        "Qwen3.8-27B",
      ),
    /this app runs only llamacpp:Qwen3.5-9B/,
  );
});

await test("requireFixedSessionModel rejects a foreign provider outright", () => {
  assert.throws(
    () =>
      requireFixedSessionModel(
        runtimeWithFixed({ provider: FIXED_PROVIDER_ID, id: FIXED_MODEL_ID }),
        "openai",
        FIXED_MODEL_ID,
      ),
    /not the app's single registered provider/,
  );
});

await test("requireFixedSessionModel fails session open when the pair is not registered", () => {
  const empty: RuntimeStub = { getModel: () => undefined };
  assert.throws(
    () => requireFixedSessionModel(empty, FIXED_PROVIDER_ID, FIXED_MODEL_ID),
    /Unknown model llamacpp:Qwen3.5-9B/,
  );
});

await test("fixedModelConfig carries the pinned sampling and limits", () => {
  const config = fixedModelConfig();
  assert.equal(config.api, FIXED_MODEL_API);
  const model = config.models?.[0];
  assert.ok(model);
  assert.equal(model.id, FIXED_MODEL_ID);
  assert.equal(model.maxTokens, FIXED_MAX_TOKENS);
  assert.deepEqual(model.samplingParams, { temperature: FIXED_TEMPERATURE });
});

await test("propsUrlFor strips /v1 like the upstream ladder", () => {
  assert.equal(propsUrlFor("http://127.0.0.1:8888/v1"), "http://127.0.0.1:8888/props");
  assert.equal(propsUrlFor("http://127.0.0.1:8888"), "http://127.0.0.1:8888/props");
});

await test("the probe accepts the real llama.cpp /props shape and sane values only", async () => {
  const fetchProps = (async () =>
    new Response(JSON.stringify({ default_generation_settings: { n_ctx: 131072 } }), {
      status: 200,
    })) as unknown as typeof fetch;
  assert.equal(
    await probeFixedModelContextWindow("http://127.0.0.1:9/v1", { fetchImpl: fetchProps }),
    131072,
  );

  const fetchTopLevel = (async () =>
    new Response(JSON.stringify({ n_ctx: 65536 }), { status: 200 })) as unknown as typeof fetch;
  assert.equal(
    await probeFixedModelContextWindow("http://127.0.0.1:9/v1", { fetchImpl: fetchTopLevel }),
    65536,
  );

  const fetch401 = (async () => new Response("denied", { status: 401 })) as unknown as typeof fetch;
  assert.equal(
    await probeFixedModelContextWindow("http://127.0.0.1:9/v1", { fetchImpl: fetch401 }),
    undefined,
  );

  const fetchGarbage = (async () =>
    new Response(JSON.stringify({ n_ctx: 42 }), { status: 200 })) as unknown as typeof fetch;
  assert.equal(
    await probeFixedModelContextWindow("http://127.0.0.1:9/v1", { fetchImpl: fetchGarbage }),
    undefined,
  );
});

await test("the extension registers after a failed probe with the declared window", async () => {
  resetLastFixedModelRegistration();
  const registered: Array<{ name: string; config: unknown }> = [];
  const ext = createFixedModelExtension({
    probeContextWindow: true,
  });
  const stub = {
    registerProvider: (name: string, config: unknown) => {
      registered.push({ name, config });
    },
  };
  await ext.factory(stub as never);
  assert.equal(registered.length, 1);
  assert.equal(registered[0]!.name, FIXED_PROVIDER_ID);
  const reg = lastFixedModelRegistration();
  assert.equal(reg?.contextWindowProbed, false);
  assert.equal(reg?.contextWindow, 32768);
  assert.equal(fixedModelRequiredMessage("x", "y").includes("llamacpp:Qwen3.5-9B"), true);
});
