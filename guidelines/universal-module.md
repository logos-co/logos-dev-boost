# Universal Module Development

## The Universal Interface Pattern

Universal modules use **pure C++** for their implementation. You write a single implementation class using standard C++ types. The build system generates all Qt/plugin infrastructure automatically via `logos-cpp-generator --from-header`.

**You write:** A C++ class with `std::string`, `int64_t`, `bool`, `std::vector<T>`.
**The generator produces:** Qt plugin class, method dispatch, introspection metadata.

## Rules

- **NO Qt types** in your impl header or implementation: no `QString`, `QObject`, `Q_INVOKABLE`, `QVariant`
- **NO Qt includes** in your impl header (Qt headers in `.cpp` are OK if needed for internal use, but the public API must be pure C++)
- Set `"interface": "universal"` in `metadata.json`
- Name the impl class `<PascalCaseName>Impl` (e.g., `CryptoUtilsImpl`)
- Name the impl header `<name>_impl.h` (e.g., `crypto_utils_impl.h`)
- Only `public` methods become module API methods. Private/protected are ignored by the generator.
- Constructors, destructors, typedefs, and using declarations are skipped by the generator.

## Type Mapping

| Use this in your C++ | Generator maps to | Qt type produced |
|----------------------|-------------------|-----------------|
| `std::string` / `const std::string&` | `tstr` | `QString` |
| `bool` | `bool` | `bool` |
| `int64_t` | `int` | `int` |
| `uint64_t` | `uint` | `int` |
| `double` | `float64` | `double` |
| `void` | `void` | `void` |
| `std::vector<std::string>` | `[tstr]` | `QStringList` |
| `std::vector<uint8_t>` | `bstr` | `QByteArray` |
| `std::vector<int64_t>` | `[int]` | `QVariantList` |
| `std::vector<double>` | `[float64]` | `QVariantList` |
| `std::vector<bool>` | `[bool]` | `QVariantList` |

If you use a type not in this table, the generator maps it to `any` (`QVariant`). Prefer explicit types from the table for type safety.

## Impl Header Template

```cpp
#pragma once
#include <string>
#include <vector>
#include <cstdint>

class MyModuleImpl {
public:
    MyModuleImpl();
    ~MyModuleImpl();

    std::string doSomething(const std::string& input);
    bool validate(const std::string& data);
    int64_t count();
    std::vector<std::string> listItems();

private:
    // Private members are not exposed as module API
};
```

## Build Pipeline

The `flake.nix` `preConfigure` hook runs the generator before CMake:

```bash
logos-cpp-generator --from-header src/<name>_impl.h \
  --backend qt \
  --impl-class <ImplClassName> \
  --impl-header <name>_impl.h \
  --metadata metadata.json \
  --output-dir ./generated_code
```

This produces `generated_code/<name>_qt_glue.h` and `generated_code/<name>_dispatch.cpp`. These files are listed in `CMakeLists.txt` under the `SOURCES` of `logos_module()`.

## Testing

Unit tests instantiate the impl class directly — it is a plain C++ class:

```cpp
#include "my_module_impl.h"
// No Qt test framework needed for basic tests
MyModuleImpl impl;
assert(impl.doSomething("test") == "expected");
```

Integration tests use `logoscore`:
```bash
logoscore -m ./result/lib -l my_module -c "my_module.doSomething(test)"
```
