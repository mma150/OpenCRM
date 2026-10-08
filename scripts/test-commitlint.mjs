// Proves the commit standard: pipes each fixture message to commitlint and
// checks that it is accepted or rejected as expected. No dependencies.
// Run it with `pnpm test:commitlint` from the repository root.
import { spawnSync } from "node:child_process";

const HEADER_LIMIT = 72;

// Builds "feat: <word>" with a header of exactly `length` characters (JavaScript
// string length, which is how commitlint counts). `word` starts the subject and
// is padded with the letter "a".
function headerOfLength(length, word = "") {
  const prefix = "feat: ";
  const padding = "a".repeat(length - prefix.length - word.length);
  return `${prefix}${word}${padding}`;
}

const accent = String.fromCharCode(0xe9); // one UTF-16 unit, not ASCII
const emoji = String.fromCodePoint(0x1f600); // two UTF-16 units

// The attribution fixtures are built from parts so this file does not itself
// contain a complete attribution marker.
const validHeader = "feat: add lead list";
const coAuthor = ["Co-Authored", "By: Someone <someone@example.com>"].join("-");
const generated = ["Generated with [", "Claude Code](https://claude.com/claude-code)"].join("");
const noReply = ["noreply", "anthropic.com"].join("@");

const fixtures = [
  // accepted
  { name: "simple feat", message: validHeader, accept: true },
  { name: "type with scope", message: "fix(api): handle null", accept: true },
  { name: "mixed-case word inside subject", message: "docs: add OpenAPI notes", accept: true },
  { name: "header of exactly 72 characters", message: headerOfLength(HEADER_LIMIT), accept: true },
  {
    name: "72 character header with a non-ASCII letter",
    message: headerOfLength(HEADER_LIMIT, `caf${accent}`),
    accept: true,
  },
  {
    name: "72 UTF-16 units with an emoji (71 code points)",
    message: headerOfLength(HEADER_LIMIT, `caf${emoji}`),
    accept: true,
  },
  // rejected: shape of the header
  { name: "no type", message: "Added stuff", accept: false, rule: "type-empty" },
  { name: "subject starts uppercase", message: "feat: Add thing", accept: false, rule: "subject-case" },
  { name: "type not allowed", message: "feature: add thing", accept: false, rule: "type-enum" },
  { name: "type with an empty subject", message: "feat:", accept: false, rule: "subject-empty" },
  { name: "empty message", message: "", accept: false },
  { name: "whitespace-only message", message: "\n", accept: false },
  { name: "header of 73 characters", message: headerOfLength(HEADER_LIMIT + 1), accept: false, rule: "header-max-length" },
  {
    name: "73 character header with a non-ASCII letter",
    message: headerOfLength(HEADER_LIMIT + 1, `caf${accent}`),
    accept: false,
    rule: "header-max-length",
  },
  {
    name: "73 UTF-16 units with an emoji (72 code points)",
    message: headerOfLength(HEADER_LIMIT + 1, `caf${emoji}`),
    accept: false,
    rule: "header-max-length",
  },
  // rejected: AI attribution
  {
    name: "Co-Authored-By trailer",
    message: `${validHeader}\n\n${coAuthor}`,
    accept: false,
    rule: "no-ai-attribution",
  },
  {
    name: "Co-Authored-By trailer in lower case",
    message: `${validHeader}\n\n${coAuthor.toLowerCase()}`,
    accept: false,
    rule: "no-ai-attribution",
  },
  {
    name: "generated-with marker in the body",
    message: `${validHeader}\n\n${generated}`,
    accept: false,
    rule: "no-ai-attribution",
  },
  {
    name: "anthropic no-reply address",
    message: `${validHeader}\n\nreviewed by ${noReply}`,
    accept: false,
    rule: "no-ai-attribution",
  },
];

function runCommitlint(message) {
  // `pnpm exec` resolves the root commitlint; shell is needed for pnpm.cmd on Windows.
  return spawnSync("pnpm", ["exec", "commitlint"], {
    input: message.endsWith("\n") || message === "" ? message : `${message}\n`,
    encoding: "utf8",
    shell: true,
  });
}

let failures = 0;
for (const fixture of fixtures) {
  const result = runCommitlint(fixture.message);
  const accepted = result.status === 0;
  // A rejection must come from the rule named in the fixture, not from some other failure.
  const reportedRule = fixture.rule === undefined || `${result.stdout}${result.stderr}`.includes(`[${fixture.rule}]`);
  const ok = accepted === fixture.accept && reportedRule;
  if (!ok) failures += 1;
  const expected = fixture.accept ? "accept" : "reject";
  const actual = accepted ? "accepted" : "rejected";
  console.log(`${ok ? "PASS" : "FAIL"}  expected ${expected}, ${actual}  ${fixture.name}`);
  if (!ok) console.log(`${result.stdout}${result.stderr}`);
}

console.log(`\n${fixtures.length - failures} of ${fixtures.length} fixtures behaved as expected`);
process.exit(failures === 0 ? 0 : 1);
