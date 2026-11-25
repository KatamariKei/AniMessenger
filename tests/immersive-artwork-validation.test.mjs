import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import { configureImmersive, updateAsset } from "../server/immersive/live-server.mjs";

function png({ width = 10, height = 10, rgb = false, transparent = 0 } = {}) {
  const chunk = (type, data) => {
    const label = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    let crc = 0xffffffff;
    for (const value of Buffer.concat([label, data])) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, label, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = rgb ? 2 : 6;
  const channels = rgb ? 3 : 4, raw = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * (width * channels + 1) + 1 + x * channels;
    raw[at] = 120; raw[at + 1] = 80; raw[at + 2] = 40;
    if (!rgb) raw[at + 3] = y * width + x < transparent ? 0 : 255;
  }
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("VN accepts valid foreground PNGs regardless of alpha and recovers rejected outputs without generating again", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "animessenger-artwork-validation-"));
  t.after(() => { assert.equal(path.dirname(root), os.tmpdir()); return fs.rm(root, { recursive: true, force: true }); });
  await configureImmersive("http://fixture", root);
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let image, requests = [];
  globalThis.fetch = async url => {
    requests.push(String(url));
    if (String(url).includes("/history/")) return Response.json({ saved: { outputs: { save: { images: [{ filename: "fixture.png", type: "output" }] } } } });
    if (String(url).includes("/view?")) return new Response(image, { headers: { "content-type": "image/png" } });
    throw new Error("Unexpected generation request: " + url);
  };
  const settings = { config: { comfyUrl: "http://fixture" } };
  for (const example of [
    { name: "opaque RGBA", image: png() },
    { name: "one percent transparent", image: png({ transparent: 1 }) },
    { name: "fully transparent", image: png({ transparent: 100 }) },
    { name: "RGB without alpha", image: png({ rgb: true }) },
    { name: "previous alpha rejection", image: png(), legacy: true },
    { name: "previous automatic recovery not yet submitted", image: png(), legacyQueued: true },
    { name: "wrong dimensions", image: png({ width: 2 }), error: /dimensions/ },
    { name: "corrupt output", image: Buffer.from("not a PNG"), error: /not a PNG/ },
  ]) {
    const asset = { key: randomBytes(32).toString("hex"), kind: "foreground", width: 10, height: 10 };
    image = example.image; requests = [];
    await fs.writeFile(path.join(root, "immersive", asset.key + ".job.json"), JSON.stringify({
      status: example.legacy ? "error" : example.legacyQueued ? "new" : "pending", attempt: 0, promptId: "saved",
      ...(example.legacyQueued ? { alphaRecoveryUsed: true } : {}),
      ...(example.legacy ? { error: "The foreground did not contain usable transparency. Retry artwork, or test a different scene." } : {}),
    }));
    const result = await updateAsset(asset, settings, false);
    assert.equal(result.status, example.error ? "error" : "complete", example.name);
    assert.equal(result.attempt, 0, "no extra generation attempt");
    assert.equal(requests.length, 2);
    if (example.error) assert.match(result.error, example.error);
    else {
      assert.deepEqual(await fs.readFile(path.join(root, "immersive", asset.key + ".png")), image);
      await updateAsset(asset, settings, false);
      assert.equal(requests.length, 2, "cached artwork is reused");
    }
  }
});
