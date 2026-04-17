# UI App Development

UI apps use `"type": "ui_qml"` in metadata.json. There are two subtypes:

1. **Pure QML** — no C++ compilation, QML files only, calls backend modules via `logos.callModule()`
2. **QML + C++ Backend** — process-isolated C++ backend (Qt Remote Objects), QML frontend runs in-process

## Pure QML Apps

Simplest UI app type. No compilation, no C++ code. The host loads QML directly.

### metadata.json

```json
{
  "name": "my_app",
  "type": "ui_qml",
  "version": "1.0.0",
  "description": "My QML UI application",
  "view": "Main.qml",
  "icon": null,
  "category": "tools",
  "dependencies": ["some_backend_module"]
}
```

Key fields: `"type": "ui_qml"` and `"view"` pointing to the QML entry point. No `"main"` field.

### QML Pattern

```qml
import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    id: root

    function callBackend(method, args) {
        if (typeof logos === "undefined" || !logos.callModule) {
            console.log("Logos bridge not available")
            return
        }
        return logos.callModule("some_backend_module", method, args)
    }

    Button {
        text: "Do Something"
        onClicked: {
            var result = callBackend("myMethod", ["arg1", "arg2"])
            console.log("Result:", result)
        }
    }
}
```

The `logos` bridge is injected by the host (Basecamp or standalone runner). Use `logos.callModule(moduleName, method, args)` to call backend modules.

### flake.nix

Add backend module dependencies (from `metadata.json` `"dependencies"`) as flake inputs. The input attribute name must match the dependency name.

```nix
{
  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";

    # Each metadata.json dependency needs a matching flake input.
    # Use path: for local development, github: for CI/published modules:
    some_backend_module.url = "path:../logos-some-backend-module";
    # some_backend_module.url = "github:logos-co/logos-some-backend-module";
  };

  outputs = inputs@{ logos-module-builder, ... }:
    logos-module-builder.lib.mkLogosQmlModule {
      src = ./.;
      configFile = ./metadata.json;
      flakeInputs = inputs;
    };
}
```

Uses `mkLogosQmlModule` (not `mkLogosModule`). No `preConfigure` needed.

### Resolving Module Dependencies

Each backend module must be built with its shared library (`.so`/`.dylib`) present in `lib/`. Three ways to point at a dependency:

| Approach | `flake.nix` input URL | Build command |
|----------|----------------------|---------------|
| Local path in flake.nix | `path:../logos-my-module` | `nix run .` |
| Remote URL + local override | `github:org/repo` | `nix run . --override-input dep_name path:../logos-my-module` |
| Fully remote | `github:org/repo` | `nix run .` |

`--override-input` overrides a flake input at build time without editing `flake.nix` — useful for quick iteration.

## QML + C++ Backend Apps

For apps that need business logic, state management, or access to system APIs. The C++ backend runs in a **separate isolated process** (`logos_host`), communicating with the QML frontend via Qt Remote Objects IPC.

### metadata.json

```json
{
  "name": "my_app",
  "type": "ui_qml",
  "version": "1.0.0",
  "description": "My UI app with C++ backend",
  "main": "my_app_plugin",
  "view": "qml/Main.qml",
  "icon": null,
  "category": "tools",
  "dependencies": []
}
```

Key difference from pure QML: has `"main"` field pointing to the C++ plugin binary, and `"view"` points to `qml/Main.qml` (inside `src/`).

### .rep File (Qt Remote Objects Interface)

```
class MyApp
{
    PROP(QString status READWRITE)
    SLOT(int doSomething(int a, int b))
}
```

Defines the IPC interface. Properties auto-sync to QML replicas. Slots are callable from QML.

### C++ Plugin Class

The plugin inherits three bases:
- `MyAppSimpleSource` — generated from .rep, provides property storage + slot declarations
- `MyAppInterface` — extends `PluginInterface`, used for Qt plugin loading
- `MyAppViewPluginBase` — provides `setBackend()` to wire up Qt Remote Objects

```cpp
class MyAppPlugin : public MyAppSimpleSource,
                    public MyAppInterface,
                    public MyAppViewPluginBase
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID MyAppInterface_iid FILE "metadata.json")
    Q_INTERFACES(MyAppInterface)

public:
    explicit MyAppPlugin(QObject* parent = nullptr);

    QString name()    const override { return "my_app"; }
    QString version() const override { return "1.0.0"; }

    Q_INVOKABLE void initLogos(LogosAPI* api);

    // Implement slots from .rep
    int doSomething(int a, int b) override;

private:
    LogosAPI* m_logosAPI = nullptr;
};
```

In `initLogos()`, call `setBackend(this)` to wire up the Qt Remote Objects source:

```cpp
void MyAppPlugin::initLogos(LogosAPI* api) {
    m_logosAPI = api;
    setBackend(this);
}
```

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.14)
project(MyAppPlugin LANGUAGES CXX)

if(DEFINED ENV{LOGOS_MODULE_BUILDER_ROOT})
    include($ENV{LOGOS_MODULE_BUILDER_ROOT}/cmake/LogosModule.cmake)
else()
    message(FATAL_ERROR "LogosModule.cmake not found. Set LOGOS_MODULE_BUILDER_ROOT.")
endif()

logos_module(
    NAME my_app
    REP_FILE src/my_app.rep
    SOURCES
        src/my_app_interface.h
        src/my_app_plugin.h
        src/my_app_plugin.cpp
)
```

Key: `REP_FILE` tells the build system to generate Qt Remote Objects source/replica headers from the `.rep` file.

### QML Frontend

```qml
import QtQuick
import QtQuick.Controls

Item {
    id: root

    // Typed replica — auto-synced properties and callable slots
    readonly property var backend: logos.module("my_app")
    readonly property bool ready: backend !== null && logos.isViewModuleReady("my_app")

    // Auto-synced property from .rep
    readonly property string status: backend ? backend.status : ""

    Button {
        text: "Do Something"
        enabled: root.ready
        onClicked: {
            logos.watch(backend.doSomething(1, 2),
                function(value) { console.log("Result:", value) },
                function(error) { console.log("Error:", error) }
            )
        }
    }

    Text {
        text: "Status: " + root.status
    }
}
```

Key QML APIs:
- `logos.module("name")` — returns a typed Qt Remote Objects replica
- `logos.isViewModuleReady("name")` — checks if the backend process is connected
- `logos.watch(pendingReply, onSuccess, onError)` — handles async slot calls

## C++/QML Boundary Rules

| Concern              | C++ (backend plugin)                     | QML                                    |
| -------------------- | ---------------------------------------- | -------------------------------------- |
| Data models, state   | `PROP()` in `.rep` file                  | Bind to `backend.property`             |
| Business logic       | Implement as `SLOT()` in `.rep`          | Never — no JS business logic           |
| Module calls         | Via `LogosAPI*` in `initLogos()`         | Via `logos.callModule()` (pure QML)    |
| File I/O, networking | Always C++                               | Never                                  |
| UI layout, styling   | Never                                    | QML; use `Logos.Theme` inside Basecamp |
| User interactions    | `SLOT()` methods                         | `onClicked: logos.watch(backend.doX())`|
| Plugin lifecycle     | `initLogos()` + `setBackend(this)`       | N/A                                    |

## Build and Test

```bash
git init && git add -A   # nix needs files tracked
nix build                # compiles (backend) or packages (pure QML)
nix run .                # standalone app

# Override a module dependency at build time (no flake.nix edits needed):
nix run . --override-input some_module path:../logos-some-module
```

## Calling Logos Modules

From C++ backend (in `initLogos` or slot implementations):

```cpp
auto* client = m_logosAPI->getClient("storage_module");
QVariant result = client->invokeRemoteMethod("storage_module", "save", key, value);
```

From pure QML:

```qml
var result = logos.callModule("storage_module", "save", [key, value])
```

Always declare module dependencies in `metadata.json` `"dependencies"` so they are loaded before the UI app.

## UI Integration Testing (QML Inspector + MCP)

`logos-standalone-app` includes a QML Inspector MCP server that lets AI agents and test scripts interact with the running UI — take screenshots, click elements, inspect the QML tree.

### Available MCP tools

| Tool | Description |
|------|-------------|
| `qml_screenshot` | Capture a screenshot of the current app state |
| `qml_find_and_click` | Find a UI element by text and click it |
| `qml_find_by_type` | Locate elements by QML type name |
| `qml_find_by_property` | Locate elements by property value |
| `qml_list_interactive` | List all clickable/interactive elements |
| `qml_get_tree` | Get the full QML element tree |

### Interactive testing (AI agent workflow)

```bash
nix build && nix run .     # launches app with inspector on localhost:3768
```

The `.mcp.json` in the project directory auto-registers the MCP server with Claude Code and other MCP clients. The AI agent can then screenshot, click buttons, and verify UI state in real time.

### Writing integration test files

```javascript
// tests/smoke.mjs
const { test, run } = await import(
  resolve(process.env.LOGOS_QT_MCP || "./result-mcp", "test-framework/framework.mjs")
);

test("my_app: click add and verify result", async (app) => {
  await app.click("Add");
  await app.expectTexts(["Result:"]);
});

run();
```

### Running tests

```bash
# Interactive (app already running)
node tests/smoke.mjs

# CI mode (launches app headless, tests, exits)
node tests/smoke.mjs --ci ./result/bin/logos-standalone-app --verbose

# Hermetic via Nix (headless, offscreen)
nix build .#integration-test
```

### Nix `mkPluginTest` builder

UI modules with `.mjs` test files in `tests/` automatically get `nix build .#integration-test`. For manual setup:

```nix
integration-test = logos-standalone-app.lib.${system}.mkPluginTest {
  inherit pkgs;
  pluginPkg = myModulePackage;
  testFiles = [ ./tests/smoke.mjs ];
  name = "my-module-integration-test";
};
```

The builder runs headless (`QT_QPA_PLATFORM=offscreen`), connects to the QML inspector, and executes each test file sequentially.
