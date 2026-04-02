---
name: create-ui-app
description: Activate when creating a Logos Basecamp UI app with IComponent, C++ backend, and QML frontend. Covers the plugin class, QObject backend, QML entry point, and the C++/QML boundary.
---

# Create a UI App for Logos Basecamp

## When to Use

Use this skill when:
- Creating an application with a graphical interface for Basecamp
- Building an `IComponent` plugin with `createWidget` / `destroyWidget`
- The app has a C++ backend and QML frontend

## Step 1: Create Project Structure

```
my_app/
├── src/
│   ├── MyAppPlugin.h
│   ├── MyAppPlugin.cpp
│   ├── MyAppBackend.h
│   ├── MyAppBackend.cpp
│   └── qml/
│       ├── Main.qml
│       └── resources.qrc
├── metadata.json
├── CMakeLists.txt
└── flake.nix
```

## Step 2: Create metadata.json

```json
{
  "name": "my_app",
  "version": "1.0.0",
  "description": "My Basecamp UI application",
  "type": "ui",
  "category": "tools",
  "main": "my_app_plugin",
  "dependencies": []
}
```

Note: UI apps do NOT use `"interface": "universal"`. They are hand-written Qt plugins.

## Step 3: Create the Plugin Class

`src/MyAppPlugin.h`:

```cpp
#pragma once
#include <QObject>
#include <QWidget>
#include <QtPlugin>
#include "IComponent.h"

class MyAppPlugin : public QObject, public IComponent {
    Q_OBJECT
    Q_INTERFACES(IComponent)
    Q_PLUGIN_METADATA(IID IComponent_iid FILE "metadata.json")
public:
    QWidget* createWidget(LogosAPI* logosAPI = nullptr) override;
    void destroyWidget(QWidget* widget) override;
};
```

`src/MyAppPlugin.cpp`:

```cpp
#include "MyAppPlugin.h"
#include "MyAppBackend.h"
#include <QQuickWidget>
#include <QQmlContext>

QWidget* MyAppPlugin::createWidget(LogosAPI* logosAPI) {
    auto* widget = new QQuickWidget;
    auto* backend = new MyAppBackend(logosAPI, widget);
    widget->rootContext()->setContextProperty("backend", backend);
    widget->setSource(QUrl("qrc:/qml/Main.qml"));
    widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
    return widget;
}

void MyAppPlugin::destroyWidget(QWidget* widget) {
    delete widget;
}
```

## Step 4: Create the Backend Class

`src/MyAppBackend.h`:

```cpp
#pragma once
#include <QObject>
#include <QVariantList>

class LogosAPI;

class MyAppBackend : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList items READ items NOTIFY itemsChanged)
public:
    explicit MyAppBackend(LogosAPI* api, QObject* parent = nullptr);
    QVariantList items() const;

    Q_INVOKABLE void addItem(const QString& name);
    Q_INVOKABLE void removeItem(int index);

signals:
    void itemsChanged();

private:
    LogosAPI* m_api;
    QVariantList m_items;
};
```

**Rules for the backend:**
- All business logic lives here, not in QML
- Expose data via `Q_PROPERTY` with NOTIFY signals
- Expose actions via `Q_INVOKABLE` methods
- Call other modules via `LogosAPI::callModule()` here

## Step 5: Create Main.qml

`src/qml/Main.qml`:

```qml
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Logos.Theme
import Logos.Controls

Rectangle {
    anchors.fill: parent
    color: Logos.Theme.backgroundColor

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        LogosText {
            text: "My App"
            font.pixelSize: 24
        }

        ListView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            model: backend.items
            delegate: LogosText {
                text: modelData.name
            }
        }

        LogosButton {
            text: "Add Item"
            onClicked: backend.addItem("New Item")
        }
    }
}
```

**QML Rules:**
- Use `Logos.Theme` for all colors
- Use `Logos.Controls` for interactive elements
- Access C++ backend via `backend` context property
- Never put business logic in JavaScript

## Step 6: Create resources.qrc

`src/qml/resources.qrc`:

```xml
<RCC>
    <qresource prefix="/">
        <file>qml/Main.qml</file>
    </qresource>
</RCC>
```

## Step 7: Test in Basecamp

```bash
nix build
cp -r result/* ~/.local/share/Logos/LogosBasecampDev/plugins/my_app/
# Launch Basecamp — find my_app in sidebar
```

QML changes hot-reload when running in dev mode (`./run-dev.sh`). C++ changes require a rebuild.
