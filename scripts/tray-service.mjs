import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.cwd());
const runtime = path.join(root, "runtime");
const command = String(process.argv[2] || "restart").toLowerCase();
if (!new Set(["start", "stop", "restart"]).has(command)) {
  throw new Error("Use start, stop, or restart.");
}

const trayPidFile = path.join(runtime, "tray.pid");
const trayPid = Number(fs.existsSync(trayPidFile) ? fs.readFileSync(trayPidFile, "utf8").trim() : 0);
if (!trayPid) throw new Error("The AniMessenger development tray is not running. Start it once with npm run dev:tray.");
try { process.kill(trayPid, 0); } catch { throw new Error("The AniMessenger development tray is not running. Start it once with npm run dev:tray."); }

fs.mkdirSync(runtime, { recursive: true });
const requestFile = path.join(runtime, "tray-command.request");
const temporary = requestFile + ".tmp";
fs.writeFileSync(temporary, command + "\n", "utf8");
fs.renameSync(temporary, requestFile);
console.log("Requested AniMessenger service " + command + " through the Windows tray.");
