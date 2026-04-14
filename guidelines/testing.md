# Testing Logos Modules

## Unit Tests with logos-test-framework

Universal modules have a plain C++ impl class. Test it using the logos-test-framework, which is provided automatically by `logos-module-builder`.

### Test File Structure

```
tests/
├── main.cpp              # LOGOS_TEST_MAIN() entry point
├── test_my_module.cpp    # Test cases using LOGOS_TEST()
└── CMakeLists.txt        # logos_test() macro
```

### Writing Tests

```cpp
// tests/main.cpp
#include <logos_test.h>
LOGOS_TEST_MAIN()
```

```cpp
// tests/test_my_module.cpp
#include <logos_test.h>
#include "../src/my_module_impl.h"

LOGOS_TEST(hash_returns_nonempty_string) {
    MyModuleImpl impl;
    LOGOS_ASSERT_FALSE(impl.hash("hello").empty());
}

LOGOS_TEST(verify_matches_hash) {
    MyModuleImpl impl;
    auto hash = impl.hash("hello");
    LOGOS_ASSERT_TRUE(impl.verify("hello", hash));
}
```

### CMakeLists.txt for Tests

```cmake
# tests/CMakeLists.txt
cmake_minimum_required(VERSION 3.14)
project(MyModuleTests LANGUAGES CXX)

include(LogosTest)

logos_test(
    NAME my_module_tests
    MODULE_SOURCES ../src/my_module_impl.cpp
    TEST_SOURCES
        main.cpp
        test_my_module.cpp
)
```

The `logos_test()` CMake macro handles all framework wiring: Qt dependencies, SDK mock headers, include paths, and CTest registration.

### Mocking Other Modules

Use `LogosTestContext` when your module calls other modules:

```cpp
LOGOS_TEST(calls_waku_publish) {
    auto t = LogosTestContext("chat_module");
    t.mockModule("waku_module", "relayPublish").returns(true);

    ChatImpl impl;
    t.init(&impl);

    impl.sendMessage("hello");
    LOGOS_ASSERT(t.moduleCalled("waku_module", "relayPublish"));
}
```

### Mocking C Libraries

For modules wrapping external C/C++ libraries, write mock stubs:

```cpp
// tests/mocks/mock_libcalc.cpp
#include <logos_clib_mock.h>
extern "C" { #include "libcalc.h" }

extern "C" int calc_add(int a, int b) {
    LOGOS_CMOCK_RECORD("calc_add");
    return LOGOS_CMOCK_RETURN(int, "calc_add");
}
```

Reference them in CMake:

```cmake
logos_test(
    NAME calc_module_tests
    MODULE_SOURCES ../src/calc_module_impl.cpp
    TEST_SOURCES main.cpp test_calc.cpp
    MOCK_C_SOURCES mocks/mock_libcalc.cpp
)
```

### Running Unit Tests

```bash
nix build .#unit-tests -L   # Build and run unit tests
nix flake check -L           # All Nix checks including tests
```

`logos-module-builder` auto-detects `tests/CMakeLists.txt` and adds `checks.<system>.unit-tests` and `packages.<system>.unit-tests` automatically.

## Integration Tests with logoscore

Test the module as a loaded plugin via the headless runtime:

```bash
logoscore -m ./result/lib -l my_module \
  -c "my_module.doSomething(test_input)"

logoscore -m ./result/lib -l my_module \
  -c "my_module.init(config)" \
  -c "my_module.process(data)"

logoscore -m ./result/lib -l my_module,other_module \
  -c "my_module.callOther(hello)"
```

logoscore arguments:
- `-m <path>` -- Directory to scan for module plugins (repeatable)
- `-l <mod1,mod2>` -- Comma-separated modules to load
- `-c "<module>.<method>(args)"` -- Call a method (repeatable, sequential)
- `--quit-on-finish` -- Exit after calls complete (for CI)

Type auto-detection in `-c` args: `true`/`false` -> bool, `42` -> int, `3.14` -> double, else -> string. Use `@filename` to load file content as an argument.

### TEST_GROUPS

The test runner supports groups for selective testing:

```bash
TEST_GROUPS=basic ws test logos-test-modules --auto-local
TEST_GROUPS=ipc ws test logos-test-modules --auto-local
TEST_GROUPS=basic,ipc,errors ws test logos-test-modules --auto-local
```

### Running Tests via Nix

```bash
nix build .#unit-tests -L         # Run unit tests
nix flake check -L                # Run all checks defined in the flake

ws test my-module                 # In the workspace
ws test my-module --auto-local    # With local dep overrides
ws test --all --type cpp          # All C++ repos
```

## 3. UI Integration Tests (QML Inspector)

UI apps (`type: "ui_qml"`) can be tested via the QML Inspector MCP server built into `logos-standalone-app`. Tests interact with the live UI — clicking buttons, reading text, taking screenshots.

### Test file pattern

```javascript
// tests/smoke.mjs
const { resolve } = await import("node:path");
const { test, run } = await import(
  resolve(process.env.LOGOS_QT_MCP || "./result-mcp", "test-framework/framework.mjs")
);

test("my_app: basic interaction", async (app) => {
  await app.expectTexts(["My App"]);
  await app.click("Add");
  await app.expectTexts(["Result:"]);
});

run();
```

### Test API

| Method | Description |
|--------|-------------|
| `app.click(text, opts?)` | Find element by text and click it |
| `app.expectTexts(texts)` | Assert all texts are visible |
| `app.waitFor(fn, opts)` | Poll until fn succeeds (timeout, interval, description) |
| `app.screenshot()` | Capture current state |
| `app.findByType(type)` | Find elements by QML type |
| `app.findByProperty(prop, value)` | Find elements by property |
| `app.getTree()` | Get full QML element tree |

### Running UI tests

```bash
# Interactive (app already running on localhost:3768)
node tests/smoke.mjs

# CI mode (launches app headless, tests, exits)
node tests/smoke.mjs --ci ./result/bin/logos-standalone-app --verbose

# Hermetic via Nix (offscreen, no display needed)
nix build .#integration-test
```

Modules with `.mjs` test files in `tests/` automatically get `nix build .#integration-test` via `mkPluginTest`.

### MCP tools for AI agents

When the app is running, the `.mcp.json` auto-registers these tools with Claude Code / Cursor:

`qml_screenshot`, `qml_find_and_click`, `qml_find_by_type`, `qml_find_by_property`, `qml_list_interactive`, `qml_get_tree`

This lets AI agents visually verify UI changes, click through workflows, and debug layout issues in real time.

## Key Testing Rules

- Unit tests use `LOGOS_TEST()` and `LOGOS_ASSERT_*` macros from `<logos_test.h>`
- Unit tests should NOT require logoscore -- instantiate the impl class directly
- `tests/CMakeLists.txt` must use `include(LogosTest)` + `logos_test()`
- Use `LogosTestContext` for mocking module calls and C library functions
- Integration tests verify the full plugin lifecycle (load, call, response)
- Always test with `--quit-on-finish` in CI to ensure the process exits
- 30-second timeout per `-c` call; exit code 1 on failure
- After adding `checks` to a repo's `flake.nix`, run `ws sync-graph` so the workspace discovers them
