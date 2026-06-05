---
name: inter-module-comm
description: Activate when implementing inter-module communication in Logos. Covers LogosAPI::callModule(), LogosResult handling, dependency declaration in metadata.json, generated client stubs, and the QML bridge.
---

# Inter-Module Communication

## When to Use

Use this skill when:
- Calling methods on another Logos module
- Declaring module dependencies
- Handling LogosResult return values
- Using generated type-safe client stubs

## Calling Another Module (C++)

From a universal module's impl class or a UI app's backend:

```cpp
#include "logos_api.h"

LogosResult result = logosAPI->callModule("other_module", "methodName", {arg1, arg2});
if (result.success()) {
    QVariant data = result.data();
    QString stringVal = data.toString();
} else {
    QString error = result.errorMessage();
}
```

## Calling from QML (UI Apps Only)

```qml
var result = logos.callModule("other_module", "methodName", [arg1, arg2])
```

The QML bridge serializes results to JSON. This is a thin wrapper over the C++ LogosAPI.

## LogosResult

All cross-module calls return `LogosResult`:

| Method | Returns | Description |
|--------|---------|-------------|
| `success()` | `bool` | Whether the call succeeded |
| `data()` | `QVariant` | Return value (may be string, int, map, list) |
| `errorMessage()` | `QString` | Error description (empty on success) |

Returning a LogosResult from your module (in universal module C++ code, handled by the generated dispatch):

The generator wraps your C++ return values in LogosResult automatically. If your method returns `std::string`, the caller receives `result.data().toString()`.

## Declaring Dependencies

In `metadata.json`:

```json
{
  "dependencies": ["storage_module", "crypto_module"]
}
```

Dependency names must match the `name` field in the dependency module's own `metadata.json`. The runtime loads dependencies before your module.

In `flake.nix`, add the dependency module as an input so Nix can build it:

```nix
inputs = {
  logos-module-builder.url = "github:logos-co/logos-module-builder";
  logos-storage-module.url = "github:logos-co/logos-storage-module";
};
```

## Generated Client Stubs

The code generator can produce type-safe wrappers for calling other modules:

```bash
logos-cpp-generator <plugin-file> [--output-dir <dir>]
```

This generates `<ModuleName>Client.h` with typed methods:

```cpp
#include "logos_sdk.h"

LogosModules* logos = new LogosModules(logosAPI);
QString result = logos->storage_module.save("key", "value");
std::vector<std::string> keys = logos->storage_module.listKeys();
```

## Always Handle Missing Modules

A target module may not be loaded. Always check the result:

```cpp
LogosResult result = api->callModule("optional_module", "method", {});
if (!result.success()) {
    // Module not loaded or method failed — handle gracefully
}
```

## Accessing LogosAPI

- **Universal modules:** The API is available via the generated `onInit(LogosAPI* api)` hook. Store the pointer in your impl class if needed.
- **UI apps (with C++ backend):** Received via `initLogos(LogosAPI* api)`. Store it in your plugin class. Pure QML apps use `logos.callModule()` from QML instead.
- **In logoscore tests:** LogosAPI is available when modules are loaded by logoscore. Not available in standalone unit tests.
