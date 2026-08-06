import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const root = process.cwd();
const logs = path.join(root, "logs");
fs.mkdirSync(logs, { recursive: true });
const stdout = fs.openSync(path.join(logs, "runtime.out.log"), "a");
const stderr = fs.openSync(path.join(logs, "runtime.err.log"), "a");
const lanMode = process.argv.includes("--lan");
const child = spawn(process.execPath, [path.join(root, "scripts", "dev.mjs"), "--no-watch", ...(lanMode ? ["--lan"] : [])], {
  cwd: root,
  detached: true,
  windowsHide: true,
  stdio: ["ignore", stdout, stderr],
});
child.unref();
console.log("CharaSMS detached process started with PID " + child.pid + ".");
