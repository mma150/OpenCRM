// Proves the staged secret scan (scripts/scan-staged-secrets.sh): a staged credential
// is blocked, a harmless file passes, and a missing scanner fails loudly instead of
// passing. No dependencies. Run it with `pnpm test:secret-hook` from the repository root.
//
// Every case runs in a temporary git repository outside this repository. The fake
// credential is generated at run time, so no credential-shaped text is stored anywhere.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scanScript = path
  .resolve(path.dirname(fileURLToPath(import.meta.url)), "scan-staged-secrets.sh")
  .replaceAll("\\", "/");

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// A GitHub personal access token shape: a well-known prefix plus 36 random characters.
function fakeGithubToken() {
  const bytes = randomBytes(36);
  const body = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return ["gh", "p_"].join("") + body;
}

function makeRepoWithStagedFile(fileName, content) {
  const dir = mkdtempSync(path.join(tmpdir(), "opencrm-secret-hook-"));
  const run = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  run(["init", "--quiet"]);
  writeFileSync(path.join(dir, fileName), content);
  run(["add", fileName]);
  return dir;
}

// Environment copy with PATH replaced (on Windows the variable may be called "Path").
function envWithPath(newPath, extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() !== "path") env[key] = value;
  }
  return { ...env, PATH: newPath, ...extra };
}

function findOnPath(names) {
  for (const dir of (process.env.PATH ?? process.env.Path ?? "").split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (dir && existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function runScan(cwd, { shell = "sh", env = process.env } = {}) {
  return spawnSync(shell, [scanScript], { cwd, env, encoding: "utf8" });
}

const results = [];

function check(name, run) {
  const dirs = [];
  const outcome = run((dir) => {
    dirs.push(dir);
    return dir;
  });
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  results.push({ name, ...outcome });
}

// Case 1: a staged credential makes the scan fail.
check("staged credential is blocked", (track) => {
  const token = fakeGithubToken();
  const dir = track(makeRepoWithStagedFile("settings.txt", `github_token = "${token}"\n`));
  const result = runScan(dir);
  const output = `${result.stdout}${result.stderr}`;
  // The failure must be a real finding, not some other error, and must not echo the token.
  const reportsLeak = /leaks found/i.test(output);
  return {
    ok: result.status !== 0 && reportsLeak && !output.includes(token),
    detail: `exit ${result.status}, reports a leak: ${reportsLeak}, token not printed in clear: ${!output.includes(token)}`,
    output,
  };
});

// Case 2: a staged harmless file passes.
check("staged harmless file passes", (track) => {
  const dir = track(makeRepoWithStagedFile("notes.txt", "A harmless sentence about leads.\n"));
  const result = runScan(dir);
  return { ok: result.status === 0, detail: `exit ${result.status}`, output: `${result.stdout}${result.stderr}` };
});

// Case 3: with neither gitleaks nor docker on PATH the scan fails and says how to install one.
check("no scanner on PATH fails with install instructions", (track) => {
  const shellPath = findOnPath(["sh", "sh.exe"]);
  if (shellPath === undefined) return { ok: false, detail: "no sh on PATH to run the script", output: "" };
  const dir = track(makeRepoWithStagedFile("notes.txt", "A harmless sentence about leads.\n"));
  const emptyBin = track(mkdtempSync(path.join(tmpdir(), "opencrm-empty-bin-")));
  const result = runScan(dir, { shell: shellPath, env: envWithPath(emptyBin) });
  const output = `${result.stdout}${result.stderr}`;
  const explains = /gitleaks/i.test(output) && /docker/i.test(output);
  return { ok: result.status !== 0 && explains, detail: `exit ${result.status}, names gitleaks and Docker: ${explains}`, output };
});

// Case 4: docker on PATH but its daemon unreachable (and no gitleaks binary) also fails loudly.
check("unreachable Docker daemon fails with install instructions", (track) => {
  const dockerPath = findOnPath(["docker", "docker.exe"]);
  if (dockerPath === undefined) return { ok: true, detail: "SKIPPED: docker is not on PATH (case 3 covers it)", output: "" };
  const withoutGitleaks = (process.env.PATH ?? process.env.Path ?? "")
    .split(path.delimiter)
    .filter((dir) => dir && !existsSync(path.join(dir, "gitleaks")) && !existsSync(path.join(dir, "gitleaks.exe")))
    .join(path.delimiter);
  const dir = track(makeRepoWithStagedFile("notes.txt", "A harmless sentence about leads.\n"));
  const env = envWithPath(withoutGitleaks, { DOCKER_HOST: "tcp://127.0.0.1:1" });
  const result = runScan(dir, { env });
  const output = `${result.stdout}${result.stderr}`;
  const explains = /docker/i.test(output);
  return { ok: result.status !== 0 && explains, detail: `exit ${result.status}, explains: ${explains}`, output };
});

let failures = 0;
for (const result of results) {
  if (!result.ok) failures += 1;
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}  (${result.detail})`);
  if (!result.ok) console.log(result.output);
}
console.log(`\n${results.length - failures} of ${results.length} cases behaved as expected`);
process.exit(failures === 0 ? 0 : 1);
