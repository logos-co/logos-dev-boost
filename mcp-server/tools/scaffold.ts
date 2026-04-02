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

  writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        description,
        type: "ui",
        category: "tools",
        main: `${name}_plugin`,
        dependencies: [],
      },
      null,
      2
    ),
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${pascal}Plugin.h`),
    `#pragma once
#include <QObject>
#include <QWidget>
#include <QtPlugin>
#include "IComponent.h"

class ${pascal}Plugin : public QObject, public IComponent {
    Q_OBJECT
    Q_INTERFACES(IComponent)
    Q_PLUGIN_METADATA(IID IComponent_iid FILE "metadata.json")
public:
    QWidget* createWidget(LogosAPI* logosAPI = nullptr) override;
    void destroyWidget(QWidget* widget) override;
};
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${pascal}Plugin.cpp`),
    `#include "${pascal}Plugin.h"
#include "${pascal}Backend.h"
#include <QQuickWidget>
#include <QQmlContext>

QWidget* ${pascal}Plugin::createWidget(LogosAPI* logosAPI) {
    auto* widget = new QQuickWidget;
    auto* backend = new ${pascal}Backend(logosAPI, widget);
    widget->rootContext()->setContextProperty("backend", backend);
    widget->setSource(QUrl("qrc:/qml/Main.qml"));
    widget->setResizeMode(QQuickWidget::SizeRootObjectToView);
    return widget;
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
#include <QVariantList>

class LogosAPI;

class ${pascal}Backend : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList items READ items NOTIFY itemsChanged)
public:
    explicit ${pascal}Backend(LogosAPI* api, QObject* parent = nullptr);
    QVariantList items() const;

    Q_INVOKABLE void addItem(const QString& name);
    Q_INVOKABLE void removeItem(int index);

signals:
    void itemsChanged();

private:
    LogosAPI* m_api;
    QVariantList m_items;
};
`,
    filesCreated
  );

  writeFile(
    path.join(dir, `src/${pascal}Backend.cpp`),
    `#include "${pascal}Backend.h"

${pascal}Backend::${pascal}Backend(LogosAPI* api, QObject* parent)
    : QObject(parent), m_api(api) {}

QVariantList ${pascal}Backend::items() const { return m_items; }

void ${pascal}Backend::addItem(const QString& name) {
    QVariantMap item;
    item["name"] = name;
    m_items.append(item);
    emit itemsChanged();
}

void ${pascal}Backend::removeItem(int index) {
    if (index >= 0 && index < m_items.size()) {
        m_items.removeAt(index);
        emit itemsChanged();
    }
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
    anchors.fill: parent

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12

        Text {
            text: "${pascal}"
            font.pixelSize: 24
        }

        ListView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            model: backend.items
            delegate: Text {
                text: modelData.name
            }
        }

        Button {
            text: "Add Item"
            onClicked: backend.addItem("New Item")
        }
    }
}
`,
    filesCreated
  );
}
