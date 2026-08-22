import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const blockedDirectories = [
  ".agents/",
  ".codex/",
  ".deps-staging/",
  ".npm-cache/",
  ".pnpm-store/",
  ".release-audit/",
  ".wrangler/",
  "backups/",
  "coverage/",
  "data/",
  "dist/",
  "logs/",
  "node_modules/",
  "outputs/",
  "runtime/",
  "work/",
];
const blockedFiles = new Set(["animessenger.config.json"]);
const textExtensions = new Set([
  ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".svg", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);
const sensitiveContent = [
  { label: "the creator's local identity", pattern: new RegExp("\\b(?:" + ["ja", "son"].join("") + "|" + ["balth", "azar"].join("") + ")\\b", "i") },
  { label: "a cloud-synced machine path", pattern: new RegExp("\\b" + ["one", "drive"].join("") + "\\b", "i") },
  { label: "a Windows user-profile path", pattern: /[A-Z]:\\Users\\[^\\\r\n]+/i },
  { label: "a macOS user-profile path", pattern: /\/Users\/[^/\r\n]+/ },
  { label: "a Linux home path", pattern: /\/home\/[^/\r\n]+/ },
  { label: "a private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "an OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: "a GitHub token", pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b/ },
  { label: "a GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { label: "a Hugging Face token", pattern: /\bhf_[A-Za-z0-9]{20,}\b/ },
  { label: "a private LAN address", pattern: /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/ },
];

function releaseFiles() {
  try {
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" }).trim();
    if (path.resolve(gitRoot) === path.resolve(root)) {
      const output = execFileSync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        { cwd: root, encoding: "utf8" },
      );
      return output
        .split("\0")
        .filter(Boolean)
        .map((file) => file.replaceAll("\\", "/"))
        .filter((file) => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile());
    }
  } catch {
    // A downloaded release archive has no Git metadata, so audit its files directly.
  }

  const found = [];
  function walk(directory, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`.replaceAll("\\", "/");
      const lower = relative.toLowerCase();
      if (entry.isDirectory()) {
        if (entry.name === ".git" || blockedDirectories.some((blocked) => `${lower}/`.startsWith(blocked))) continue;
        walk(path.join(directory, entry.name), `${relative}/`);
      } else if (entry.isFile()) {
        found.push(relative);
      }
    }
  }
  walk(root);
  return found;
}

const files = releaseFiles();
const problems = [];

for (const file of files) {
  const lower = file.toLowerCase();
  if (
    blockedFiles.has(lower)
    || /(^|\/)\w[\w.-]*\.config\.json$/.test(lower)
    || blockedDirectories.some((directory) => lower.startsWith(directory))
    || lower.endsWith(".tgz")
    || lower.endsWith(".tsbuildinfo")
  ) {
    problems.push(`${file}: private or generated path would enter the release`);
    continue;
  }

  if (!textExtensions.has(path.extname(lower))) continue;
  const contents = fs.readFileSync(path.join(root, file), "utf8");
  for (const check of sensitiveContent) {
    if (check.pattern.test(contents)) problems.push(`${file}: contains ${check.label}`);
  }
}

if (problems.length) {
  console.error("Release audit failed:\n");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Release audit passed: ${files.length} public files checked; no local data, machine paths, or obvious secrets found.`);
}
