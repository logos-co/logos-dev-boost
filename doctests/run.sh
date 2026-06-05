#!/usr/bin/env bash
#
# Execute the dev-boost scaffold doc-tests end-to-end and regenerate their
# Markdown.
#
# The runner is the shared `doctest` CLI
# (https://github.com/logos-co/logos-doctest), invoked directly via its flake.
# For each spec, `doctest run` executes every command in a temp directory
# (scaffolding a project with this dev-boost commit, building it, introspecting
# it, running its tests, and exercising it), then `doctest generate` renders the
# spec to Markdown under outputs/; a final `doctest clean` strips build artifacts
# so only the generated docs and example source remain.
#
# Specs covered:
#   - dev-boost-scaffold-module.test.yaml        pure C++ module
#   - dev-boost-scaffold-external-lib.test.yaml  module wrapping a C library
#   - dev-boost-scaffold-ui-qml.test.yaml        pure QML UI app (headless UI test)
#
# Run a single spec by passing its name (with or without .test.yaml):
#   ./run.sh dev-boost-scaffold-external-lib
#
# To run against a local logos-doctest checkout instead of the published flake,
# set DOCTEST, e.g.:  DOCTEST="nix run path:../../logos-doctest --" ./run.sh
#
# The build needs a filesystem that both lets git create loose objects and is not
# mounted noexec (the specs git-add scaffolded projects and the QML spec launches
# a headless app that dlopen()s its plugin). Normally that's ./outputs and the
# build runs in place. In sandboxes where the checkout can't host it — e.g. a
# `fakeowner` bind mount (Docker Desktop / OrbStack) that rejects git's 0444
# object temp files, or a noexec mount that fails dlopen — the script auto-stages
# the build in the first usable directory among $XDG_RUNTIME_DIR / $TMPDIR /
# $HOME / /var/tmp / /tmp and copies the cleaned result back into ./outputs. If
# none of those work it prints why each was rejected; force a specific staging
# dir with DOCTEST_BUILD_DIR (e.g. DOCTEST_BUILD_DIR="$HOME/.cache/logos-doctest").
#
set -euo pipefail

# Run from this doctests/ directory regardless of where the script is invoked from.
cd "$(dirname "$0")"

# The doctest CLI. Override by exporting DOCTEST (space-separated command).
read -r -a DOCTEST <<< "${DOCTEST:-nix run github:logos-co/logos-doctest --}"
OUTPUT_DIR="./outputs"

# Specs to run. Override by passing one spec name as $1.
SPECS=(
  "dev-boost-scaffold-module.test.yaml"
  "dev-boost-scaffold-external-lib.test.yaml"
  "dev-boost-scaffold-ui-qml.test.yaml"
)
if [ "${1:-}" != "" ]; then
  one="$1"
  [ "${one%.test.yaml}" = "$one" ] && one="${one}.test.yaml"
  SPECS=("$one")
fi

# Build the doc-tests against THIS repo's current commit rather than the latest
# published flake. The specs scaffold with
# `github:logos-co/logos-dev-boost{release}`, and the pin below makes {release}
# expand to $COMMIT — so the scaffold under test is the one this checkout emits.
# Override by exporting COMMIT (e.g. a tag), or set COMMIT="" to fall back to
# latest master.
#
# Note: nix fetches the commit from the GitHub remote, so $COMMIT must be pushed
# to logos-co/logos-dev-boost. A local-only / uncommitted HEAD won't resolve;
# export COMMIT="" (or push first) in that case.
COMMIT="${COMMIT-$(git rev-parse HEAD)}"
RELEASE_FOR=()
if [ -n "${COMMIT}" ]; then
  RELEASE_FOR=(--release-for "logos-dev-boost=${COMMIT}")
  echo "==> Pinning logos-dev-boost to ${COMMIT}"
else
  echo "==> COMMIT empty; building against latest logos-dev-boost master"
fi

# ── Pick a filesystem that can actually host the build ───────────────────────
# The specs `git init && git add` a scaffolded project, and the ui-qml spec
# launches a headless app that dlopen()s its QML plugin. That demands a
# filesystem that BOTH (a) lets git create loose objects and (b) is not mounted
# noexec. Some sandboxes break one or the other: a `fakeowner` bind mount (Docker
# Desktop / OrbStack, as used for /workspace) rejects git's read-only (0444)
# object temp files with "insufficient permission for adding an object", and a
# noexec mount (often /tmp) makes dlopen fail with "failed to map segment from
# shared object". On a normal CI filesystem ./outputs passes both checks and the
# build runs in place. Otherwise we stage the build in the first directory that
# passes and copy the cleaned result back into ./outputs.
#
# Force a specific staging directory by exporting DOCTEST_BUILD_DIR.
#
# probe_dir sets PROBE_REASON to a human-readable explanation when a directory
# is rejected ("mktemp", "git", or "noexec"), so the staging search can report
# exactly why each candidate failed instead of silently giving up.
PROBE_REASON=""
probe_dir() {
  # $1: directory to test. Succeeds only if git-object creation AND exec both work.
  local d="$1" t
  PROBE_REASON=""
  t="$(mktemp -d "${d%/}/.doctest-probe.XXXXXX" 2>/dev/null)" || { PROBE_REASON="not writable (mktemp failed)"; return 1; }
  if ! ( cd "$t" && echo probe > f && git init -q . && git add f ) >/dev/null 2>&1; then
    PROBE_REASON="git can't add objects (fakeowner / bind mount)"
    chmod -R u+w "$t" 2>/dev/null || true; rm -rf "$t"
    return 1
  fi
  # Exec test: write a tiny script and run it. Use a shebang script rather than
  # copying a known binary — `/bin/true` exists on Linux but NOT on macOS (it's
  # at /usr/bin/true), so `cp /bin/true` would fail on every macOS directory and
  # be misreported as noexec. A #! script is executed by the kernel from this
  # mount, so a noexec mount blocks it exactly as it would a built binary.
  printf '#!/bin/sh\nexit 0\n' > "$t/x" 2>/dev/null
  if ! { chmod +x "$t/x" && "$t/x"; } >/dev/null 2>&1; then
    PROBE_REASON="mounted noexec (can't run built binaries)"
    chmod -R u+w "$t" 2>/dev/null || true; rm -rf "$t"
    return 1
  fi
  chmod -R u+w "$t" 2>/dev/null || true
  rm -rf "$t"
  return 0
}

STAGING=""   # non-empty when BUILD_DIR is a throwaway dir to copy back from
BUILD_DIR="${DOCTEST_BUILD_DIR:-}"
if [ -n "$BUILD_DIR" ]; then
  mkdir -p "$BUILD_DIR"
  if ! probe_dir "$BUILD_DIR"; then
    echo "ERROR: DOCTEST_BUILD_DIR=${BUILD_DIR} is unusable: ${PROBE_REASON}." >&2
    exit 1
  fi
  # A caller-provided dir we own end-to-end: treat as staging so we copy the
  # cleaned result back into ./outputs and don't leave junk behind.
  BUILD_DIR="$(mktemp -d "${BUILD_DIR%/}/logos-dev-boost-doctest.XXXXXX")"
  STAGING="$BUILD_DIR"
  echo "==> Staging build in ${BUILD_DIR} (from DOCTEST_BUILD_DIR)" >&2
elif probe_dir "."; then
  BUILD_DIR="$OUTPUT_DIR"
else
  echo "==> ./ can't host the build: ${PROBE_REASON}; staging elsewhere" >&2
  tried=""
  # Candidate bases, widest-net first. $TMPDIR and /tmp are real filesystems on
  # many setups (incl. macOS) even though some sandboxes mount them noexec; the
  # probe sorts that out. The reason for each rejection is printed so a failure
  # tells you what to fix (or which path to pass as DOCTEST_BUILD_DIR).
  for base in "${XDG_RUNTIME_DIR:-}" "${TMPDIR:-}" "$HOME" /var/tmp /tmp; do
    [ -n "$base" ] && [ -d "$base" ] || continue
    case " $tried " in *" $base "*) continue ;; esac   # skip duplicates
    tried="$tried $base"
    if probe_dir "$base"; then
      BUILD_DIR="$(mktemp -d "${base%/}/logos-dev-boost-doctest.XXXXXX")"
      STAGING="$BUILD_DIR"
      echo "==> Staging build in ${BUILD_DIR}" >&2
      break
    else
      echo "    - ${base}: ${PROBE_REASON}" >&2
    fi
  done
  if [ -z "$BUILD_DIR" ]; then
    echo "ERROR: found no writable, exec-capable, git-usable directory to build in." >&2
    echo "       Tried:${tried:- (none)}." >&2
    echo "       Set DOCTEST_BUILD_DIR to a path on a normal (non-bind-mount," >&2
    echo "       non-noexec) filesystem and re-run, e.g.:" >&2
    echo "         DOCTEST_BUILD_DIR=\"\$HOME/.cache/logos-doctest\" ./doctests/run.sh" >&2
    exit 1
  fi
fi

cleanup_staging() {
  if [ -n "$STAGING" ] && [ -e "$STAGING" ]; then
    chmod -R u+w "$STAGING" 2>/dev/null || true
    rm -rf "$STAGING"
  fi
}
trap cleanup_staging EXIT

# Restore write permission on any leftover build dir from a prior run: module
# dirs copied out of the read-only nix store land r-x, and `rm -rf` (inside the
# per-spec loop) can't delete inside a directory it can't write to.
if [ -e "${BUILD_DIR}" ]; then
  chmod -R u+w "${BUILD_DIR}" 2>/dev/null || true
fi

# Keep the committed example projects (outputs/logos-*/) and screenshots
# (outputs/images/) across runs; only the rendered .md files are regenerated
# (overwritten in place). The example dirs are curated, committed references —
# see the note at the end of the loop below.
mkdir -p "${OUTPUT_DIR}" "${OUTPUT_DIR}/images"

# Each spec runs into its OWN per-spec subdirectory of BUILD_DIR, never a shared
# one. Two specs (the pure-module and the external-lib spec) both scaffold a
# `logos-crypto-utils/` project; if they shared one --output-dir the second
# `init` would fail with "directory already exists". A per-spec build dir keeps
# them isolated. After each spec we render its .md and collect any screenshots.
for SPEC in "${SPECS[@]}"; do
  NAME="${SPEC%.test.yaml}"
  MD="${NAME}.md"
  SPEC_DIR="${BUILD_DIR}/${NAME}"

  # Fresh, empty per-spec build dir (restore perms first — prior runs leave
  # read-only nix-store copies behind).
  if [ -e "${SPEC_DIR}" ]; then
    chmod -R u+w "${SPEC_DIR}" 2>/dev/null || true
    rm -rf "${SPEC_DIR}"
  fi
  mkdir -p "${SPEC_DIR}"

  echo "==> Running ${SPEC} into ${SPEC_DIR}/"
  # ${RELEASE_FOR[@]+...} guards the expansion so an empty array doesn't trip
  # `set -u` on older bash (e.g. macOS's stock 3.2).
  "${DOCTEST[@]}" run "${SPEC}" \
    --verbose \
    --continue-on-fail \
    ${RELEASE_FOR[@]+"${RELEASE_FOR[@]}"} \
    --output-dir "${SPEC_DIR}/"

  echo "==> Generating ${OUTPUT_DIR}/${MD}"
  "${DOCTEST[@]}" generate "${SPEC}" \
    ${RELEASE_FOR[@]+"${RELEASE_FOR[@]}"} \
    -o "${OUTPUT_DIR}/${MD}"

  # Collect any screenshots the spec captured (ui_test writes them to images/).
  if [ -d "${SPEC_DIR}/images" ]; then
    cp -R "${SPEC_DIR}/images/." "${OUTPUT_DIR}/images/"
  fi

  # Restore write perms on the per-spec dir (nix-store copies land r-x) so the
  # staging cleanup at exit can remove it.
  chmod -R u+w "${SPEC_DIR}" 2>/dev/null || true
done

# Drop the images/ dir if no spec produced screenshots (keeps the tree tidy).
rmdir "${OUTPUT_DIR}/images" 2>/dev/null || true

# Note: the scaffolded example projects under outputs/logos-*/ are committed,
# curated references of what `init` emits — they are NOT regenerated here (two
# specs scaffold the same `logos-crypto-utils` name, and one example is checked
# in under a distinct directory). To refresh an example after the scaffold
# changes, run the matching spec with --keep-workdir and copy its logos-* project
# into outputs/ by hand.

echo "==> Done. Rendered docs (and any screenshots) are in ${OUTPUT_DIR}/"
