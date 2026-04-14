---
name: testing-modules
description: Activate when writing tests for Logos modules. Covers the logos-test-framework (LOGOS_TEST macros, LogosTestContext, module mocking, C library mocking, event testing), logos_test() CMake integration, logoscore integration tests, and Nix check configuration.
---

# Testing Logos Modules

## When to Use

Use this skill when:
- Writing unit tests for a universal module
- Setting up test infrastructure (tests/CMakeLists.txt, test files)
- Mocking calls to other modules or external C libraries in tests
- Writing integration tests with logoscore
- Debugging test failures

## logos-test-framework (Unit Tests)

The test framework is provided by `logos-module-builder` automatically. No extra flake inputs needed.

### File Structure

```
tests/
├── main.cpp              # LOGOS_TEST_MAIN() entry point
├── test_my_module.cpp    # Test cases using LOGOS_TEST()
└── CMakeLists.txt        # logos_test() macro
```

### Test Entry Point

```cpp
// tests/main.cpp
#include <logos_test.h>
LOGOS_TEST_MAIN()
```

### Writing Tests

```cpp
// tests/test_my_module.cpp
#include <logos_test.h>
#include "../src/my_module_impl.h"

LOGOS_TEST(echo_returns_expected_value) {
    MyModuleImpl impl;
    LOGOS_ASSERT_EQ(impl.echo("hello"), std::string("echo: hello"));
}

LOGOS_TEST(validate_rejects_empty_input) {
    MyModuleImpl impl;
    LOGOS_ASSERT_FALSE(impl.validate(""));
}
```

### CMakeLists.txt

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

### Running Tests

```bash
nix build .#unit-tests -L   # Build and run unit tests
nix flake check -L           # Run all Nix checks including tests
```

`logos-module-builder` auto-detects `tests/CMakeLists.txt` and creates `checks.<system>.unit-tests` and `packages.<system>.unit-tests`.

### Test CLI Options

```bash
./my_module_tests --filter <pattern>   # Run only matching tests
./my_module_tests --json               # JSON output for CI/agents
./my_module_tests --no-color           # Disable colored output
./my_module_tests --help               # Show help
```

## Assertions

| Macro | Description |
|-------|-------------|
| `LOGOS_ASSERT(expr)` | Expression is truthy |
| `LOGOS_ASSERT_TRUE(expr)` | Alias for LOGOS_ASSERT |
| `LOGOS_ASSERT_FALSE(expr)` | Expression is falsy |
| `LOGOS_ASSERT_EQ(a, b)` | `a == b` with diff on failure |
| `LOGOS_ASSERT_NE(a, b)` | `a != b` |
| `LOGOS_ASSERT_GT(a, b)` | `a > b` |
| `LOGOS_ASSERT_GE(a, b)` | `a >= b` |
| `LOGOS_ASSERT_LT(a, b)` | `a < b` |
| `LOGOS_ASSERT_LE(a, b)` | `a <= b` |
| `LOGOS_ASSERT_CONTAINS(haystack, needle)` | String contains substring |
| `LOGOS_ASSERT_THROWS(expr)` | Expression throws |

## Mocking Other Modules

Use `LogosTestContext` to mock calls to other Logos modules:

```cpp
LOGOS_TEST(calls_other_module) {
    auto t = LogosTestContext("my_module");
    t.mockModule("other_module", "getData").returns(42);

    MyModuleImpl impl;
    t.init(&impl);

    auto result = impl.fetchData();
    LOGOS_ASSERT_EQ(result, 42);
    LOGOS_ASSERT(t.moduleCalled("other_module", "getData"));
    LOGOS_ASSERT_EQ(t.moduleCallCount("other_module", "getData"), 1);
}
```

## Mocking C Libraries

For modules wrapping external C/C++ libraries:

### 1. Write mock stubs

```cpp
// tests/mocks/mock_libcalc.cpp
#include <logos_clib_mock.h>
extern "C" { #include "libcalc.h" }

extern "C" int calc_add(int a, int b) {
    LOGOS_CMOCK_RECORD("calc_add");
    return LOGOS_CMOCK_RETURN(int, "calc_add");
}
```

### 2. Reference in CMake

```cmake
logos_test(
    NAME calc_module_tests
    MODULE_SOURCES ../src/calc_module_impl.cpp
    TEST_SOURCES main.cpp test_calc.cpp
    MOCK_C_SOURCES mocks/mock_libcalc.cpp
)
```

### 3. Use in tests

```cpp
LOGOS_TEST(add_returns_mocked_value) {
    auto t = LogosTestContext("calc_module");
    t.mockCFunction("calc_add").returns(99);

    CalcModuleImpl impl;
    t.init(&impl);

    auto result = impl.add(10, 20);
    LOGOS_ASSERT_EQ(result, 99);
    LOGOS_ASSERT(t.cFunctionCalled("calc_add"));
}
```

### 4. Configure Nix for C library mocking

```nix
logos-module-builder.lib.mkLogosModule {
  src = ./.;
  configFile = ./metadata.json;
  flakeInputs = inputs;
  tests = {
    dir = ./tests;
    mockCLibs = ["mylib"];
  };
};
```

## Event Testing

```cpp
LOGOS_TEST(method_emits_event) {
    auto t = LogosTestContext("my_module");
    t.captureEvents();

    MyModuleImpl impl;
    t.init(&impl);

    impl.doSomething("data");

    LOGOS_ASSERT(t.eventEmitted("myEvent"));
    LOGOS_ASSERT_EQ(t.eventCount("myEvent"), 1);
    LOGOS_ASSERT_EQ(t.lastEventData("myEvent").at(0).toString(), "data");
}
```

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

### logoscore Argument Types

Arguments in `-c` calls are auto-detected:
- `true` / `false` -> bool
- `42` -> int
- `3.14` -> double
- Everything else -> string
- `@filename` -> file content as string argument

### TEST_GROUPS

For repos with many tests, group them:

```bash
TEST_GROUPS=basic ws test my-module --auto-local
TEST_GROUPS=ipc ws test my-module --auto-local
```

## Running Tests via Nix / Workspace

```bash
nix build .#unit-tests -L      # Run unit tests
nix flake check -L             # All checks in the flake

ws test my-module              # In the workspace
ws test my-module --auto-local # With local dep overrides
ws test --all --type cpp       # All C++ repos
```

After adding `checks` outputs to a repo's `flake.nix`, run `ws sync-graph` so the workspace discovers them.

## Key Rules

- Unit tests use `LOGOS_TEST()` macro, not raw `assert()` or GoogleTest
- Instantiate the impl class directly in unit tests -- no logoscore, no Qt needed
- Use `LogosTestContext` for mocking module calls and C library functions
- `tests/CMakeLists.txt` must use `include(LogosTest)` + `logos_test()`
- Integration tests verify the full plugin lifecycle (load, call, response)
- Always use `--quit-on-finish` in CI for logoscore integration tests
- 30-second timeout per `-c` call; exit code 1 on failure
