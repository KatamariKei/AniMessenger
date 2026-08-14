import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveComfyOutputFile } from "../server/comfy.mjs";

test("completed Comfy images resolve safely inside the configured output folder", () => {
  const url = new URL("http://localhost/api/images/view?filename=ANIMA_00007_.png&subfolder=AniMessenger%5CExample+Hero%5C2026-07-16&type=output");
  const resolved = resolveComfyOutputFile("C:\\ComfyUI\\output", url);
  assert.equal(resolved, path.resolve("C:\\ComfyUI\\output", "AniMessenger", "Example Hero", "2026-07-16", "ANIMA_00007_.png"));
});

test("Comfy output fallback rejects traversal and non-output files", () => {
  assert.throws(() => resolveComfyOutputFile("C:\\ComfyUI\\output", new URL("http://localhost/api/images/view?filename=secret.png&subfolder=..%5C..&type=output")), /Invalid/);
  assert.throws(() => resolveComfyOutputFile("C:\\ComfyUI\\output", new URL("http://localhost/api/images/view?filename=temp.png&type=temp")), /valid/);
});
