# Testing Logos Modules

## Two Testing Approaches

### 1. Unit Tests (Universal Modules)

Universal modules have a plain C++ impl class with no framework dependencies. Test it directly:

```cpp
#include "my_module_impl.h"
#include <cassert>

int main() {
    MyModuleImpl impl;
    assert(impl.hash("hello") == "expected_hash");
    assert(impl.verify("hello", "expected_hash") == true);
    return 0;
}
```

For the SDK test framework, use `LOGOS_TEST_MAIN()`:

```cpp
#include "my_module_impl.h"
#include "logos_test.h"

LOGOS_TEST_MAIN()

TEST(MyModule, HashWorks) {
    MyModuleImpl impl;
    EXPECT_FALSE(impl.hash("hello").empty());
}
```

Add unit tests to the flake by including a `checks` output or a `tests/` directory with its own `CMakeLists.txt`.

### 2. Integration Tests with logoscore

Test the module as a loaded plugin via the headless runtime:

```bash
# Load module and call a method
logoscore -m ./result/lib -l my_module \
  -c "my_module.doSomething(test_input)"

# Multiple sequential calls
logoscore -m ./result/lib -l my_module \
  -c "my_module.init(config)" \
  -c "my_module.process(data)"

# Load multiple modules (deps resolved automatically)
logoscore -m ./result/lib -l my_module,other_module \
  -c "my_module.callOther(hello)"
```

logoscore arguments:
- `-m <path>` — Directory to scan for module plugins (repeatable)
- `-l <mod1,mod2>` — Comma-separated modules to load
- `-c "<module>.<method>(args)"` — Call a method (repeatable, sequential)
- `--quit-on-finish` — Exit after calls complete (for CI)

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
# Run all checks defined in the flake
nix flake check -L

# In the workspace
ws test my-module
ws test my-module --auto-local     # with local dep overrides
ws test --all --type cpp           # all C++ repos
```

## Key Testing Rules

- Unit tests should NOT require logoscore — instantiate the impl class directly
- Integration tests verify the full plugin lifecycle (load, call, response)
- Always test with `--quit-on-finish` in CI to ensure the process exits
- 30-second timeout per `-c` call; exit code 1 on failure
- After adding `checks` to a repo's `flake.nix`, run `ws sync-graph` so the workspace discovers them
