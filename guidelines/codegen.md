# Code Generator (logos-cpp-generator)

## Overview

`logos-cpp-generator` bridges pure C++ module implementations to the Logos runtime's Qt plugin system. Module authors write standard C++ and the generator produces all Qt boilerplate automatically.

Universal modules are **header-first cdylibs**: the generator derives a LIDL contract from your impl header, then emits a Qt-free cdylib (exporting the common module-impl C ABI) wrapped by a uniform Qt-plugin glue that `logos_host` loads unchanged. Your module's own translation units stay Qt-free — Qt appears only in the generated glue.

## The universal pipeline

This is how universal modules are built. You write only the impl class; `logos-module-builder` runs every step below for you in `preConfigure` (see [In flake.nix](#in-flakenix)).

```
C++ impl header (your code)
       │
       ▼  logos-cpp-generator --header-to-lidl
parseImplHeader() — extracts public methods, maps C++ types to LIDL types
       │
       ▼
<name>.lidl (derived interface contract; also the events sidecar dependents consume)
       │
       ├──► logos-qt-generator --lidl --backend cdylib
       │        └──► <name>_cdylib_glue.h / <name>_cdylib_glue.cpp
       │             — uniform Qt-plugin glue over the module-impl C ABI
       │
       └──► logos-cpp-generator --lidl --backend cdylib
                └──► <name>_module_impl.cpp
                     — Qt-free C-ABI export wrapper around your impl class
```

### Commands

```bash
# 1. Derive the LIDL contract from your impl header.
logos-cpp-generator --header-to-lidl src/<name>_impl.h \
  --impl-class <ImplClassName> \
  --metadata metadata.json \
  -o ./generated_code/<name>.lidl

# 2. Generate the uniform Qt-plugin glue (logos_host loads it unchanged).
logos-qt-generator --lidl ./generated_code/<name>.lidl \
  --backend cdylib \
  --output-dir ./generated_code

# 3. Generate the Qt-free C-ABI export wrapper (+ typed event emitters)
#    around your hand-written impl class.
logos-cpp-generator --lidl ./generated_code/<name>.lidl \
  --backend cdylib \
  --impl-class <ImplClassName> \
  --impl-header <name>_impl.h \
  --output-dir ./generated_code
```

You never run these by hand — `mkLogosModule` invokes them automatically when `metadata.json` declares `"interface": "universal"`.

| Flag | Description |
|------|-------------|
| `--header-to-lidl <path>` | Path to the pure C++ impl header to derive the LIDL contract from |
| `--lidl <path>` | Path to a `.lidl` contract (steps 2 & 3 consume the file emitted by step 1) |
| `--backend cdylib` | Emit the cdylib module-impl C ABI artifacts (glue + export wrapper) |
| `--impl-class <name>` | Name of the C++ implementation class (PascalCase + `Impl`) |
| `--impl-header <name>` | Header filename (for include directives in generated code) |
| `--metadata <path>` | Path to metadata.json (provides name, version, description) |
| `-o <path>` / `--output-dir <path>` | Output `.lidl` file (step 1) / directory for generated files (steps 2 & 3) |

### Generated Files

All land in `generated_code/`. Don't edit them and don't list them in `CMakeLists.txt` — `LogosModule.cmake` globs them automatically (see [In CMakeLists.txt](#in-cmakeliststxt)).

**`<name>.lidl`** — the interface contract derived from your impl header. Doubles as the published events sidecar that dependents' typed-event codegen consumes.

**`<name>_cdylib_glue.h` / `<name>_cdylib_glue.cpp`** — the uniform Qt-plugin glue. A `QObject` subclass with `Q_PLUGIN_METADATA` + `Q_INTERFACES` and a `LogosProviderObject` that marshals method calls to JSON and forwards them to the cdylib's module-impl C ABI (`dispatch` / `getMethods` / `set_context` / emit callback / `accept_token`). The glue is identical regardless of the module's source language — it only knows the C ABI.

**`<name>_module_impl.cpp`** — the Qt-free C-ABI export wrapper. Implements the common module-impl C ABI (`logos_module_impl.h`) around your hand-written impl class, plus typed event emitters. This translation unit links no Qt; it is what makes a universal module a cdylib.

### Type Mapping Table

| C++ type | LIDL type | JSON / wire |
|----------|-----------|-------------|
| `std::string` / `const std::string&` | `tstr` | string |
| `bool` | `bool` | bool |
| `int64_t` | `int` | number |
| `uint64_t` | `uint` | number |
| `double` | `float64` | number |
| `void` | `void` | — |
| `std::vector<std::string>` | `[tstr]` | array of string |
| `std::vector<uint8_t>` | `bstr` | `{"_bytes":"<base64url>"}` |
| `std::vector<int64_t>` | `[int]` | array of number |
| `LogosMap` | `{tstr: any}` | object |
| `LogosList` | `[any]` | array |
| Anything else | `any` | any |

`LogosMap` and `LogosList` (from `<logos_json.h>`) are `nlohmann::json` aliases for returning structured data without Qt. The generator sets a `jsonReturn` flag on these methods so the dispatch layer carries the JSON through faithfully.

## LIDL (define the contract first)

LIDL is a lightweight Interface Definition Language. The universal pipeline derives a `.lidl` from your header automatically (step 1 above), but you can also hand-write one to define the interface before the implementation:

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

A hand-written `.lidl` feeds steps 2 & 3 directly (this is the `cdylib` interface; the `universal` interface just derives the `.lidl` from your header first). Both routes produce identical generated output.

## Common Issues

- **Unknown type warning**: If the generator encounters a C++ type not in the mapping table, it maps to `any`. Prefer explicit types from the table.
- **Class not found**: `--impl-class` must exactly match the class name in the header (case-sensitive).
- **metadata.json mismatch**: The `name` in metadata.json must match the expected plugin binary name.
- **Generated files not found by CMake**: You do *not* list `generated_code/` files in `SOURCES` — `LogosModule.cmake` globs them. Just make sure `generated_code` is in `INCLUDE_DIRS`.

## In CMakeLists.txt

List only your own sources. `LogosModule.cmake` globs `generated_code/*.cpp` and `*.h` automatically (excluding `logos_sdk`/`*_api`), so the generated glue is picked up without being named:

```cmake
logos_module(
    NAME my_module
    SOURCES
        src/my_module_impl.h
        src/my_module_impl.cpp
    INCLUDE_DIRS
        ${CMAKE_CURRENT_SOURCE_DIR}/generated_code
)
```

## In flake.nix

You don't write a `preConfigure` — `mkLogosModule` runs the universal pipeline for you when `metadata.json` sets `"interface": "universal"`:

```nix
{
  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";
    nix-bundle-lgx.url = "github:logos-co/nix-bundle-lgx";
  };

  outputs = inputs@{ logos-module-builder, ... }:
    logos-module-builder.lib.mkLogosModule {
      src = ./.;
      configFile = ./metadata.json;
      flakeInputs = inputs;
    };
}
```
