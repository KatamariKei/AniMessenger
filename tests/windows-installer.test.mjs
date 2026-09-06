import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bundledNode } from "../scripts/windows-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the Windows package pins and verifies a private x64 Node runtime", () => {
  assert.match(bundledNode.version, /^24\.\d+\.\d+$/);
  assert.match(bundledNode.url, /^https:\/\/nodejs\.org\/dist\//);
  assert.match(bundledNode.archive, /win-x64\.zip$/);
  assert.match(bundledNode.sha256, /^[a-f0-9]{64}$/);
  const packager = read("scripts/package-windows.mjs");
  assert.match(packager, /checksum mismatch/i);
  assert.match(packager, /NODE-LICENSE\.txt/);
  assert.match(packager, /ZipFile.*CreateFromDirectory/s);
  assert.match(packager, /const payload = path\.join\(output, "support"\)/);
  assert.match(read("installer/Install-AniMessenger.cmd"), /support\\Install-AniMessenger\.ps1/);
});

test("the native tray companion owns installed start, open, stop, and update actions", () => {
  const tray = read("installer/AniMessenger.Tray.cs");
  const launchScript = read("scripts/launch.mjs");
  assert.match(tray, /Open AniMessenger/);
  assert.match(tray, /Start service/);
  assert.match(tray, /Stop service/);
  assert.match(tray, /Check for updates/);
  assert.match(tray, /AniMessenger stopped/);
  assert.match(tray, /Your chats are safe/);
  assert.match(tray, /runtime.*node\.exe/is);
  assert.match(tray, /tray\.pid/);
  assert.match(tray, /NotifyIcon/);
  assert.match(launchScript, /--no-open/);
  assert.match(launchScript, /detached:\s*true/);
  assert.match(launchScript, /rundll32\.exe/);
  assert.match(launchScript, /url\.dll,FileProtocolHandler/);
  const packager = read("scripts/package-windows.mjs");
  assert.match(packager, /AniMessenger\.Tray\.cs/);
  assert.match(packager, /AniMessenger\.Tray\.exe/);
  assert.match(packager, /target:winexe/);
});

test("the development tray controls one service and persists phone access", () => {
  const tray = read("installer/AniMessenger.Tray.cs");
  const dev = read("scripts/dev.mjs");
  const detached = read("scripts/start-detached.mjs");
  const builder = read("scripts/build-dev-tray.mjs");
  assert.match(tray, /Phone access: On/);
  assert.match(tray, /Phone access: Off/);
  assert.match(tray, /phone-access\.enabled/);
  assert.match(tray, /RequestDevelopmentShutdown/);
  assert.match(tray, /--lan/);
  assert.match(tray, /start-detached\.mjs/);
  assert.match(detached, /--no-watch/);
  assert.match(dev, /runtimeDirectory/);
  assert.match(read("vite.config.ts"), /ignored: \["\*\*\/release\/\*\*"/);
  assert.match(dev, /dev\.pid/);
  assert.match(builder, /development-root\.txt/);
  assert.match(builder, /--start/);
});

test("the browser distinguishes a stopped AniMessenger service from an Ollama outage", () => {
  const app = read("src/App.tsx");
  assert.match(app, /AniMessenger is stopped/);
  assert.match(app, /AniMessenger is running, but Ollama is not connected/);
  assert.match(app, /AniMessenger stopped/);
  assert.ok(app.indexOf("!serviceReachable") < app.indexOf("!health.ollama"));
});

test("the installer supports repair, update, rollback, and registered uninstall", () => {
  const installer = read("installer/Install-AniMessenger.ps1");
  for (const operation of ["Install", "Repair", "Update", "Downgrade"]) assert.match(installer, new RegExp(`"${operation}"`));
  assert.match(installer, /\.previous\.\$PID/);
  assert.match(installer, /\[IO\.Directory\]::Move/);
  assert.match(installer, /several attempts/);
  assert.match(installer, /CurrentVersion\\Uninstall\\AniMessenger/);
  assert.match(installer, /IconLocation/);
  assert.match(installer, /"AniMessenger\.ico"/);
  assert.match(installer, /AniMessenger\.Tray\.exe/);
  assert.doesNotMatch(installer, /\$stopShortcut/);
  assert.match(installer, /ie4uinit\.exe/);
  assert.match(installer, /DisplayIcon/);
  assert.equal(fs.existsSync(path.join(root, "installer", "AniMessenger.ico")), true);
  assert.match(read("scripts/package-windows.mjs"), /AniMessenger\.ico/);
  assert.equal(fs.existsSync(path.join(root, "installer", "AniMessenger.Tray.cs")), true);
  assert.match(installer, /Private chats and settings/);
  const uninstaller = read("installer/Uninstall-AniMessenger.ps1");
  assert.match(uninstaller, /tray\.pid/);
  assert.match(uninstaller, /PurgeData/);
  assert.match(uninstaller, /were preserved/);
});
