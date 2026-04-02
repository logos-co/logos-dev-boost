---
name: create-universal-module
description: Activate when creating a new Logos module with the universal C++ interface. Covers scaffolding, metadata.json, flake.nix with code generator, CMakeLists.txt, and the pure C++ impl header.
---

# Create a Universal C++ Module

## When to Use

Use this skill when:
- Creating a new Logos module from scratch
- The module provides backend services (no UI)
- You need a `"type": "core"` module with `"interface": "universal"`

## Step 1: Create Project Directory

```bash
mkdir logos-<name> && cd logos-<name>
git init
```

Use `snake_case` for the module name: `crypto_utils`, `data_processor`, `auth_service`.

## Step 2: Create metadata.json

```json
{
  "name": "<name>",
  "version": "1.0.0",
  "description": "<description>",
  "author": "<author>",
  "type": "core",
  "interface": "universal",
  "category": "<category>",
  "main": "<name>_plugin",
  "dependencies": [],
  "include": [],
  "capabilities": [],

  "nix": {
    "packages": {
      "build": [],
      "runtime": []
    },
    "external_libraries": [],
    "cmake": {
      "find_packages": [],
      "extra_sources": [],
      "extra_include_dirs": [],
      "extra_link_libraries": []
    }
  }
}
```

Replace `<name>` with the module name (e.g., `crypto_utils`). The `main` field is `<name>_plugin`.

## Step 3: Create the Impl Header

Create `src/<name>_impl.h`. This is your module's public API — every public method becomes callable via LogosAPI.

```cpp
#pragma once
#include <string>
#include <vector>
#include <cstdint>

class <ImplClassName> {
public:
    <ImplClassName>();
    ~<ImplClassName>();

    // Your module's public API (pure C++ types only):
    std::string exampleMethod(const std::string& input);
    bool validate(const std::string& data);
    int64_t count();
    std::vector<std::string> listItems();

private:
    // Private members and helpers (not exposed as API)
};
```

**Rules:**
- Class name is PascalCase + `Impl`: `CryptoUtilsImpl` for module `crypto_utils`
- Use ONLY: `std::string`, `bool`, `int64_t`, `uint64_t`, `double`, `void`, `std::vector<T>`
- NO Qt types: no `QString`, `QObject`, `Q_INVOKABLE`, `QVariant`
- Only `public` methods become module API methods

## Step 4: Create the Implementation

Create `src/<name>_impl.cpp`:

```cpp
#include "<name>_impl.h"

<ImplClassName>::<ImplClassName>() {}
<ImplClassName>::~<ImplClassName>() {}

std::string <ImplClassName>::exampleMethod(const std::string& input) {
    return "processed: " + input;
}

// ... implement all public methods
```

## Step 5: Create CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.14)
project(Logos<PascalName>Plugin LANGUAGES CXX)

if(DEFINED ENV{LOGOS_MODULE_BUILDER_ROOT})
    include($ENV{LOGOS_MODULE_BUILDER_ROOT}/cmake/LogosModule.cmake)
else()
    message(FATAL_ERROR "LogosModule.cmake not found. Set LOGOS_MODULE_BUILDER_ROOT.")
endif()

configure_file(${CMAKE_CURRENT_SOURCE_DIR}/metadata.json ${CMAKE_CURRENT_BINARY_DIR}/metadata.json COPYONLY)

logos_module(
    NAME <name>
    SOURCES
        src/<name>_impl.h
        src/<name>_impl.cpp
        generated_code/<name>_qt_glue.h
        generated_code/<name>_dispatch.cpp
    INCLUDE_DIRS
        ${CMAKE_CURRENT_SOURCE_DIR}/generated_code
)
```

## Step 6: Create flake.nix

```nix
{
  description = "Logos <PascalName> Module";

  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";
    nix-bundle-lgx.url = "github:logos-co/nix-bundle-lgx";
  };

  outputs = inputs@{ logos-module-builder, ... }:
    logos-module-builder.lib.mkLogosModule {
      src = ./.;
      configFile = ./metadata.json;
      flakeInputs = inputs;
      preConfigure = ''
        logos-cpp-generator --from-header src/<name>_impl.h \
          --backend qt \
          --impl-class <ImplClassName> \
          --impl-header <name>_impl.h \
          --metadata metadata.json \
          --output-dir ./generated_code
      '';
    };
}
```

## Step 7: Build

```bash
git add -A
nix build
```

Files must be tracked by git before Nix can see them.

## Step 8: Test

```bash
# Integration test via logoscore
logoscore -m ./result/lib -l <name> -c "<name>.exampleMethod(test)"

# Unit test (if tests/ directory exists)
nix flake check -L
```

## Step 9: Inspect

```bash
lm ./result/lib/<name>_plugin.so
lm methods ./result/lib/<name>_plugin.so --json
```

## Checklist

- [ ] `metadata.json` has `"interface": "universal"` and `"type": "core"`
- [ ] Impl header uses only pure C++ types (no Qt)
- [ ] Impl class name matches `--impl-class` in flake.nix preConfigure
- [ ] `CMakeLists.txt` lists generated_code files in SOURCES
- [ ] `flake.nix` has preConfigure with logos-cpp-generator
- [ ] All files tracked by git (`git add -A`)
- [ ] `nix build` succeeds
- [ ] `logoscore` can load and call the module
