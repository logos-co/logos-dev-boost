---

## name: create-ui-app

description: Activate when creating a Logos Basecamp UI app with IComponent, C++backend, and QML frontend. Covers the plugin class, QObject backend, QML entry point, and the C++/QML boundary.

# Create a UI App for Logos Basecamp

## When to Use

Use this skill when:

- Creating an application with a graphical interface for Basecamp
- Building an `IComponent` plugin with `createWidget` / `destroyWidget`
- The app has a C++ backend and QML frontend

## Fastest path: scaffold with logos-dev-boost

```bash
nix run github:logos-co/logos-dev-boost -- init my_app --type ui-app
cd logos-my-app
git init && git add -A
nix build
nix run .          # standalone app (same as nix run .#app)
```

This generates the full structure below, compiles cleanly, and runs standalone via `nix run`.

---

## Step 1: Project Structure

```
logos-my-app/
├── interfaces/
│   └── IComponent.h        ← vendored locally (every UI repo does this)
├── src/
│   ├── my_app_plugin.h
│   ├── my_app_plugin.cpp
│   ├── MyAppBackend.h
│   ├── MyAppBackend.cpp
│   └── qml/
│       └── Main.qml        ← QML entry point (embedded via qt_add_resources)
├── metadata.json
├── CMakeLists.txt
├── flake.nix
└── .gitignore
```

`interfaces/IComponent.h` must be present — it is **not** provided by the SDK, every UI repo vendors it locally.

## Step 2: `interfaces/IComponent.h`

```cpp
#pragma once

#include <QObject>
#include <QWidget>
#include <QtPlugin>

class LogosAPI;

class IComponent {
public:
    virtual ~IComponent() = default;
    virtual QWidget* createWidget(LogosAPI* logosAPI = nullptr) = 0;
    virtual void destroyWidget(QWidget* widget) = 0;
};

#define IComponent_iid "com.logos.component.IComponent"
Q_DECLARE_INTERFACE(IComponent, IComponent_iid)
```

## Step 3: `metadata.json`

```json
{
  "name": "my_app",
  "version": "1.0.0",
  "description": "My Basecamp UI application",
  "type": "ui",
  "category": "tools",
  "main": "my_app_plugin",
  "dependencies": [],
  "nix": {
    "packages": { "build": [], "runtime": ["qt6.qtdeclarative"] },
    "external_libraries": [],
    "cmake": { "find_packages": [], "extra_sources": [] }
  }
}
```

Note: UI apps do NOT use `"interface": "universal"`. They are hand-written Qt plugins.

## Step 4: `CMakeLists.txt`

```cmake
cmake_minimum_required(VERSION 3.14)
project(MyAppPlugin LANGUAGES CXX)

set(CMAKE_AUTOMOC ON)

if(DEFINED ENV{LOGOS_MODULE_BUILDER_ROOT})
    include($ENV{LOGOS_MODULE_BUILDER_ROOT}/cmake/LogosModule.cmake)
else()
    message(FATAL_ERROR "LogosModule.cmake not found. Set LOGOS_MODULE_BUILDER_ROOT.")
endif()

logos_module(
    NAME my_app
    SOURCES
        src/my_app_plugin.h
        src/my_app_plugin.cpp
        src/MyAppBackend.h
        src/MyAppBackend.cpp
    INCLUDE_DIRS
        ${CMAKE_CURRENT_SOURCE_DIR}/interfaces   # so #include <IComponent.h> resolves
)

find_package(Qt6 REQUIRED COMPONENTS Widgets Quick QuickWidgets QuickControls2)

qt_add_resources(my_app_module_plugin ui_qml_resources
    PREFIX "/"
    FILES
        src/qml/Main.qml
)

target_link_libraries(my_app_module_plugin PRIVATE
    Qt6::Widgets
    Qt6::Quick
    Qt6::QuickWidgets
    Qt6::QuickControls2
)
```

Key points:

- `CMAKE_AUTOMOC ON` (not AUTORCC — resources go through `qt_add_resources`)
- `INCLUDE_DIRS` points at `interfaces/` so `<IComponent.h>` resolves
- `qt_add_resources` embeds QML at `qrc:/src/qml/Main.qml`

## Step 5: Plugin Class

`src/my_app_plugin.h`:

```cpp
#pragma once

#include <IComponent.h>
#include <QObject>

class LogosAPI;

class MyAppPlugin : public QObject, public IComponent {
    Q_OBJECT
    Q_INTERFACES(IComponent)
    Q_PLUGIN_METADATA(IID IComponent_iid FILE "../metadata.json")

public:
    explicit MyAppPlugin(QObject* parent = nullptr);
    ~MyAppPlugin();

    Q_INVOKABLE QWidget* createWidget(LogosAPI* logosAPI = nullptr) override;
    void destroyWidget(QWidget* widget) override;
};
```

`src/my_app_plugin.cpp`:

```cpp
#include "my_app_plugin.h"
#include "MyAppBackend.h"
#include <QDebug>
#include <QDir>
#include <QString>
#include <QQuickWidget>
#include <QQmlContext>
#include <QQuickStyle>
#include <QUrl>

MyAppPlugin::MyAppPlugin(QObject* parent) : QObject(parent) {}
MyAppPlugin::~MyAppPlugin() {}

QWidget* MyAppPlugin::createWidget(LogosAPI* logosAPI) {
    QQuickStyle::setStyle("Basic");

    auto* quickWidget = new QQuickWidget();
    quickWidget->setMinimumSize(800, 600);
    quickWidget->setResizeMode(QQuickWidget::SizeRootObjectToView);

    auto* backend = new MyAppBackend(logosAPI, quickWidget);
    quickWidget->rootContext()->setContextProperty("backend", backend);

    // Dev mode: export QML_PATH=$PWD/src/qml to load from disk without rebuilding
    const QString devSource = QString::fromUtf8(qgetenv("QML_PATH"));
    const QUrl qmlUrl = devSource.isEmpty()
        ? QUrl("qrc:/src/qml/Main.qml")
        : QUrl::fromLocalFile(QDir(devSource).filePath("Main.qml"));

    quickWidget->setSource(qmlUrl);

    if (quickWidget->status() == QQuickWidget::Error) {
        qWarning() << "MyAppPlugin: failed to load QML from" << qmlUrl;
        for (const auto& e : quickWidget->errors())
            qWarning() << e.toString();
    }

    return quickWidget;
}

void MyAppPlugin::destroyWidget(QWidget* widget) {
    delete widget;
}
```

## Step 6: Backend Class

`src/MyAppBackend.h`:

```cpp
#pragma once

#include <QObject>
#include <QString>
#include <QVariantList>

class LogosAPI;

class MyAppBackend : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList items  READ items         NOTIFY itemsChanged)
    Q_PROPERTY(int   itemCount     READ itemCount      NOTIFY itemCountChanged)
    Q_PROPERTY(QString statusMessage READ statusMessage NOTIFY statusMessageChanged)

public:
    explicit MyAppBackend(LogosAPI* api, QObject* parent = nullptr);

    QVariantList items() const;
    int itemCount() const;
    QString statusMessage() const;

    Q_INVOKABLE void addItem(const QString& text);
    Q_INVOKABLE void removeItem(int index);
    Q_INVOKABLE void clearAll();

signals:
    void itemsChanged();
    void itemCountChanged();
    void statusMessageChanged();

private:
    LogosAPI* m_api;
    QVariantList m_items;
    QString m_statusMessage;
};
```

**Rules for the backend:**

- All business logic lives here, not in QML
- Expose data via `Q_PROPERTY` with NOTIFY signals
- Expose actions via `Q_INVOKABLE` methods
- Call other modules via `LogosAPI`* here (never from QML JS)
- `statusMessage` pattern is useful for showing feedback in the status bar

## Step 7: `src/qml/Main.qml`

```qml
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    anchors.fill: parent
    color: "#1e1e1e"    // when inside Basecamp use Logos.Theme.backgroundColor

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        Text {
            text: "My App"
            font.pixelSize: 24
            color: "#ffffff"
        }

        ListView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            model: backend.items
            delegate: Text {
                text: modelData.name
                color: "#ffffff"
            }
        }

        Button {
            text: "Add Item"
            onClicked: backend.addItem("New Item")
        }

        Text {
            text: backend.statusMessage
            color: "#a0a0a0"
            font.pixelSize: 12
        }
    }
}
```

**QML Rules:**

- Access C++ backend via `backend` context property (set in `createWidget`)
- Bind to `Q_PROPERTY` values; react to signals via `Connections { target: backend }`
- When running inside Basecamp you can use `Logos.Theme` for colors and `Logos.Controls` for styled components
- When running standalone (`nix run .`) use plain QtQuick (no Logos.Theme available)
- Never put business logic in JavaScript

## Step 8: Dev Mode (QML changes without rebuild)

```bash
export QML_PATH=$PWD/src/qml
nix run .            # loads Main.qml from disk
# Edit src/qml/Main.qml, then restart — no nix build needed
```

C++ changes (`.h`, `.cpp`, `CMakeLists.txt`, `metadata.json`) always require `nix build`.

## Step 9: Build and Test

```bash
git init && git add -A   # nix needs files tracked
nix build                # compiles the plugin
nix run .                # launches standalone app (nix run .#app also works)
```

## Step 10: Load in Basecamp

```bash
nix build
cp -r result/* ~/.local/share/Logos/LogosBasecampDev/plugins/my_app/
# Launch Basecamp — find my_app in sidebar
```

