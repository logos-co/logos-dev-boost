---
name: testing-modules
description: Activate when writing tests for Logos modules. Covers unit testing universal modules (direct impl class testing), logoscore integration tests, TEST_GROUPS, mock transport, and Nix check configuration.
---

# Testing Logos Modules

## When to Use

Use this skill when:
- Writing unit tests for a universal module
- Writing integration tests with logoscore
- Adding test infrastructure to a module's flake.nix
- Debugging test failures

## Unit Tests (Universal Modules)

Universal modules have a plain C++ impl class with no framework dependencies. Test it directly:

### Basic Assert-Based Tests

```cpp
// tests/test_my_module.cpp
#include "../src/my_module_impl.h"
#include <cassert>
#include <iostream>

int main() {
    MyModuleImpl impl;

    // Test basic functionality
    std::string result = impl.doSomething("test");
    assert(!result.empty());

    assert(impl.validate("valid_input") == true);
    assert(impl.validate("") == false);

    assert(impl.count() >= 0);

    std::cout << "All tests passed" << std::endl;
    return 0;
}
```

### SDK Test Framework

```cpp
// tests/test_my_module.cpp
#include "../src/my_module_impl.h"
#include "logos_test.h"

LOGOS_TEST_MAIN()

TEST(MyModule, DoSomethingWorks) {
    MyModuleImpl impl;
    EXPECT_FALSE(impl.doSomething("test").empty());
}

TEST(MyModule, ValidateRejectsEmpty) {
    MyModuleImpl impl;
    EXPECT_FALSE(impl.validate(""));
}
```

### CMakeLists.txt for Tests

```cmake
# tests/CMakeLists.txt
add_executable(test_my_module test_my_module.cpp)
target_include_directories(test_my_module PRIVATE ${CMAKE_SOURCE_DIR}/src)
target_link_libraries(test_my_module PRIVATE my_module_impl_objects)
```

## Integration Tests with logoscore

Test the module as a loaded plugin:

```bash
# Basic: load and call a method
logoscore -m ./result/lib -l my_module \
  -c "my_module.doSomething(test_input)"

# Multiple sequential calls
logoscore -m ./result/lib -l my_module \
  -c "my_module.init(config)" \
  -c "my_module.process(data)"

# With multiple modules (tests IPC)
logoscore -m ./result/lib -l my_module,other_module \
  -c "my_module.callOther(hello)"

# For CI: exit after calls complete
logoscore -m ./result/lib -l my_module \
  -c "my_module.doSomething(test)" \
  --quit-on-finish
```

### logoscore Argument Types

Arguments in `-c` calls are auto-detected:
- `true` / `false` -> bool
- `42` -> int
- `3.14` -> double
- Everything else -> string
- `@filename` -> file content as string argument

### Asserting on Output

In shell-based test scripts, assert on logoscore stdout:

```bash
OUTPUT=$(logoscore -m ./result/lib -l my_module \
  -c "my_module.doSomething(test)" --quit-on-finish 2>&1)

if echo "$OUTPUT" | grep -q "expected_result"; then
    echo "PASS"
else
    echo "FAIL: unexpected output"
    exit 1
fi
```

## TEST_GROUPS

For repos with many tests, group them:

```bash
TEST_GROUPS=basic ws test my-module --auto-local
TEST_GROUPS=ipc ws test my-module --auto-local
TEST_GROUPS=basic,ipc,errors ws test my-module --auto-local
```

## Running Tests via Nix

```bash
# All checks in the flake
nix flake check -L

# In the workspace
ws test my-module
ws test my-module --auto-local

# All C++ repos
ws test --all --type cpp
```

## Adding Tests to flake.nix

After adding `checks` outputs to a repo's `flake.nix`, run `ws sync-graph` so the workspace discovers them.

## Key Rules

- Unit tests instantiate the impl class directly — no logoscore, no Qt
- Integration tests verify the full plugin lifecycle (load, call, response)
- Always use `--quit-on-finish` in CI
- 30-second timeout per `-c` call; exit code 1 on failure
- The logoscore binary auto-builds from source on first use
