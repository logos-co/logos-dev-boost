import * as fs from "node:fs";
import * as path from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const scaffoldTool: Tool = {
  name: "logos_scaffold",
  description:
    "Generate a new Logos module or UI app project from templates. Creates the directory structure, metadata.json, flake.nix, CMakeLists.txt, and AI context files (AGENTS.md, CLAUDE.md).",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Module/app name in snake_case (e.g., 'crypto_utils', 'notes_app')",
      },
      type: {
        type: "string",
        enum: ["module", "ui-app"],
        description: "Project type: 'module' for universal C++ module, 'ui-app' for Basecamp UI app",
      },
      description: {
        type: "string",
        description: "Short description of the module/app",
      },
      externalLib: {
        type: "boolean",
        description: "Include external library wrapping scaffold (modules only)",
      },
      directory: {
        type: "string",
        description: "Parent directory to create the project in (defaults to current directory)",
      },
    },
    required: ["name", "type"],
  },
};

function toPascalCase(name: string): string {
  return name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

export function handleScaffold(args: Record<string, unknown>) {
  const name = args.name as string;
  const type = args.type as string;
  const description = (args.description as string) || `Logos ${type === "ui-app" ? "UI app" : "module"}`;
  const externalLib = (args.externalLib as boolean) || false;
  const parentDir = (args.directory as string) || process.cwd();

  if (!name || !name.match(/^[a-z][a-z0-9_]*$/)) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: name must be snake_case (e.g., 'crypto_utils')",
        },
      ],
      isError: true,
    };
  }

  const projectDir = path.join(parentDir, `logos-${name.replace(/_/g, "-")}`);

  if (fs.existsSync(projectDir)) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: directory already exists: ${projectDir}`,
        },
      ],
      isError: true,
    };
  }

  const filesCreated: string[] = [];

  if (type === "module") {
    createUniversalModule(projectDir, name, description, externalLib, filesCreated);
  } else if (type === "ui-app") {
    createUiApp(projectDir, name, description, filesCreated);
  }

  const relFiles = filesCreated.map((f) => path.relative(parentDir, f));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            project_dir: projectDir,
            files_created: relFiles,
            next_steps: [
              `cd ${path.basename(projectDir)}`,
              "git init && git add -A",
              "nix build",
              type === "module"
                ? `logoscore -m ./result/lib -l ${name} -c "${name}.methodName(args)"`
                : "cp -r result/* ~/.local/share/Logos/LogosBasecampDev/plugins/" + name + "/",
            ],
          },
          null,
          2
        ),
      },
    ],
  };
}

function writeFile(filePath: string, content: string, filesCreated: string[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  filesCreated.push(filePath);
}

function createUniversalModule(
  dir: string,
  name: string,
  description: string,
  externalLib: boolean,
  filesCreated: string[]
) {
  const pascal = toPascalCase(name);

  writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        description,
        author: "",
        type: "core",
        interface: "universal",
        category: "general",
        main: `${name}_plugin`,
        dependencies: [],
        include: [],
        capabilities: [],
        nix: {
          packages: { build: [], runtime: [] },
          external_libraries: externalLib
            ? [{ name: "mylib", build_command: "make", output_pattern: "build/libmylib.*" }]
            : [],
          cmake: { find_packages: [], extra_sources: [], extra_include_dirs: [], extra_link_libraries: [] },
        },
      },
      null,
      2
    ),
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${name}_impl.h`),
    `#pragma once
#include <string>
#include <vector>
#include <cstdint>

class ${pascal}Impl {
public:
    ${pascal}Impl();
    ~${pascal}Impl();

    std::string echo(const std::string& input);
    // Add your module's public API methods here
    // Only use: std::string, bool, int64_t, uint64_t, double, void, std::vector<T>

private:
    // Private members (not exposed as module API)
};
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${name}_impl.cpp`),
    `#include "${name}_impl.h"

${pascal}Impl::${pascal}Impl() {}
${pascal}Impl::~${pascal}Impl() {}

std::string ${pascal}Impl::echo(const std::string& input) {
    return "echo: " + input;
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "CMakeLists.txt"),
    `cmake_minimum_required(VERSION 3.14)
project(Logos${pascal}Plugin LANGUAGES CXX)

if(DEFINED ENV{LOGOS_MODULE_BUILDER_ROOT})
    include($ENV{LOGOS_MODULE_BUILDER_ROOT}/cmake/LogosModule.cmake)
else()
    message(FATAL_ERROR "LogosModule.cmake not found. Set LOGOS_MODULE_BUILDER_ROOT.")
endif()

configure_file(\${CMAKE_CURRENT_SOURCE_DIR}/metadata.json \${CMAKE_CURRENT_BINARY_DIR}/metadata.json COPYONLY)

logos_module(
    NAME ${name}
    SOURCES
        src/${name}_impl.h
        src/${name}_impl.cpp
        generated_code/${name}_qt_glue.h
        generated_code/${name}_dispatch.cpp
    INCLUDE_DIRS
        \${CMAKE_CURRENT_SOURCE_DIR}/generated_code
)
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "flake.nix"),
    `{
  description = "Logos ${pascal} Module";

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
        logos-cpp-generator --from-header src/${name}_impl.h \\
          --backend qt \\
          --impl-class ${pascal}Impl \\
          --impl-header ${name}_impl.h \\
          --metadata metadata.json \\
          --output-dir ./generated_code
      '';
    };
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `tests/test_${name}.cpp`),
    `#include "../src/${name}_impl.h"
#include <cassert>
#include <iostream>

int main() {
    ${pascal}Impl impl;

    assert(impl.echo("test") == "echo: test");

    std::cout << "All tests passed" << std::endl;
    return 0;
}
`,
    filesCreated
  );
}

function createUiApp(
  dir: string,
  name: string,
  description: string,
  filesCreated: string[]
) {
  const pascal = toPascalCase(name);
  const qmlEscDescription = description
    .replace(/\r?\n/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  const flakeEscDescription = description.replace(/"/g, '\\"').replace(/\r?\n/g, " ");

  writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        description,
        type: "ui",
        category: "ui",
        main: `${name}_plugin`,
        dependencies: [],
        nix: {
          packages: {
            build: [],
            runtime: ["qt6.qtdeclarative"],
          },
          external_libraries: [],
          cmake: { find_packages: [], extra_sources: [] },
        },
      },
      null,
      2
    ),
    filesCreated
  );

  writeFile(
    path.join(dir, "interfaces/IComponent.h"),
    `#pragma once

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
`,
    filesCreated
  );

  writeFile(
    path.join(dir, ".gitignore"),
    `.DS_Store
result
build/
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${name}_plugin.h`),
    `#pragma once

#include <IComponent.h>
#include <QObject>

class LogosAPI;

class ${pascal}Plugin : public QObject, public IComponent {
    Q_OBJECT
    Q_INTERFACES(IComponent)
    Q_PLUGIN_METADATA(IID IComponent_iid FILE "../metadata.json")

public:
    explicit ${pascal}Plugin(QObject* parent = nullptr);
    ~${pascal}Plugin();

    Q_INVOKABLE QWidget* createWidget(LogosAPI* logosAPI = nullptr) override;
    void destroyWidget(QWidget* widget) override;
};
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${name}_plugin.cpp`),
    `#include "${name}_plugin.h"
#include "${pascal}Backend.h"
#include <QDebug>
#include <QDir>
#include <QString>
#include <QtGlobal>
#include <QQuickWidget>
#include <QQmlContext>
#include <QQuickStyle>
#include <QUrl>

${pascal}Plugin::${pascal}Plugin(QObject* parent) : QObject(parent) {}
${pascal}Plugin::~${pascal}Plugin() {}

QWidget* ${pascal}Plugin::createWidget(LogosAPI* logosAPI) {
    QQuickStyle::setStyle("Basic");

    auto* quickWidget = new QQuickWidget();
    quickWidget->setMinimumSize(800, 600);
    quickWidget->setResizeMode(QQuickWidget::SizeRootObjectToView);

    auto* backend = new ${pascal}Backend(logosAPI, quickWidget);
    quickWidget->rootContext()->setContextProperty("backend", backend);

    // Dev mode: set QML_PATH to the directory containing Main.qml to load from disk without rebuilding.
    // Example: export QML_PATH=$PWD/src/qml
    const QString devSource = QString::fromUtf8(qgetenv("QML_PATH"));
    const QUrl qmlUrl = devSource.isEmpty()
        ? QUrl("qrc:/src/qml/Main.qml")
        : QUrl::fromLocalFile(QDir(devSource).filePath("Main.qml"));

    quickWidget->setSource(qmlUrl);

    if (quickWidget->status() == QQuickWidget::Error) {
        qWarning() << "${pascal}Plugin: failed to load QML from" << qmlUrl;
        for (const auto& e : quickWidget->errors()) {
            qWarning() << e.toString();
        }
    }

    return quickWidget;
}

void ${pascal}Plugin::destroyWidget(QWidget* widget) {
    delete widget;
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${pascal}Backend.h`),
    `#pragma once

#include <QObject>
#include <QString>
#include <QVariantList>

class LogosAPI;

class ${pascal}Backend : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList items READ items NOTIFY itemsChanged)
    Q_PROPERTY(QString statusMessage READ statusMessage NOTIFY statusMessageChanged)
    Q_PROPERTY(int itemCount READ itemCount NOTIFY itemCountChanged)

public:
    explicit ${pascal}Backend(LogosAPI* api, QObject* parent = nullptr);

    QVariantList items() const;
    QString statusMessage() const;
    int itemCount() const;

    Q_INVOKABLE void addNote(const QString& text);
    Q_INVOKABLE void removeItem(int index);
    Q_INVOKABLE void clearAll();

signals:
    void itemsChanged();
    void statusMessageChanged();
    void itemCountChanged();
    void noteAdded(int index, const QString& text);
    void noteRemoved(int index);

private:
    void setStatusMessage(const QString& message);
    void bumpCounts();

    LogosAPI* m_api;
    QVariantList m_items;
    QString m_statusMessage;
};
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${pascal}Backend.cpp`),
    `#include "${pascal}Backend.h"

#include <QDateTime>

${pascal}Backend::${pascal}Backend(LogosAPI* api, QObject* parent)
    : QObject(parent)
    , m_api(api)
{
    Q_UNUSED(m_api);
    setStatusMessage("Ready. Add a note below.");
}

QVariantList ${pascal}Backend::items() const {
    return m_items;
}

QString ${pascal}Backend::statusMessage() const {
    return m_statusMessage;
}

int ${pascal}Backend::itemCount() const {
    return m_items.size();
}

void ${pascal}Backend::setStatusMessage(const QString& message) {
    if (m_statusMessage == message) {
        return;
    }
    m_statusMessage = message;
    emit statusMessageChanged();
}

void ${pascal}Backend::bumpCounts() {
    emit itemsChanged();
    emit itemCountChanged();
}

void ${pascal}Backend::addNote(const QString& text) {
    const QString trimmed = text.trimmed();
    if (trimmed.isEmpty()) {
        setStatusMessage("Enter some text before adding a note.");
        return;
    }

    QVariantMap row;
    row["title"] = trimmed;
    row["created"] = QDateTime::currentDateTime().toString(Qt::ISODate);

    const int index = m_items.size();
    m_items.append(row);
    bumpCounts();
    emit noteAdded(index, trimmed);
    setStatusMessage(QString("Added note (%1 total).").arg(m_items.size()));
}

void ${pascal}Backend::removeItem(int index) {
    if (index < 0 || index >= m_items.size()) {
        setStatusMessage("Invalid note index.");
        return;
    }

    m_items.removeAt(index);
    bumpCounts();
    emit noteRemoved(index);
    setStatusMessage(m_items.isEmpty() ? "All notes cleared." : QString("Removed note (%1 left).").arg(m_items.size()));
}

void ${pascal}Backend::clearAll() {
    if (m_items.isEmpty()) {
        setStatusMessage("Nothing to clear.");
        return;
    }

    m_items.clear();
    bumpCounts();
    setStatusMessage("Cleared all notes.");
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "src/qml/Main.qml"),
    `import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    color: "#1e1e1e"

    Connections {
        target: backend

        function onNoteAdded(index, text) {
            noteField.clear()
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 16

        Text {
            text: "${pascal}"
            font.pixelSize: 24
            font.bold: true
            color: "#ffffff"
        }

        Text {
            text: "${qmlEscDescription}"
            font.pixelSize: 14
            color: "#a0a0a0"
            wrapMode: Text.Wrap
            Layout.fillWidth: true
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 36
            color: "#2d2d2d"
            radius: 4
            border.color: "#444444"
            border.width: 1

            TextField {
                id: noteField
                anchors.fill: parent
                anchors.margins: 4
                placeholderText: "Write a note…"
                color: "#ffffff"
                selectionColor: "#4A90E2"
                background: Rectangle { color: "transparent" }
            }
        }

        RowLayout {
            spacing: 10

            Button {
                text: "Add note"
                onClicked: backend.addNote(noteField.text)

                contentItem: Text {
                    text: parent.text
                    font.pixelSize: 13
                    color: parent.enabled ? "#ffffff" : "#808080"
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }

                background: Rectangle {
                    implicitWidth: 110
                    implicitHeight: 32
                    color: parent.enabled ? (parent.pressed ? "#1a7f37" : "#238636") : "#2d2d2d"
                    radius: 4
                    border.color: parent.enabled ? "#2ea043" : "#3d3d3d"
                    border.width: 1
                }
            }

            Button {
                text: "Clear all"
                enabled: backend.itemCount > 0
                onClicked: backend.clearAll()

                contentItem: Text {
                    text: parent.text
                    font.pixelSize: 13
                    color: parent.enabled ? "#ffffff" : "#808080"
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }

                background: Rectangle {
                    implicitWidth: 100
                    implicitHeight: 32
                    color: parent.enabled ? (parent.pressed ? "#5c1a1a" : "#7a2a2a") : "#2d2d2d"
                    radius: 4
                    border.color: parent.enabled ? "#c62828" : "#3d3d3d"
                    border.width: 1
                }
            }

            Item { Layout.fillWidth: true }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: "#252526"
            radius: 6
            border.color: "#333333"
            border.width: 1

            Text {
                anchors.centerIn: parent
                visible: backend.itemCount === 0
                text: "No notes yet.\\nAdd one with the field above."
                horizontalAlignment: Text.AlignHCenter
                color: "#808080"
                font.pixelSize: 14
            }

            ListView {
                id: noteList
                anchors.fill: parent
                anchors.margins: 8
                clip: true
                visible: backend.itemCount > 0
                model: backend.items
                spacing: 6

                delegate: Rectangle {
                    width: ListView.view.width
                    height: 56
                    color: index % 2 === 0 ? "#2d2d2d" : "#333333"
                    radius: 4
                    border.color: mouseArea.containsMouse ? "#4A90E2" : "#444444"
                    border.width: 1

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 12

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 4

                            Text {
                                text: modelData.title
                                color: "#ffffff"
                                font.pixelSize: 14
                                elide: Text.ElideRight
                                Layout.fillWidth: true
                            }

                            Text {
                                text: modelData.created || ""
                                color: "#a0a0a0"
                                font.pixelSize: 11
                            }
                        }

                        Button {
                            text: "Delete"
                            onClicked: backend.removeItem(index)

                            contentItem: Text {
                                text: parent.text
                                font.pixelSize: 12
                                color: parent.enabled ? "#ffffff" : "#808080"
                                horizontalAlignment: Text.AlignHCenter
                                verticalAlignment: Text.AlignVCenter
                            }

                            background: Rectangle {
                                implicitWidth: 72
                                implicitHeight: 28
                                color: parent.pressed ? "#5c1a1a" : "#7a2a2a"
                                radius: 4
                                border.color: "#c62828"
                                border.width: 1
                            }
                        }
                    }

                    MouseArea {
                        id: mouseArea
                        anchors.fill: parent
                        hoverEnabled: true
                        acceptedButtons: Qt.NoButton
                    }
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 36
            color: "#2d2d2d"
            radius: 4
            border.color: "#444444"
            border.width: 1

            Text {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.margins: 10
                text: backend.statusMessage
                color: "#c0c0c0"
                font.pixelSize: 12
                elide: Text.ElideRight
            }
        }
    }
}
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "CMakeLists.txt"),
    `cmake_minimum_required(VERSION 3.14)
project(${pascal}Plugin LANGUAGES CXX)

set(CMAKE_AUTOMOC ON)

if(DEFINED ENV{LOGOS_MODULE_BUILDER_ROOT})
    include($ENV{LOGOS_MODULE_BUILDER_ROOT}/cmake/LogosModule.cmake)
else()
    message(FATAL_ERROR "LogosModule.cmake not found. Set LOGOS_MODULE_BUILDER_ROOT.")
endif()

logos_module(
    NAME ${name}
    SOURCES
        src/${name}_plugin.h
        src/${name}_plugin.cpp
        src/${pascal}Backend.h
        src/${pascal}Backend.cpp
    INCLUDE_DIRS
        \${CMAKE_CURRENT_SOURCE_DIR}/interfaces
)

find_package(Qt6 REQUIRED COMPONENTS Widgets Quick QuickWidgets QuickControls2)

qt_add_resources(${name}_module_plugin ui_qml_resources
    PREFIX "/"
    FILES
        src/qml/Main.qml
)

target_link_libraries(${name}_module_plugin PRIVATE
    Qt6::Widgets
    Qt6::Quick
    Qt6::QuickWidgets
    Qt6::QuickControls2
)
`,
    filesCreated
  );

  writeFile(
    path.join(dir, "flake.nix"),
    `{
  description = "${flakeEscDescription}";

  inputs = {
    logos-module-builder.url = "github:logos-co/logos-module-builder";
    nix-bundle-lgx.url = "github:logos-co/nix-bundle-lgx";
  };

  outputs = inputs@{ logos-module-builder, ... }:
    let
      base = logos-module-builder.lib.mkLogosModule {
        src = ./.;
        configFile = ./metadata.json;
        flakeInputs = inputs;
      };
    in
    base // (
      if base ? apps then {
        apps = builtins.mapAttrs (_system: apps:
          apps // { app = apps.default; }
        ) base.apps;
      } else {}
    );
}
`,
    filesCreated
  );
}
