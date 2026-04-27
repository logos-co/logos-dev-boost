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
#   tests/run-scaffold-tests.sh <type>          # one of: module, ui-qml, ui-qml-backend, full-app,
#                                              #         module-libdir, full-app-libdir
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

create_test_lib() {
  local libdir="$1"
  mkdir -p "$libdir"
  cat > "$libdir/libtestmath.h" << 'HEADER'
#ifndef LIBTESTMATH_H
#define LIBTESTMATH_H

#ifdef __cplusplus
extern "C" {
#endif

int testmath_add(int a, int b);
int testmath_square(int n);
const char* testmath_version(void);

#ifdef __cplusplus
}
#endif

#endif /* LIBTESTMATH_H */
HEADER
  cat > "$libdir/libtestmath.c" << 'SOURCE'
#include "libtestmath.h"

int testmath_add(int a, int b) {
    return a + b;
}

int testmath_square(int n) {
    return n * n;
}

const char* testmath_version(void) {
    return "1.0.0";
}
SOURCE
}

run_one() {
  local type="$1"
  local name
  local scaffold_type="$type"
  local extra_args=()
  case "$type" in
    module)           name="scaffold_test_mod" ;;
    ui-qml)           name="scaffold_test_qml" ;;
    ui-qml-backend)   name="scaffold_test_backend" ;;
    full-app)         name="scaffold_test_full" ;;
    module-libdir)    name="scaffold_test_libdir"; scaffold_type="module" ;;
    full-app-libdir)  name="scaffold_test_full_libdir"; scaffold_type="full-app" ;;
    *)
      echo "unknown type: $type (expected 'module', 'ui-qml', 'ui-qml-backend', 'full-app', 'module-libdir', or 'full-app-libdir')" >&2
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

  # For libdir tests, create a test C library and pass --lib-dir
  if [[ "$type" == *-libdir ]]; then
    local testlib="$tmp/_testlib"
    create_test_lib "$testlib"
    extra_args+=(--lib-dir "$testlib")
    echo "  test lib: $testlib"
  fi

  (
    cd "$tmp"
    nix run "path:$repo_root#app" -- init "$name" --type "$scaffold_type" "${extra_args[@]}"
  )

  local proj="$tmp/logos-${name//_/-}"
  if [ ! -d "$proj" ]; then
    echo "FAIL: scaffold did not produce $proj" >&2
    exit 1
  fi

  echo "  scaffolded: $proj"

  if [ "$scaffold_type" = "full-app" ]; then
    local module_subdir="${name}-module"
    local ui_subdir="${name}-ui"

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

    # For libdir tests: verify lib files were copied into module sub-project
    if [[ "$type" == *-libdir ]]; then
      if [ ! -d "$proj/$module_subdir/lib" ]; then
        echo "FAIL: --lib-dir scaffold did not create $proj/$module_subdir/lib/" >&2
        exit 1
      fi
      if [ ! -f "$proj/$module_subdir/lib/libtestmath.h" ]; then
        echo "FAIL: --lib-dir scaffold did not copy libtestmath.h into module lib/" >&2
        exit 1
      fi
      if [ ! -f "$proj/$module_subdir/lib/libtestmath.c" ]; then
        echo "FAIL: --lib-dir scaffold did not copy libtestmath.c into module lib/" >&2
        exit 1
      fi
      # Verify _impl.h includes the C header
      if ! grep -q 'libtestmath.h' "$proj/$module_subdir/src/${name}_impl.h"; then
        echo "FAIL: ${name}_impl.h does not include libtestmath.h" >&2
        exit 1
      fi
      echo "  OK: lib files copied and wrapper generated in module sub-project"
    fi

    local ext
    case "$(uname -s)" in
      Darwin) ext="dylib" ;;
      *)      ext="so"    ;;
    esac

    # Init a parent git repo so the UI flake's path:../<module> input resolves.
    (
      cd "$proj"
      git init -q
      git add -A
    )

    # Build module sub-project
    echo "  building $module_subdir sub-project..."
    (
      cd "$proj/$module_subdir"
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

    # For libdir module sub-projects, run unit tests
    if [[ "$type" == *-libdir ]]; then
      echo "  running module unit tests..."
      (
        cd "$proj/$module_subdir"
        nix build .#unit-tests -L
      )
      echo "  OK: module unit tests passed"
    fi

    # Build UI sub-project (needs module tracked by parent git for path: input)
    echo "  building $ui_subdir sub-project..."
    (
      cd "$proj/$ui_subdir"
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

  # For libdir tests: verify lib files were copied and wrapper code generated
  if [[ "$type" == "module-libdir" ]]; then
    if [ ! -d "$proj/lib" ]; then
      echo "FAIL: --lib-dir scaffold did not create $proj/lib/" >&2
      exit 1
    fi
    if [ ! -f "$proj/lib/libtestmath.h" ]; then
      echo "FAIL: --lib-dir scaffold did not copy libtestmath.h" >&2
      exit 1
    fi
    if [ ! -f "$proj/lib/libtestmath.c" ]; then
      echo "FAIL: --lib-dir scaffold did not copy libtestmath.c" >&2
      exit 1
    fi
    # Verify _impl.h includes the C header and has wrapper methods
    if ! grep -q 'libtestmath.h' "$proj/src/${name}_impl.h"; then
      echo "FAIL: ${name}_impl.h does not include libtestmath.h" >&2
      exit 1
    fi
    if ! grep -q 'add' "$proj/src/${name}_impl.h"; then
      echo "FAIL: ${name}_impl.h does not have 'add' wrapper method" >&2
      exit 1
    fi
    # Verify _impl.cpp calls the C functions
    if ! grep -q 'testmath_add' "$proj/src/${name}_impl.cpp"; then
      echo "FAIL: ${name}_impl.cpp does not call testmath_add" >&2
      exit 1
    fi
    # Verify CMakeLists.txt compiles the .c source
    if ! grep -q 'libtestmath.c' "$proj/CMakeLists.txt"; then
      echo "FAIL: CMakeLists.txt does not compile libtestmath.c" >&2
      exit 1
    fi
    # Verify unit tests were generated for the library methods
    if ! grep -q 'add_works' "$proj/tests/test_${name}.cpp"; then
      echo "FAIL: test_${name}.cpp does not have add_works test case" >&2
      exit 1
    fi
    echo "  OK: lib files copied and wrapper code generated"
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

    if [[ "$scaffold_type" = "module" ]]; then
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
  echo "usage: $0 <module|ui-qml|ui-qml-backend|full-app|module-libdir|full-app-libdir|all>" >&2
  exit 2
fi

case "$1" in
  all)
    run_one module
    run_one ui-qml
    run_one ui-qml-backend
    run_one full-app
    run_one module-libdir
    run_one full-app-libdir
    ;;
  *)
    run_one "$1"
    ;;
esac

echo "=== all scaffold tests passed ==="
