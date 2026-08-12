import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.ANIMESSENGER_PORT || 5173);
const url = "http://127.0.0.1:" + port;
const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || root, "AppData", "Local");
const appHome = process.env.ANIMESSENGER_HOME || path.join(localAppData, "AniMessenger");
const logsDir = path.join(appHome, "logs");

async function alreadyRunning() {
  try {
    const response = await fetch(url + "/api/health", { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

function openBrowser() {
  const child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], {
    windowsHide: true,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

if (!fs.existsSync(path.join(root, "dist", "index.html"))) {
  console.error("AniMessenger's application files are incomplete. Reinstall AniMessenger and try again.");
  process.exit(1);
}

if (await alreadyRunning()) {
  openBrowser();
  process.exit(0);
}

fs.mkdirSync(logsDir, { recursive: true });
const stdout = fs.openSync(path.join(logsDir, "runtime.out.log"), "a");
const stderr = fs.openSync(path.join(logsDir, "runtime.err.log"), "a");
const server = spawn(process.execPath, [path.join(root, "server", "index.mjs"), "--serve-dist"], {
  cwd: root,
  windowsHide: true,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    ANIMESSENGER_HOME: appHome,
  },
  stdio: ["ignore", stdout, stderr],
});

let ready = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (await alreadyRunning()) {
    ready = true;
    break;
  }
  if (server.exitCode !== null) break;
}

if (!ready) {
  console.error("AniMessenger could not start. Review " + path.join(logsDir, "runtime.err.log") + ".");
  server.kill();
  process.exit(1);
}

openBrowser();
console.log("AniMessenger is running at " + url + ". This window can be closed; your chats are stored in " + appHome + ".");
server.unref();
