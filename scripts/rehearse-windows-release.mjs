import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Isolated install/update rehearsal only. Never register shortcuts, launch a tray,
// touch the real private home, call a model, or replace the live installation.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")).version;
const baselineVersion = process.argv[2] || "0.6.0";
assert.match(baselineVersion, /^\d+\.\d+\.\d+$/, "Pass a baseline release version such as 0.6.0.");
const release = path.join(root, "release");
const sandbox = await fs.mkdtemp(path.join(release, `rehearsal-v${version}-`));
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const inside = value => {
  const relative = path.relative(sandbox, path.resolve(value));
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Rehearsal target must stay inside its unique sandbox.");
  return value;
};
function extract(zip, destination) {
  inside(destination);
  execFileSync("powershell.exe", ["-NoProfile", "-Command",
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${literal(zip)}, ${literal(destination)})`], { stdio: "pipe" });
}
function install(source, app, home) {
  inside(app); inside(home); inside(app + ".staging"); inside(app + ".previous");
  return execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
    path.join(source, "support", "Install-AniMessenger.ps1"), "-InstallRoot", app, "-PrivateHome", home,
    "-NoLaunch", "-NoShortcuts", "-NoRegistration"], { encoding: "utf8" });
}
async function boot(app, home, expectedThreads) {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(path.join(app, "runtime", "node.exe"), [path.join(app, "server", "index.mjs"), "--serve-dist"], {
    cwd: app, windowsHide: true, env: { ...process.env, ANIMESSENGER_HOME: home, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", data => { logs += data; });
  child.stderr.on("data", data => { logs += data; });
  try {
    const url = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error("Packaged server exited: " + logs);
      try { ready = (await fetch(url + "/api/runtime", { signal: AbortSignal.timeout(500) })).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "Packaged server did not start: " + logs);
    const runtime = await (await fetch(url + "/api/runtime")).json();
    assert.equal(runtime.standalone, true);
    const page = await (await fetch(url)).text();
    assert.match(page, /assets\/index-/);
    const asset = page.match(/src="([^"]+\.js)"/)[1];
    assert.equal((await fetch(url + asset)).status, 200);
    const result = await (await fetch(url + "/api/threads")).json();
    assert.equal(result.threads.length, expectedThreads);
    if (expectedThreads) {
      const thread = await (await fetch(url + "/api/threads/release-fixture")).json();
      assert.equal(thread.thread.memories.length, 1);
      const health = await (await fetch(url + "/api/threads/release-fixture/memories/health")).json();
      assert.equal(health.health.total, 1);
      assert.equal(health.health.active, 1);
      const account = await (await fetch(url + "/api/achievements/tally", { method: "POST" })).json();
      assert.equal(account.points, 10);
    }
    return { standalone: true, frontend: true, threads: expectedThreads, sharedModulesLoaded: true };
  } finally {
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once("exit", resolve)); }
    await fs.writeFile(path.join(home, "rehearsal-server.log"), logs);
  }
}

const zip = path.join(release, `AniMessenger-Windows-v${version}.zip`);
const candidate = inside(path.join(sandbox, "candidate"));
extract(zip, candidate);
const audit = execFileSync(process.execPath, [path.join(root, "scripts", "release-audit.mjs")], { cwd: candidate, encoding: "utf8" }).trim();
const freshApp = inside(path.join(sandbox, "fresh-app"));
const freshHome = inside(path.join(sandbox, "fresh-home"));
install(candidate, freshApp, freshHome);
assert.equal(JSON.parse(await fs.readFile(path.join(freshApp, "release.json"), "utf8")).version, version);
await fs.access(path.join(freshApp, "shared", "achievements.json"));
// Block optional external services during the rehearsal.
const config = { userName: "Release Tester", ollamaUrl: "http://127.0.0.1:9", comfyUrl: "http://127.0.0.1:9",
  animadexUrl: "http://127.0.0.1:9", proactiveEnabled: false, soundEnabled: false };
await fs.writeFile(path.join(freshHome, "animessenger.config.json"), JSON.stringify(config));
const fresh = await boot(freshApp, freshHome, 0);

const baseline = inside(path.join(sandbox, "baseline"));
extract(path.join(release, `AniMessenger-Windows-v${baselineVersion}.zip`), baseline);
const upgradeApp = inside(path.join(sandbox, "upgrade-app"));
const upgradeHome = inside(path.join(sandbox, "upgrade-home"));
install(baseline, upgradeApp, upgradeHome);
const thread = { id: "release-fixture", character: { id: "release-fixture", name: "Fixture" },
  messages: [{ id: "m1", from: "user", text: "Please remember that I like painting.", time: "2026-10-01T12:00:00Z" }],
  memories: [{ id: "memory-1", kind: "preference", text: "The user likes painting.", importance: 3, userEdited: true,
    keywords: ["painting"], sourceMessageIds: ["m1"], createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z" }],
  relationship: 29, scene: { location: "art studio", presence: "together" },
  memoryCheckpoint: { lastReviewedMessageId: "m1", lastReviewedAt: "2026-10-01T12:01:00Z" } };
const award = { id: crypto.createHash("sha256").update("release-fixture\0heartfelt").digest("hex"),
  characterId: "release-fixture", achievementId: "heartfelt", points: 10, definitionVersion: 1,
  earnedAt: "2026-10-01T12:00:00Z", notify: false };
const fixtures = {
  "animessenger.config.json": JSON.stringify(config),
  "data/threads/release-fixture.json": JSON.stringify(thread),
  "data/achievement-awards.json": JSON.stringify({ version: 1, awards: [award] }),
  "data/uploads/release-fixture.txt": "Synthetic uploaded-content preservation fixture.",
  "data/memory-scans/release-fixture.json": JSON.stringify({ characterId: "release-fixture", status: "complete", added: 1 }),
  "data/revelations/preservation-fixture.json": JSON.stringify({ synthetic: true, confirmedIds: ["one", "two", "three"], artwork: "preservation-only" }),
};
for (const [relative, contents] of Object.entries(fixtures)) {
  const file = path.join(upgradeHome, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
}
const operation = install(candidate, upgradeApp, upgradeHome);
assert.match(operation, /Update complete/);
for (const [relative, contents] of Object.entries(fixtures)) assert.equal(await fs.readFile(path.join(upgradeHome, relative), "utf8"), contents, relative + " changed during installation");
await fs.access(path.join(upgradeApp, "shared", "achievements.json"));
const upgrade = await boot(upgradeApp, upgradeHome, 1);
const modelFiles = ["anima-recommended-api.json", "anima-recommended-api.mapping.json", "animessenger-anima-assets.json"];
for (const file of modelFiles) {
  assert.deepEqual(await fs.readFile(path.join(candidate, "support", "workflows", file)),
    await fs.readFile(path.join(baseline, "support", "workflows", file)), "Default model asset changed: " + file);
}
const report = { version, baselineVersion, audit, fresh, upgrade, privateFilesPreservedByteForByte: Object.keys(fixtures).length,
  defaultWorkflowAndAssetsUnchangedFrom: baselineVersion,
  zipSha256: crypto.createHash("sha256").update(await fs.readFile(zip)).digest("hex"),
  manualDesktopMobileAndSecondPC: "not tested by this automated rehearsal" };
await fs.writeFile(path.join(sandbox, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, reportFile: path.join(sandbox, "report.json") }, null, 2));
