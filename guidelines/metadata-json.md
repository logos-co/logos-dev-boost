# metadata.json Schema

## Full Schema

```json
{
  "name": "my_module",
  "version": "1.0.0",
  "description": "What this module does",
  "author": "Author Name",
  "type": "core",
  "interface": "universal",
  "category": "general",
  "main": "my_module_plugin",
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

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Module identifier. Must match binary prefix: `my_module` -> `my_module_plugin.so` |
| `version` | string | Semantic version (`"1.0.0"`) |
| `type` | string | `"core"` for modules, `"ui"` for UI apps |
| `main` | string | Plugin binary name without extension: `"my_module_plugin"` |

## Universal Module Fields

| Field | Value | Description |
|-------|-------|-------------|
| `interface` | `"universal"` | Signals that this module uses pure C++ impl + code generation |

When `"interface": "universal"` is set, the build system expects `logos-cpp-generator --from-header` to run in `preConfigure` and produce Qt glue files.

## Dependencies

```json
"dependencies": ["storage_module", "crypto_module"]
```

Values must match the `name` field in the dependency module's own `metadata.json`. The runtime loads dependencies before the module.

Flake input attribute names should also match the dependency module names when possible. Example: if you depend on `storage_module` from repo `logos-storage-module`, the flake input should be named `logos-storage-module`.

## External Libraries

```json
"nix": {
  "external_libraries": [
    {
      "name": "mylib",
      "build_command": "make static-library",
      "output_pattern": "build/libmylib.*"
    }
  ]
}
```

For Go libraries, add `"go_build": true`. The external library source is provided as a non-flake input in `flake.nix` and mapped via `externalLibInputs`.

## Nix Packages

```json
"nix": {
  "packages": {
    "build": ["pkg-config"],
    "runtime": ["nlohmann_json", "openssl"]
  }
}
```

`build` packages are available during compilation only. `runtime` packages are linked and available at runtime.

## CMake Configuration

```json
"nix": {
  "cmake": {
    "find_packages": ["Threads", "OpenSSL"],
    "extra_sources": ["src/helper.cpp"],
    "extra_include_dirs": ["include"],
    "extra_link_libraries": ["Threads::Threads"]
  }
}
```

These values are passed to CMake by the `logos_module()` macro. They supplement, not replace, the automatic SDK and Qt dependencies.

## UI App Specific Fields

```json
{
  "type": "ui",
  "icon": "icon.png",
  "category": "tools"
}
```

UI apps do not use `"interface": "universal"` — they are hand-written Qt plugins with `IComponent`.
