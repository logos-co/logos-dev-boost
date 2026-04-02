---
name: wrap-external-lib
description: Activate when wrapping an external C or C++ library as a Logos universal module. Covers external_libraries in metadata.json, flake input configuration, extern C includes, and the Go library special case.
---

# Wrap an External C/C++ Library as a Module

## When to Use

Use this skill when:
- Creating a module that wraps an existing C or C++ library (e.g., libsodium, SQLite, a Go CGo library)
- The external library is not in nixpkgs and needs to be built from source
- Following the pattern established by `logos-accounts-module` (wrapping go-wallet-sdk)

## Step 1: Set Up the Module

Follow the `create-universal-module` skill for the basic structure, then add external library configuration.

## Step 2: Configure External Library in metadata.json

```json
{
  "name": "my_module",
  "type": "core",
  "interface": "universal",
  "nix": {
    "external_libraries": [
      {
        "name": "mylib",
        "build_command": "make static-library",
        "output_pattern": "build/libmylib.*"
      }
    ],
    "cmake": {
      "find_packages": ["Threads"],
      "extra_include_dirs": ["lib"]
    }
  }
}
```

For Go libraries with CGo, add `"go_build": true`:

```json
{
  "name": "mylib",
  "build_command": "make static-library",
  "go_build": true,
  "output_pattern": "build/libmylib.*"
}
```

## Step 3: Add External Library as Flake Input

```nix
inputs = {
  logos-module-builder.url = "github:logos-co/logos-module-builder";
  nix-bundle-lgx.url = "github:logos-co/nix-bundle-lgx";
  my-lib = {
    url = "github:org/my-lib/<commit-hash>";
    flake = false;
  };
};

outputs = inputs@{ logos-module-builder, ... }:
  logos-module-builder.lib.mkLogosModule {
    src = ./.;
    configFile = ./metadata.json;
    flakeInputs = inputs;
    externalLibInputs = {
      mylib = inputs.my-lib;
    };
    preConfigure = ''
      logos-cpp-generator --from-header src/my_module_impl.h \
        --backend qt --impl-class MyModuleImpl \
        --impl-header my_module_impl.h \
        --metadata metadata.json --output-dir ./generated_code
    '';
  };
```

The `externalLibInputs` key must match the `name` in `external_libraries`. The module builder copies built library binaries to `lib/`.

## Step 4: Write the Impl Header

```cpp
#pragma once
#include <string>
#include <vector>
#include <cstdint>

extern "C" {
    #include "lib/mylib.h"
}

class MyModuleImpl {
public:
    MyModuleImpl();
    ~MyModuleImpl();

    std::string encrypt(const std::string& plaintext, const std::string& key);
    std::string decrypt(const std::string& ciphertext, const std::string& key);
    std::string generateKey();

private:
    void* m_handle;
};
```

The `extern "C"` block includes the library's C header. The module builder places headers in `lib/` alongside the static library.

## Step 5: Link the External Library in CMakeLists.txt

```cmake
logos_module(
    NAME my_module
    SOURCES
        src/my_module_impl.h
        src/my_module_impl.cpp
        generated_code/my_module_qt_glue.h
        generated_code/my_module_dispatch.cpp
    FIND_PACKAGES
        Threads
    LINK_LIBRARIES
        Threads::Threads
    INCLUDE_DIRS
        ${CMAKE_CURRENT_SOURCE_DIR}/generated_code
)

find_library(LIBMYLIB
    NAMES libmylib.a libmylib.lib
    PATHS ${CMAKE_CURRENT_SOURCE_DIR}/lib
    NO_DEFAULT_PATH
)

if(LIBMYLIB)
    target_link_libraries(my_module_module_plugin PRIVATE ${LIBMYLIB})
endif()
```

For Go static libraries, use whole-archive linking:

```cmake
if(APPLE)
    target_link_options(my_module_module_plugin PRIVATE -Wl,-force_load ${LIBMYLIB})
    target_link_libraries(my_module_module_plugin PUBLIC "-framework CoreFoundation" "-framework Security")
else()
    target_link_options(my_module_module_plugin PRIVATE
        -Wl,--whole-archive ${LIBMYLIB} -Wl,--no-whole-archive)
endif()
```

## Reference

See `logos-accounts-module` for a complete working example of wrapping a Go CGo library.
