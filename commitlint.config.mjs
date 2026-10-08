// The OpenCRM commit standard as configuration (documented in docs/standards/commits.md).
// Used by the local commit-msg hook and by the pull request title check in CI.

// The ten allowed commit types.
export const TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "test",
  "chore",
  "ci",
  "build",
  "perf",
];

// Fails when the raw message carries a Co-Authored-By trailer or an AI attribution marker.
const AI_ATTRIBUTION = /co-authored-by:|generated with \[?claude|noreply@anthropic\.com/i;

const noAiAttribution = ({ raw }) => [
  !AI_ATTRIBUTION.test(raw ?? ""),
  "commit message must not contain Co-Authored-By or any AI attribution",
];

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [{ rules: { "no-ai-attribution": noAiAttribution } }],
  rules: {
    "type-enum": [2, "always", TYPES],
    // Counted as the JavaScript string length of the header line.
    "header-max-length": [2, "always", 72],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "no-ai-attribution": [2, "always"],
  },
};
