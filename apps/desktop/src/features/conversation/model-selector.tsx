import { FIXED_MODEL_ID, FIXED_PROVIDER_ID } from "../../../contracts/fixed-model";
import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";

/**
 * WP-002: the model is structurally fixed to the driver's single registration,
 * so this control is a static badge, not a chooser. The registered model's
 * context window is shown when the runtime snapshot reports it.
 */
interface ModelSelectorProps {
  readonly runtime: RuntimeSnapshot | undefined;
}

export function ModelSelector({ runtime }: ModelSelectorProps) {
  const registered = runtime?.models.find(
    (model) => model.providerId === FIXED_PROVIDER_ID && model.modelId === FIXED_MODEL_ID,
  );
  return (
    <span className="model-selector">
      <span className="model-selector__anchor">
        <span className="model-selector__badge" data-testid="fixed-model-badge">
          {FIXED_PROVIDER_ID}:{FIXED_MODEL_ID}
        </span>
      </span>
      {registered ? <span className="model-selector__item-meta">{registered.label}</span> : null}
    </span>
  );
}
