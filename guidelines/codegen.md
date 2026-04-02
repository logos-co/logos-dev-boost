# Code Generator (logos-cpp-generator)

## Overview

`logos-cpp-generator` bridges pure C++ module implementations to the Logos runtime's Qt plugin system. Module authors write standard C++ and the generator produces all Qt boilerplate automatically.

## The --from-header Pipeline

This is the primary mode for universal modules:

```
C++ impl header (your code)
       │
       ▼
parseImplHeader() — extracts public methods, maps C++ types to LIDL types
       │
       ▼
ModuleDecl (internal AST)
       │
       ├──► <name>_qt_glue.h      — Plugin class + ProviderObject with typed wrappers
       │
       └──► <name>_dispatch.cpp    — callMethod() dispatch + getMethods() metadata
```

### Command

```bash
logos-cpp-generator --from-header src/<name>_impl.h \
  --backend qt \
  --impl-class <ImplClassName> \
  --impl-header <name>_impl.h \
  --metadata metadata.json \
  --output-dir ./generated_code
```

| Flag | Description |
|------|-------------|
| `--from-header <path>` | Path to the pure C++ impl header |
| `--backend qt` | Generate Qt plugin glue (currently the only backend) |
| `--impl-class <name>` | Name of the C++ implementation class (PascalCase + Impl) |
| `--impl-header <name>` | Header filename (for include directives in generated code) |
| `--metadata <path>` | Path to metadata.json (provides name, version, description) |
| `--output-dir <path>` | Directory for generated files |

### Generated Files

**`<name>_qt_glue.h`** — Contains two classes:
1. **ProviderObject** — Inherits `LogosProviderBase`. Holds `m_impl` (your impl class). Each public method gets a typed wrapper that converts Qt params to C++ std params, calls `m_impl.method(...)`, and converts the return value back.
2. **Plugin** — `QObject` subclass with `Q_PLUGIN_METADATA` and `Q_INTERFACES`. Factory method `createProviderObject()` returns a new ProviderObject.

**`<name>_dispatch.cpp`** — Implements two methods on the ProviderObject:
1. `callMethod(methodName, args)` — String-based dispatch table mapping method names to typed calls
2. `getMethods()` — Returns `QJsonArray` of method metadata (name, signature, returnType, parameters)

### Type Mapping Table

| C++ type | LIDL type | Qt mapping |
|----------|-----------|------------|
| `std::string` / `const std::string&` | `tstr` | `QString` |
| `bool` | `bool` | `bool` |
| `int64_t` | `int` | `int` |
| `uint64_t` | `uint` | `int` |
| `double` | `float64` | `double` |
| `void` | `void` | `void` |
| `std::vector<std::string>` | `[tstr]` | `QStringList` |
| `std::vector<uint8_t>` | `bstr` | `QByteArray` |
| `std::vector<int64_t>` | `[int]` | `QVariantList` |
| Anything else | `any` | `QVariant` |

## LIDL (Alternative Input Format)

LIDL is a lightweight Interface Definition Language. Instead of parsing a C++ header, you write a `.lidl` file:

```
module crypto_utils {
    version "1.0.0"
    description "Cryptographic utilities"

    method hash(input: tstr) -> tstr
    method verify(input: tstr, hash: tstr) -> bool
    method generateKey(bits: int) -> tstr
    method listAlgorithms() -> [tstr]
}
```

Both paths (C++ header and LIDL) produce identical generated output. Use `--from-header` for most modules; use LIDL when you want to define the interface before writing the implementation.

## Common Issues

- **Unknown type warning**: If the generator encounters a C++ type not in the mapping table, it maps to `any` (`QVariant`). Prefer explicit types from the table.
- **Class not found**: `--impl-class` must exactly match the class name in the header (case-sensitive).
- **metadata.json mismatch**: The `name` in metadata.json must match the expected plugin binary name.
- **Generated files not found by CMake**: Ensure `generated_code/` files are listed in `CMakeLists.txt` SOURCES and the directory is in INCLUDE_DIRS.

## In CMakeLists.txt

```cmake
logos_module(
    NAME my_module
    SOURCES
        src/my_module_impl.h
        src/my_module_impl.cpp
        generated_code/my_module_qt_glue.h
        generated_code/my_module_dispatch.cpp
    INCLUDE_DIRS
        ${CMAKE_CURRENT_SOURCE_DIR}/generated_code
)
```

## In flake.nix

The generator runs in `preConfigure`, before CMake:

```nix
preConfigure = ''
  logos-cpp-generator --from-header src/my_module_impl.h \
    --backend qt --impl-class MyModuleImpl \
    --impl-header my_module_impl.h \
    --metadata metadata.json --output-dir ./generated_code
'';
```
