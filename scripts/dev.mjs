import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const vite = path.join(root, "node_modules", "vite", "bin", "vite.js");
const lanMode = process.argv.includes("--lan");
const watchMode = !process.argv.includes("--no-watch");
const viteHost = lanMode ? "0.0.0.0" : "127.0.0.1";
const children = [
  spawn(process.execPath, [...(watchMode ? ["--watch"] : []), "server/index.mjs"], { cwd: root, stdio: "inherit", windowsHide: true }),
  spawn(process.execPath, [vite, "--host", viteHost, "--port", "5173"], { cwd: root, stdio: "inherit", windowsHide: true }),
];

if (lanMode) console.log("CharaSMS LAN mode: web UI available to devices on your private network; local AI services remain bound to this PC.");

function stop(signal = "SIGTERM") {
  for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
}
