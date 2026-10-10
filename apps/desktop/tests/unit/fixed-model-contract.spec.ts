import { expect, test } from "@playwright/test";
import { FIXED_MODEL_ID, FIXED_PROVIDER_ID } from "../../contracts/fixed-model";

// The driver is the single owner of the pair; the renderer mirror in
// contracts/fixed-model.ts exists only because the renderer-boundary guard
// forbids runtime imports of the driver package. If the driver constants ever
// change, this test fails until the mirror is updated in the same PR.
test("the fixed-model contract mirror keeps the driver-side constants", async () => {
  const driver = (await import("@pi-gui/pi-sdk-driver/fixed-model")) as {
    FIXED_PROVIDER_ID: string;
    FIXED_MODEL_ID: string;
  };
  expect(FIXED_PROVIDER_ID).toBe(driver.FIXED_PROVIDER_ID);
  expect(FIXED_MODEL_ID).toBe(driver.FIXED_MODEL_ID);
});
