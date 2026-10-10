/**
 * The single model pair this product runs, mirrored from
 * `@pi-gui/pi-sdk-driver/fixed-model` for renderer display. The driver owns the
 * registration; the renderer may only import driver types (renderer-boundary
 * guard), so the display constants live here and
 * `tests/unit/fixed-model-contract.spec.ts` asserts the two stay equal.
 */
export const FIXED_PROVIDER_ID = "llamacpp";
export const FIXED_MODEL_ID = "Qwen3.5-9B";

export function fixedModelLabel(): string {
  return `${FIXED_PROVIDER_ID}:${FIXED_MODEL_ID}`;
}
