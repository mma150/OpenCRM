#!/bin/sh
# Scans the staged changes for credentials with gitleaks. Used by .husky/pre-commit.
#
# Exit status: 0 only after a scan ran and found nothing. Non-zero when a secret is
# found, when the scanner fails, or when no scanner is available. The scan is never
# skipped: with neither a gitleaks binary nor a running Docker daemon the commit fails.
#
# Run it from the repository root (the hook does).

# One place for the pinned image; CI uses the same tag.
GITLEAKS_IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1"

# 1. A gitleaks binary on PATH reads the staged changes straight from git.
if command -v gitleaks >/dev/null 2>&1; then
  echo "scan-staged-secrets: scanning staged changes with the gitleaks binary"
  gitleaks git --staged --redact --no-banner
  exit $?
fi

# 2. Otherwise the pinned Docker image scans the added lines of the staged diff. The
#    diff is made on the host and piped in, because inside the container a linked git
#    worktree (a .git file pointing outside the mount) is not a repository, and
#    gitleaks reports "no leaks found" for it instead of failing.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "scan-staged-secrets: scanning staged changes with $GITLEAKS_IMAGE"
  DIFF_FILE=$(mktemp) || exit 1
  trap 'rm -f "$DIFF_FILE"' EXIT
  git diff --cached --no-color -U0 --diff-filter=ACMRT >"$DIFF_FILE" || {
    echo "scan-staged-secrets: could not read the staged changes from git" >&2
    exit 1
  }
  # Keep only added lines (drop the "+++ b/file" headers): removing a secret must not be blocked.
  grep '^+' "$DIFF_FILE" | grep -v -e '^+++ b/' -e '^+++ /dev/null' >"$DIFF_FILE.added"
  mv "$DIFF_FILE.added" "$DIFF_FILE"
  docker run --rm -i "$GITLEAKS_IMAGE" stdin --redact --no-banner <"$DIFF_FILE"
  exit $?
fi

# Only shell built-ins here: this branch must work even when PATH holds nothing.
{
  echo "scan-staged-secrets: no secret scanner is available, so this commit is stopped."
  echo "Staged changes must be scanned for credentials before every commit. Install one of:"
  echo "  - gitleaks:  https://github.com/gitleaks/gitleaks#installing  (the binary must be on your PATH)"
  echo "  - Docker:    https://docs.docker.com/get-started/get-docker/  (start Docker Desktop or the daemon)"
  echo "Then commit again."
} >&2
exit 1
