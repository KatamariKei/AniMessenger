import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundledNode } from "./windows-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await fsp.readFile(path.join(root, "package.json"), "utf8"));
const releaseRoot = path.join(root, "release");
const output = path.join(releaseRoot, "AniMessenger-Windows");
const payload = path.join(output, "support");
const zipOutput = path.join(releaseRoot, `AniMessenger-Windows-v${packageJson.version}.zip`);
const cacheRoot = path.join(root, ".runtime-cache");
const archivePath = path.join(cacheRoot, bundledNode.archive);
const extractedRoot = path.join(cacheRoot, `node-v${bundledNode.version}-win-x64`);
const psLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const cscCandidates = [
  path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
  path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
];

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

async function ensureArchive() {
  await fsp.mkdir(cacheRoot, { recursive: true });
  if (fs.existsSync(archivePath) && await sha256(archivePath) === bundledNode.sha256) return;
  await fsp.rm(archivePath, { force: true });
  console.log(`Downloading the private Node.js ${bundledNode.version} runtime…`);
  const response = await fetch(bundledNode.url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Node.js runtime download failed with HTTP ${response.status}.`);
  const partial = archivePath + ".part";
  await fsp.rm(partial, { force: true });
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
  const digest = await sha256(partial);
  if (digest !== bundledNode.sha256) {
    await fsp.rm(partial, { force: true });
    throw new Error(`Node.js runtime checksum mismatch. Expected ${bundledNode.sha256}, received ${digest}.`);
  }
  await fsp.rename(partial, archivePath);
}

async function ensureRuntime() {
  const nodeExe = path.join(extractedRoot, "node.exe");
  const license = path.join(extractedRoot, "LICENSE");
  if (fs.existsSync(nodeExe) && fs.existsSync(license)) return { nodeExe, license };
  await ensureArchive();
  await fsp.rm(extractedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -LiteralPath ${psLiteral(archivePath)} -DestinationPath ${psLiteral(cacheRoot)} -Force`,
  ], { stdio: "inherit" });
  if (!fs.existsSync(nodeExe) || !fs.existsSync(license)) throw new Error("The downloaded Node.js archive did not contain the expected Windows runtime files.");
  return { nodeExe, license };
}

const runtime = await ensureRuntime();
await fsp.rm(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
await fsp.rm(zipOutput, { force: true });
await fsp.mkdir(path.join(payload, "scripts"), { recursive: true });
await fsp.mkdir(path.join(payload, "runtime"), { recursive: true });
for (const folder of ["dist", "server", "workflows"]) {
  await fsp.cp(path.join(root, folder), path.join(payload, folder), { recursive: true });
}
await Promise.all([
  fsp.copyFile(path.join(root, "scripts", "launch.mjs"), path.join(payload, "scripts", "launch.mjs")),
  fsp.copyFile(path.join(root, "installer", "AniMessenger.ico"), path.join(payload, "AniMessenger.ico")),
  fsp.copyFile(path.join(root, "installer", "Install-AniMessenger.cmd"), path.join(output, "Install-AniMessenger.cmd")),
  fsp.copyFile(path.join(root, "installer", "Install-AniMessenger.ps1"), path.join(payload, "Install-AniMessenger.ps1")),
  fsp.copyFile(path.join(root, "installer", "Uninstall-AniMessenger.ps1"), path.join(payload, "Uninstall-AniMessenger.ps1")),
  fsp.copyFile(path.join(root, "LICENSE"), path.join(payload, "LICENSE")),
  fsp.copyFile(path.join(root, "docs", "WINDOWS-INSTALLER.md"), path.join(output, "README.txt")),
  fsp.copyFile(path.join(root, "docs", "WINDOWS-INSTALLER.md"), path.join(payload, "README-INSTALL.txt")),
  fsp.copyFile(runtime.nodeExe, path.join(payload, "runtime", "node.exe")),
  fsp.copyFile(runtime.license, path.join(payload, "runtime", "NODE-LICENSE.txt")),
]);
const csc = cscCandidates.find((candidate) => fs.existsSync(candidate));
if (!csc) throw new Error("AniMessenger could not find the Windows .NET compiler required to build its tray companion.");
const versionParts = packageJson.version.split(".").map((part) => Number.parseInt(part, 10));
while (versionParts.length < 4) versionParts.push(0);
const assemblyVersion = versionParts.slice(0, 4).join(".");
const versionSource = path.join(cacheRoot, "AniMessenger.Tray.Version.cs");
await fsp.writeFile(versionSource, [
  "using System.Reflection;",
  `[assembly: AssemblyVersion(\"${assemblyVersion}\")]`,
  `[assembly: AssemblyFileVersion(\"${assemblyVersion}\")]`,
  `[assembly: AssemblyInformationalVersion(\"${packageJson.version}\")]`,
  "",
].join("\r\n"));
execFileSync(csc, [
  "/nologo", "/target:winexe", "/optimize+", "/platform:anycpu",
  `/win32icon:${path.join(root, "installer", "AniMessenger.ico")}`,
  "/reference:System.dll", "/reference:System.Drawing.dll", "/reference:System.Windows.Forms.dll",
  `/out:${path.join(payload, "AniMessenger.Tray.exe")}`,
  path.join(root, "installer", "AniMessenger.Tray.cs"), versionSource,
], { stdio: "inherit" });
await fsp.writeFile(path.join(payload, "release.json"), JSON.stringify({
  schemaVersion: 1,
  name: "AniMessenger",
  version: packageJson.version,
  runtime: { name: "Node.js", version: bundledNode.version, architecture: "x64" },
}, null, 2) + "\n");
await fsp.writeFile(path.join(payload, "runtime", "README.txt"), [
  `AniMessenger includes a private Node.js ${bundledNode.version} x64 runtime.`,
  "It is used only to run AniMessenger and does not install Node.js system-wide.",
  "See NODE-LICENSE.txt for the Node.js and bundled dependency licenses.",
  "",
].join("\r\n"));

execFileSync("powershell.exe", [
  "-NoProfile",
  "-Command",
  `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${psLiteral(output)}, ${psLiteral(zipOutput)}, [IO.Compression.CompressionLevel]::Optimal, $false)`,
], { stdio: "inherit" });

console.log("Windows package prepared at " + output);
console.log("Distributable archive prepared at " + zipOutput);
