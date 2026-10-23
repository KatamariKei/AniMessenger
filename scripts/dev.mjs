import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { claimDevPid, portIsOccupied } from "./dev-instance.mjs";

const root = process.cwd();
const vite = path.join(root, "node_modules", "vite", "bin", "vite.js");
const lanMode = process.argv.includes("--lan");
const watchMode = !process.argv.includes("--no-watch");
const viteHost = lanMode ? "0.0.0.0" : "127.0.0.1";
const runtimeDirectory = path.join(root, "runtime");
const pidFile = path.join(runtimeDirectory, "dev.pid");
fs.mkdirSync(runtimeDirectory, { recursive: true });
if ((await Promise.all([portIsOccupied(5173), portIsOccupied(Number(process.env.PORT || 5174))])).some(Boolean)) {
  console.error("AniMessenger's service or web port is already occupied. No second instance was started and existing tracking was left untouched.");
  process.exit(1);
}
const releasePid = claimDevPid(pidFile);
const children = [
  spawn(process.execPath, [...(watchMode ? ["--watch"] : []), "server/index.mjs"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, ANIMESSENGER_DEV_MANAGED: "1" },
  }),
  spawn(process.execPath, [vite, "--host", viteHost, "--port", "5173", "--strictPort"], { cwd: root, stdio: "inherit", windowsHide: true }),
];

if (lanMode) console.log("AniMessenger LAN mode: web UI available to devices on your private network; local AI services remain bound to this PC.");

let stopping = false;

function stop(signal = "SIGTERM") {
  stopping = true;
  for (const child of children) child.kill(signal);
}

function removePidFile() {
  releasePid();
}

process.on("SIGINT", () => { removePidFile(); stop("SIGINT"); });
process.on("SIGTERM", () => { removePidFile(); stop("SIGTERM"); });
process.on("exit", removePidFile);
for (const child of children) {
  child.on("exit", (code) => {
    if (stopping) return;
    process.exitCode = code || 0;
    stop();
  });
}
