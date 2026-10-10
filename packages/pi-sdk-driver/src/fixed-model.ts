import {
  ModelRuntime,
  type ExtensionAPI,
  type ProviderConfig,
} from "@earendil-works/pi-coding-agent";

/**
 * The one model this product runs. PROJECT-RULES §2: structural enforcement,
 * not a default — the driver registers exactly this provider/model pair as an
 * inline extension (WP-001's D6 mechanism), and every session open resolves
 * this pair through `requireSessionModel` before the session exists, failing
 * instead of falling back. The IPC routes that could express another choice
 * are removed with WP-004's UI cuts; the guarantee lives here either way.
 */
export const FIXED_PROVIDER_ID = "llamacpp";
export const FIXED_MODEL_ID = "Qwen3.5-9B";
export const FIXED_MODEL_API = "openai-completions";
export const FIXED_MAX_TOKENS = 4096;
export const FIXED_TEMPERATURE = 0.3;
export const FIXED_THINKING_LEVEL = "medium" as const;

/** llama.cpp's canonical local serving port (TECHNICAL-SPEC §5). */
export const FIXED_MODEL_BASE_URL = "http://127.0.0.1:8888/v1";
/** Turned into that env var's value in the endpoint URL env override. */
export const FIXED_MODEL_BASE_URL_ENV_VAR = "LLAMACPP_BASE_URL";
/** The apiKey models.json entry; pi resolves it from the environment at request time. */
export const FIXED_MODEL_API_KEY_ENV_VAR = "LLAMACPP_API_KEY";
/** Declared window, used as declared in TECHNICAL-SPEC §1 and replaced by the probe below. */
export const FIXED_MODEL_DECLARED_CONTEXT_WINDOW = 32768;
/** Probe timeout; same ladder upstream's llama-cpp-provider uses (/props first). */
export const FIXED_MODEL_CONTEXT_PROBE_TIMEOUT_MS = 2000;

/** Error suffix WP-002's tests grep for; matches ROADMAP "rejects anything else". */
export const FIXED_MODEL_RESOLVER_ERROR_SUFFIX = `this app runs only ${FIXED_PROVIDER_ID}:${FIXED_MODEL_ID}`;

export interface FixedModelRuntimeOptions {
  /** Probe the endpoint's /props for the live context window. Default true (probe-disabled env keeps it off). */
  readonly probeContextWindow?: boolean;
}

export interface FixedModelRegistrationResult {
  readonly providerId: string;
  readonly modelId: string;
  /** The window that was registered: probed when the endpoint answered, declared otherwise. */
  readonly contextWindow: number;
  /** True when the window came from a live /props (or models-listing fallback) probe. */
  readonly contextWindowProbed: boolean;
}

function fixedEndpointBaseUrl(): string {
  const fromEnv = process.env[FIXED_MODEL_BASE_URL_ENV_VAR];
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return FIXED_MODEL_BASE_URL;
}

export function fixedModelConfig(baseUrl?: string): ProviderConfig {
  return {
    baseUrl: baseUrl ?? fixedEndpointBaseUrl(),
    apiKey: FIXED_MODEL_API_KEY_ENV_VAR,
    api: FIXED_MODEL_API,
    models: [
      {
        id: FIXED_MODEL_ID,
        name: "Qwen3.5-9B (local llama.cpp)",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: FIXED_MODEL_DECLARED_CONTEXT_WINDOW,
        maxTokens: FIXED_MAX_TOKENS,
        samplingParams: { temperature: FIXED_TEMPERATURE },
      },
    ],
  };
}

/** Strip /v1 so the /props probe hits the server root, matching llama-server. */
export function propsUrlFor(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  return `${root}/props`;
}

/** K-multiple sanity check so a broken server cannot register 0, 42, NaN, or 1e12. */
function isPlausibleContextWindow(n: number): boolean {
  return n >= 1024 && n <= 1024 * 1024 && n % 1024 === 0;
}

function contextWindowFromProps(body: unknown): number | undefined {
  const j = body as { n_ctx?: unknown; default_generation_settings?: { n_ctx?: unknown } } | null;
  // llama.cpp serves the per-slot window at default_generation_settings.n_ctx;
  // some builds also expose a top-level n_ctx (upstream checks both).
  const n = Number(j?.default_generation_settings?.n_ctx ?? j?.n_ctx);
  if (!Number.isFinite(n) || !isPlausibleContextWindow(n)) {
    return undefined;
  }
  return n;
}

/** Pull the model entry out of a /v1/models listing when /props said nothing (router mode). */
function contextWindowFromModelList(body: unknown, modelId: string): number | undefined {
  const data = (body as { data?: Array<Record<string, unknown>> } | null)?.data;
  if (!Array.isArray(data)) {
    return undefined;
  }
  const entry = data.find((item) => item?.id === modelId);
  if (!entry) {
    return undefined;
  }
  const fromMeta = Number((entry.meta as { n_ctx?: unknown } | undefined)?.n_ctx);
  if (Number.isFinite(fromMeta) && isPlausibleContextWindow(fromMeta)) {
    return fromMeta;
  }
  const args = Array.isArray((entry.status as { args?: unknown[] } | undefined)?.args)
    ? (entry.status as { args: unknown[] }).args.map(String)
    : [];
  const i = args.indexOf("--ctx-size");
  const fromArgs = i >= 0 && i + 1 < args.length ? Number(args[i + 1]) : NaN;
  if (Number.isFinite(fromArgs) && isPlausibleContextWindow(fromArgs)) {
    return fromArgs;
  }
  return undefined;
}

/** Probe deps are injectable so tests can fake the endpoint. */
export interface ProbeContextWindowDeps {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly apiKey?: string;
}

/**
 * Upstream ladder: llama.cpp answers /props with `n_ctx` of the served model;
 * a router answers /v1/models with per-model entries. Best-effort — any
 * failure (down, 401, non-JSON, timeout) leaves the declared window standing
 * and never blocks session open.
 */
export async function probeFixedModelContextWindow(
  baseUrl: string,
  deps: ProbeContextWindowDeps = {},
): Promise<number | undefined> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const headers: Record<string, string> = {};
  if (deps.apiKey && deps.apiKey.length > 0) {
    headers.Authorization = `Bearer ${deps.apiKey}`;
  }
  const timeoutMs = deps.timeoutMs ?? FIXED_MODEL_CONTEXT_PROBE_TIMEOUT_MS;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const propsRes = await fetchImpl(propsUrlFor(baseUrl), { signal: abort.signal, headers });
    if (propsRes.ok) {
      return contextWindowFromProps(await propsRes.json());
    }
  } catch {
    // Fall through to /v1/models below; probes never throw.
  }
  try {
    const root = baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
    const modelsRes = await fetchImpl(`${root}/v1/models`, { signal: abort.signal, headers });
    if (!modelsRes.ok) {
      return undefined;
    }
    return contextWindowFromModelList(await modelsRes.json(), FIXED_MODEL_ID);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Inline pi extension that registers the fixed provider into a session's own
 * runtime. Loaded through `resourceLoaderOptions.extensionFactories` (D6),
 * so the runtime never sees pi's built-in provider list or any models.json
 * beyond what this module pins — registration is the structural enforcement.
 */
export function createFixedModelExtension(runtimeOptions: FixedModelRuntimeOptions = {}): {
  name: string;
  hidden: true;
  factory: (pi: ExtensionAPI) => Promise<void>;
} {
  return {
    name: "pi-gui-fixed-model",
    hidden: true,
    factory: async (pi) => {
      const baseUrl = fixedEndpointBaseUrl();
      let contextWindow = FIXED_MODEL_DECLARED_CONTEXT_WINDOW;
      let contextWindowProbed = false;
      if (runtimeOptions.probeContextWindow ?? process.env.PI_GUI_NO_CTX_PROBE !== "1") {
        const apiKey = process.env[FIXED_MODEL_API_KEY_ENV_VAR];
        const probed = await probeFixedModelContextWindow(baseUrl, apiKey ? { apiKey } : {});
        if (probed !== undefined) {
          contextWindow = probed;
          contextWindowProbed = true;
        }
      }
      const registration: FixedModelRegistrationResult = {
        providerId: FIXED_PROVIDER_ID,
        modelId: FIXED_MODEL_ID,
        contextWindow,
        contextWindowProbed,
      };
      const fixedConfig = fixedModelConfig(baseUrl);
      const [model] = fixedConfig.models ?? [];
      if (!model) {
        throw new Error("fixedModelConfig produced no model entry");
      }
      const probedModel = { ...model, contextWindow };
      pi.registerProvider(FIXED_PROVIDER_ID, {
        ...fixedConfig,
        models: [probedModel],
      });
      lastRegistration = registration;
    },
  };
}

/** Diagnostic hook: what the last session-open registered (already probed window, etc.). */
let lastRegistration: FixedModelRegistrationResult | undefined;

export function lastFixedModelRegistration(): FixedModelRegistrationResult | undefined {
  return lastRegistration;
}

export function resetLastFixedModelRegistration(): void {
  lastRegistration = undefined;
}

/**
 * The one model a session may resolve to. Anything else — a mutated model
 * declaration, a stale models.json, a caller passing a different pair — fails
 * session open. ROADMAP WP-002: "model resolver rejects anything else at
 * session open", never a silent fallback.
 */
export function requireFixedSessionModel(
  runtime: Pick<ModelRuntime, "getModel">,
  provider: string,
  modelId: string,
): NonNullable<ReturnType<ModelRuntime["getModel"]>> {
  if (provider !== FIXED_PROVIDER_ID || modelId !== FIXED_MODEL_ID) {
    throw new Error(fixedModelRequiredMessage(provider, modelId));
  }
  const model = runtime.getModel(provider, modelId);
  if (!model) {
    throw new Error(fixedModelRequiredMessage(provider, modelId));
  }
  return model;
}

export function fixedModelRequiredMessage(provider: string, modelId: string): string {
  if (provider === FIXED_PROVIDER_ID) {
    return `Unknown model ${provider}:${modelId}; ${FIXED_MODEL_RESOLVER_ERROR_SUFFIX}.`;
  }
  return `Provider "${provider}" is not the app's single registered provider; ${FIXED_MODEL_RESOLVER_ERROR_SUFFIX}.`;
}

/**
 * Runtime-only shape used by the probe lane: the fixed provider must be the
 * ONLY thing `getModels()` returns for a session-scoped runtime outside of
 * pi-gui's own built-ins, or the structural rule is violated.
 */
export function assertSingleFixedModel(runtime: Pick<ModelRuntime, "getModels">): void {
  const foreign = runtime.getModels().filter((model) => model.provider !== FIXED_PROVIDER_ID);
  if (foreign.length > 0) {
    throw new Error(
      `Fixed-model enforcement violated: ${foreign.length} model(s) registered outside ${FIXED_PROVIDER_ID} (${foreign
        .slice(0, 5)
        .map((model) => `${model.provider}:${model.id}`)
        .join(", ")}).`,
    );
  }
}
