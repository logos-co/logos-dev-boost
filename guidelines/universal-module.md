# Universal Module Development

## The Universal Interface Pattern

Universal modules use **pure C++** for their implementation. You write a single implementation class using standard C++ types. The build system generates all Qt/plugin infrastructure automatically — universal modules are **header-first cdylibs** (see [codegen.md](codegen.md)).

**You write:** A C++ class with `std::string`, `int64_t`, `bool`, `std::vector<T>`.
**The generator produces:** a derived `.lidl` contract, the uniform Qt-plugin glue, and a Qt-free C-ABI export wrapper around your class — so your code never touches Qt.

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
| `LogosMap` | `{tstr: any}` | `QVariantMap` |
| `LogosList` | `[any]` | `QVariantList` |

`LogosMap` and `LogosList` (from `<logos_json.h>`) are aliases for `nlohmann::json`. Use them when you need to return structured objects or arrays while keeping your impl Qt-free. The generator automatically converts them to `QVariantMap`/`QVariantList` in the glue layer.

If you use a type not in this table, the generator maps it to `any` (`QVariant`). Prefer explicit types from the table for type safety.

## Emitting Events

To emit events from your module, declare a public `emitEvent` callback in your impl header:

```cpp
#include <functional>
std::function<void(const std::string& eventName, const std::string& data)> emitEvent;
```

The generator detects this automatically and wires it to the Logos event system. Call it from your implementation:

```cpp
if (emitEvent) {
    emitEvent("somethingHappened", someData);
}
```

No `events` array in `metadata.json` is needed — the generator infers everything from the header.

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

You don't write a `preConfigure` or run the generator — `mkLogosModule` runs the universal pipeline automatically when `metadata.json` sets `"interface": "universal"`. It derives a `.lidl` from your impl header, then emits the uniform Qt-plugin glue and a Qt-free C-ABI export wrapper around your class (run for you, you don't invoke these):

```bash
logos-cpp-generator --header-to-lidl src/<name>_impl.h \
  --impl-class <ImplClassName> --metadata metadata.json \
  -o ./generated_code/<name>.lidl
logos-qt-generator  --lidl ./generated_code/<name>.lidl --backend cdylib \
  --output-dir ./generated_code
logos-cpp-generator --lidl ./generated_code/<name>.lidl --backend cdylib \
  --impl-class <ImplClassName> --impl-header <name>_impl.h \
  --output-dir ./generated_code
```

This produces `generated_code/<name>.lidl`, `<name>_cdylib_glue.{h,cpp}`, and `<name>_module_impl.cpp`. You do **not** list these in `CMakeLists.txt` — `LogosModule.cmake` globs `generated_code/` automatically. See [codegen.md](codegen.md) for details.

## Testing

Unit tests instantiate the impl class directly — it is a plain C++ class:

```cpp
#include "my_module_impl.h"
// No Qt test framework needed for basic tests
MyModuleImpl impl;
assert(impl.doSomething("test") == "expected");
```

Integration tests use `logoscore` (start a daemon, then call via the client):
```bash
logoscore -D -m ./result/lib &
logoscore load-module my_module
logoscore call my_module doSomething test
logoscore stop
```
