import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, ".runtime-cache", "dev-tray");
const output = path.join(outputDirectory, "AniMessenger.DevTray.exe");
const cscCandidates = [
  path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
  path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
];
const csc = cscCandidates.find((candidate) => fs.existsSync(candidate));
if (!csc) throw new Error("AniMessenger could not find the Windows .NET compiler required to build its tray companion.");
await fsp.mkdir(outputDirectory, { recursive: true });
execFileSync(csc, [
  "/nologo", "/target:winexe", "/optimize+", "/platform:anycpu",
  `/win32icon:${path.join(root, "installer", "AniMessenger.ico")}`,
  "/reference:System.dll", "/reference:System.Drawing.dll", "/reference:System.Windows.Forms.dll",
  `/out:${output}`,
  path.join(root, "installer", "AniMessenger.Tray.cs"),
], { stdio: "inherit" });
await fsp.writeFile(path.join(outputDirectory, "development-root.txt"), root + "\n", "utf8");
console.log(output);
if (process.argv.includes("--start")) {
  const tray = spawn(output, [], { cwd: root, detached: true, windowsHide: true, stdio: "ignore" });
  tray.unref();
}
