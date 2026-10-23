import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimDevPid } from "../scripts/dev-instance.mjs";

test("a duplicate launch cannot overwrite or remove the active owner's tracking", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "animessenger-instance-"));
  try {
    const file = path.join(dir, "dev.pid");
    const release = claimDevPid(file, 101, () => true);
    assert.throws(() => claimDevPid(file, 202, () => true), /already running/);
    assert.equal(fs.readFileSync(file, "utf8"), "101");
    release();
    assert.equal(fs.existsSync(file), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("stale tracking is replaced but cleanup never removes a newer owner's PID", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "animessenger-instance-"));
  try {
    const file = path.join(dir, "dev.pid");
    fs.writeFileSync(file, "100");
    const release = claimDevPid(file, 202, () => false);
    assert.equal(fs.readFileSync(file, "utf8"), "202");
    fs.writeFileSync(file, "303");
    release();
    assert.equal(fs.readFileSync(file, "utf8"), "303");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
