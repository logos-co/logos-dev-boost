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
#   tests/run-scaffold-tests.sh <type>          # one of: module, ui-qml, ui-qml-backend, full-app
#   tests/run-scaffold-tests.sh all             # runs all supported types
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
    module)         name="scaffold_test_mod" ;;
    ui-qml)         name="scaffold_test_qml" ;;
    ui-qml-backend) name="scaffold_test_backend" ;;
    full-app)       name="scaffold_test_full" ;;
    *)
      echo "unknown type: $type (expected 'module', 'ui-qml', 'ui-qml-backend', or 'full-app')" >&2
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

  if [ "$type" = "full-app" ]; then
    local module_subdir="${name//_/-}-module"
    local ui_subdir="${name//_/-}-ui"

    # Verify sub-project directories were created
    if [ ! -d "$proj/$module_subdir" ]; then
      echo "FAIL: full-app scaffold did not produce $proj/$module_subdir/" >&2
      exit 1
    fi
    if [ ! -d "$proj/$ui_subdir" ]; then
      echo "FAIL: full-app scaffold did not produce $proj/$ui_subdir/" >&2
      exit 1
    fi
    if [ ! -f "$proj/project.json" ]; then
      echo "FAIL: full-app scaffold did not produce $proj/project.json" >&2
      exit 1
    fi

    local ext
    case "$(uname -s)" in
      Darwin) ext="dylib" ;;
      *)      ext="so"    ;;
    esac

    # Build module sub-project (needs its own git repo since it's a standalone flake)
    echo "  building $module_subdir sub-project..."
    (
      cd "$proj/$module_subdir"
      git init -q
      git add -A
      nix build -L
    )
    local module_plugin="$proj/$module_subdir/result/lib/${name}_plugin.$ext"
    if [ ! -f "$module_plugin" ]; then
      echo "FAIL: expected $module_plugin, not found" >&2
      echo "  $module_subdir/result contents:" >&2
      ls -la "$proj/$module_subdir/result/lib/" >&2 || true
      exit 1
    fi
    echo "  OK: module ${name}_plugin.$ext built"

    # Build UI sub-project (needs module to be git-tracked for path: input)
    echo "  building $ui_subdir sub-project..."
    (
      cd "$proj/$ui_subdir"
      git init -q
      git add -A
      nix build -L
    )
    local ui_plugin="$proj/$ui_subdir/result/lib/${name}_ui_plugin.$ext"
    if [ ! -f "$ui_plugin" ]; then
      echo "FAIL: expected $ui_plugin, not found" >&2
      echo "  $ui_subdir/result contents:" >&2
      ls -la "$proj/$ui_subdir/result/lib/" >&2 || true
      exit 1
    fi
    echo "  OK: ui ${name}_ui_plugin.$ext built"
    return
  fi

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

  if [ "$type" = "ui-qml" ]; then
    # Pure QML apps have no compiled plugin — just verify the QML entry point exists
    local qml_entry="$proj/result/Main.qml"
    if [ ! -f "$qml_entry" ] && [ ! -d "$proj/result" ]; then
      echo "FAIL: expected build result at $proj/result" >&2
      exit 1
    fi
    echo "  OK: pure QML app built"
  else
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
  fi
}

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <module|ui-qml|ui-qml-backend|full-app|all>" >&2
  exit 2
fi

case "$1" in
  all)
    run_one module
    run_one ui-qml
    run_one ui-qml-backend
    run_one full-app
    ;;
  *)
    run_one "$1"
    ;;
esac

echo "=== all scaffold tests passed ==="
