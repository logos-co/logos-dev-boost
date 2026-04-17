---

## name: create-ui-app

description: Activate when creating a Logos Basecamp UI app. Covers two subtypes — pure QML (no C++) and QML + process-isolated C++ backend with Qt Remote Objects.

# Create a UI App for Logos Basecamp

## When to Use

Use this skill when:

- Creating an application with a graphical interface for Basecamp
- Building a pure QML app that calls backend modules via `logos.callModule()`
- Building a QML app with a process-isolated C++ backend via Qt Remote Objects

## Choose Your Subtype

| Need | Type | Scaffold command |
|------|------|-----------------|
| QML-only UI, calls existing modules | Pure QML | `--type ui-qml` |
| Custom business logic + QML UI | QML + Backend | `--type ui-qml-backend` |

---

## Path A: Pure QML App

### Fastest path: scaffold

```bash
nix run github:logos-co/logos-dev-boost -- init my_app --type ui-qml
cd logos-my-app
git init && git add -A
nix build
nix run .
```

### Project Structure

```
logos-my-app/
├── Main.qml              ← QML entry point
├── metadata.json          ← "type": "ui_qml", "view": "Main.qml"
├── flake.nix              ← uses mkLogosQmlModule
└── .gitignore
```

No C++ files, no CMakeLists.txt, no compilation.

### `metadata.json`

```json
{
  "name": "my_app",
  "version": "1.0.0",
  "description": "My QML UI application",
  "type": "ui_qml",
  "view": "Main.qml",
  "category": "tools",
  "dependencies": ["some_backend_module"]
}
```

Note: No `"main"` field — this signals a pure QML app.

### `Main.qml`

```qml
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

Item {
    id: root

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 16

        Text {
            text: "My App"
            font.pixelSize: 24
            color: "#ffffff"
        }

        Button {
            text: "Call Backend"
            onClicked: {
                // logos bridge is injected by the host
                var result = logos.callModule("some_backend_module", "myMethod", ["arg"])
                console.log("Result:", result)
            }
        }
    }
}
```

### `flake.nix`

If the app depends on backend modules (listed in `metadata.json` `"dependencies"`), add them as flake inputs. The input attribute name must match the dependency name in `metadata.json`.

```nix
{
  description = "My QML UI App";

  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";

    # Add each dependency from metadata.json as a flake input.
    # The attribute name must match the dependency name.
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

### Resolving Module Dependencies

Each backend module dependency must be **built** with its shared library (`.so` on Linux, `.dylib` on macOS) present in its `lib/` directory. If the library is missing, the nix build fails with linker errors.

Three ways to point at a dependency:

| Approach | `flake.nix` input URL | Build command |
|----------|----------------------|---------------|
| Local path in flake.nix | `path:../logos-my-module` | `nix run .` |
| Remote URL + local override | `github:org/repo` | `nix run . --override-input some_backend_module path:../logos-my-module` |
| Fully remote | `github:org/repo` | `nix run .` |

`--override-input` is useful for quick iteration — it overrides the flake input at build time without editing `flake.nix`. Use `path:` in `flake.nix` when you persistently develop against a local checkout.

### Build and Test

```bash
git init && git add -A
nix build
nix run .          # standalone app with QML Inspector on localhost:3768

# Or with a local module override:
nix run . --override-input some_backend_module path:../logos-some-backend-module
```

### Integration Testing (Optional)

Create `tests/smoke.mjs`:

```javascript
const { resolve } = await import("node:path");
const { test, run } = await import(
  resolve(process.env.LOGOS_QT_MCP || "./result-mcp", "test-framework/framework.mjs")
);

test("my_app: verify UI loads", async (app) => {
  await app.expectTexts(["Call Backend"]);
  await app.click("Call Backend");
});

run();
```

Run: `nix build .#integration-test` (headless) or `node tests/smoke.mjs` (interactive, app must be running).

---

## Path B: QML + C++ Backend App

### Fastest path: scaffold

```bash
nix run github:logos-co/logos-dev-boost -- init my_app --type ui-qml-backend
cd logos-my-app
git init && git add -A
nix build
nix run .
```

### Project Structure

```
logos-my-app/
├── src/
│   ├── my_app_interface.h     ← extends PluginInterface
│   ├── my_app.rep             ← Qt Remote Objects interface definition
│   ├── my_app_plugin.h        ← inherits SimpleSource + Interface + ViewPluginBase
│   ├── my_app_plugin.cpp      ← implementation
│   └── qml/
│       └── Main.qml           ← QML frontend (uses logos.module() replica)
├── metadata.json              ← "type": "ui_qml", "main": "my_app_plugin"
├── CMakeLists.txt             ← logos_module() with REP_FILE
├── flake.nix                  ← uses mkLogosQmlModule
└── .gitignore
```

### Step 1: `metadata.json`

```json
{
  "name": "my_app",
  "version": "1.0.0",
  "description": "My UI app with C++ backend",
  "type": "ui_qml",
  "main": "my_app_plugin",
  "view": "qml/Main.qml",
  "category": "tools",
  "dependencies": []
}
```

The `"main"` field signals a C++ backend is present.

### Step 2: `.rep` File (Qt Remote Objects Interface)

`src/my_app.rep`:

```
class MyApp
{
    PROP(QString status READWRITE)
    SLOT(int add(int a, int b))
}
```

Defines properties (auto-synced to QML) and callable slots.

### Step 3: Interface Header

`src/my_app_interface.h`:

```cpp
#ifndef MY_APP_INTERFACE_H
#define MY_APP_INTERFACE_H

#include <QObject>
#include <QString>
#include "interface.h"

class MyAppInterface : public PluginInterface
{
public:
    virtual ~MyAppInterface() = default;
};

#define MyAppInterface_iid "org.logos.MyAppInterface"
Q_DECLARE_INTERFACE(MyAppInterface, MyAppInterface_iid)

#endif
```

### Step 4: Plugin Class

`src/my_app_plugin.h`:

```cpp
#ifndef MY_APP_PLUGIN_H
#define MY_APP_PLUGIN_H

#include <QString>
#include <QVariantList>
#include "my_app_interface.h"
#include "LogosViewPluginBase.h"
#include "rep_my_app_source.h"

class LogosAPI;

class MyAppPlugin : public MyAppSimpleSource,
                    public MyAppInterface,
                    public MyAppViewPluginBase
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID MyAppInterface_iid FILE "metadata.json")
    Q_INTERFACES(MyAppInterface)

public:
    explicit MyAppPlugin(QObject* parent = nullptr);
    ~MyAppPlugin() override;

    QString name()    const override { return "my_app"; }
    QString version() const override { return "1.0.0"; }

    Q_INVOKABLE void initLogos(LogosAPI* api);

    // Slots from my_app.rep
    int add(int a, int b) override;

signals:
    void eventResponse(const QString& eventName, const QVariantList& args);

private:
    LogosAPI* m_logosAPI = nullptr;
};

#endif
```

Three parent classes:
- `MyAppSimpleSource` — generated from `.rep`, property storage + slot declarations
- `MyAppInterface` — extends `PluginInterface` for Qt plugin loading
- `MyAppViewPluginBase` — provides `setBackend()` for Qt Remote Objects wiring

`src/my_app_plugin.cpp`:

```cpp
#include "my_app_plugin.h"
#include "logos_api.h"
#include <QDebug>

MyAppPlugin::MyAppPlugin(QObject* parent)
    : MyAppSimpleSource(parent)
{
    setStatus("Ready");
}

MyAppPlugin::~MyAppPlugin() = default;

void MyAppPlugin::initLogos(LogosAPI* api)
{
    m_logosAPI = api;
    setBackend(this);    // wires up Qt Remote Objects source
    qDebug() << "MyAppPlugin: initialized";
}

int MyAppPlugin::add(int a, int b)
{
    int result = a + b;
    setStatus(QStringLiteral("%1 + %2 = %3").arg(a).arg(b).arg(result));
    return result;
}
```

### Step 5: QML Frontend

`src/qml/Main.qml`:

```qml
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root

    readonly property var backend: logos.module("my_app")
    readonly property bool ready: backend !== null && logos.isViewModuleReady("my_app")
    readonly property string status: backend ? backend.status : ""

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 16

        Text {
            text: root.ready ? "Connected" : "Connecting to backend..."
            color: root.ready ? "#56d364" : "#f0883e"
            font.pixelSize: 12
        }

        Button {
            text: "Add"
            enabled: root.ready
            onClicked: {
                logos.watch(backend.add(1, 2),
                    function(value) { resultText.text = "Result: " + value },
                    function(error) { resultText.text = "Error: " + error }
                )
            }
        }

        Text {
            id: resultText
            text: "Press Add to call the backend"
            color: "#56d364"
        }

        Text {
            text: "Backend status: " + root.status
            color: "#8b949e"
        }
    }
}
```

Key QML APIs:
- `logos.module("name")` — typed Qt Remote Objects replica
- `logos.isViewModuleReady("name")` — backend connection status
- `logos.watch(pendingReply, onSuccess, onError)` — async slot call handling

### Step 6: `CMakeLists.txt`

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

`REP_FILE` tells the build system to generate Qt Remote Objects source/replica headers.

### Step 7: `flake.nix`

If the app depends on other modules (listed in `metadata.json` `"dependencies"`), add them as flake inputs. The input attribute name must match the dependency name.

```nix
{
  description = "My UI App with C++ Backend";

  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";

    # Add dependencies here if metadata.json lists any.
    # Use path: for local, github: for remote:
    # some_module.url = "path:../logos-some-module";
    # some_module.url = "github:logos-co/logos-some-module";
  };

  outputs = inputs@{ logos-module-builder, ... }:
    logos-module-builder.lib.mkLogosQmlModule {
      src = ./.;
      configFile = ./metadata.json;
      flakeInputs = inputs;
    };
}
```

Each module dependency must be built with its `.so`/`.dylib` present. Use `--override-input` at build time to point at a local checkout without editing `flake.nix` (see the Pure QML section above for the full table of approaches).

### Step 8: Build and Test

```bash
git init && git add -A
nix build
nix run .          # standalone app with QML Inspector on localhost:3768

# With a local module override:
# nix run . --override-input some_module path:../logos-some-module
```

### Step 9: Integration Testing (Optional)

Create `tests/smoke.mjs`:

```javascript
const { resolve } = await import("node:path");
const { test, run } = await import(
  resolve(process.env.LOGOS_QT_MCP || "./result-mcp", "test-framework/framework.mjs")
);

test("my_app: add numbers", async (app) => {
  await app.expectTexts(["Connecting to backend...", "Press Add"]);
  // Wait for backend connection
  await app.waitFor(
    async () => { await app.expectTexts(["Connected"]); },
    { timeout: 10000, description: "backend to connect" }
  );
  await app.click("Add");
  await app.expectTexts(["Result:"]);
});

run();
```

Run: `nix build .#integration-test` (headless) or `node tests/smoke.mjs` (interactive, app must be running).

The QML Inspector MCP tools (`qml_screenshot`, `qml_find_and_click`, `qml_get_tree`, etc.) are also available to AI agents via the `.mcp.json` that auto-registers when the app is running.
