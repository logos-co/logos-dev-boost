#!/usr/bin/env bash
# End-to-end scaffold test for logos-dev-boost.
#
# For a given scaffold --type, this script:
#   1. Runs `logos-dev-boost init <name> --type <type>` in a fresh tmp dir.
#   2. `git init`s the scaffolded project (flakes only see tracked files).
#   3. Runs `nix build` on the scaffolded project.
#   4. Asserts the expected plugin binary exists under ./result/lib/.
#   5. For modules: runs `nix build .#unit-tests -L` to verify generated tests compile and pass.
#
# Usage:
#   tests/run-scaffold-tests.sh <type>          # one of: module, ui-app
#   tests/run-scaffold-tests.sh all             # runs both supported types
#
# Env:
#   KEEP_TMP=1    Don't delete the scaffold tmp dir on success (for debugging).
#
# The script must be run from the logos-dev-boost repo root. It locates the
# dev-boost CLI via `nix run path:$REPO_ROOT#app` so local edits are exercised.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

run_one() {
  local type="$1"
  local name
  case "$type" in
    module) name="scaffold_test_mod" ;;
    ui-app) name="scaffold_test_ui" ;;
    *)
      echo "unknown type: $type (expected 'module' or 'ui-app')" >&2
      exit 2
      ;;
  esac

  local tmp
  tmp="$(mktemp -d -t logos-dev-boost-scaffold-XXXXXX)"
  cleanup() {
    if [ -z "${KEEP_TMP:-}" ]; then
      rm -rf "$tmp"
    else
      echo "  KEEP_TMP set — leaving $tmp in place" >&2
    fi
  }
  trap cleanup RETURN

  echo "=== scaffold --type $type ==="
  echo "  tmp dir: $tmp"

  (
    cd "$tmp"
    nix run "path:$repo_root#app" -- init "$name" --type "$type"
  )

  local proj="$tmp/logos-${name//_/-}"
  if [ ! -d "$proj" ]; then
    echo "FAIL: scaffold did not produce $proj" >&2
    exit 1
  fi

  echo "  scaffolded: $proj"
  echo "  building..."
  (
    cd "$proj"
    # Flakes only see git-tracked files, so stage everything the scaffolder wrote.
    git init -q
    git add -A
    nix build -L
  )

  local ext
  case "$(uname -s)" in
    Darwin) ext="dylib" ;;
    *)      ext="so"    ;;
  esac

  local plugin="$proj/result/lib/${name}_plugin.$ext"
  if [ ! -f "$plugin" ]; then
    echo "FAIL: expected $plugin, not found" >&2
    echo "  result contents:" >&2
    ls -la "$proj/result/lib/" >&2 || true
    exit 1
  fi

  echo "  OK: ${name}_plugin.$ext built"

  if [ "$type" = "module" ]; then
    echo "  running unit tests..."
    (
      cd "$proj"
      nix build .#unit-tests -L
    )
    echo "  OK: unit tests passed"
  fi
}

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <module|ui-app|all>" >&2
  exit 2
fi

case "$1" in
  all)
    run_one module
    run_one ui-app
    ;;
  *)
    run_one "$1"
    ;;
esac

echo "=== all scaffold tests passed ==="
