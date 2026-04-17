# logos-dev-boost

## Overall Description

logos-dev-boost is a developer acceleration tool for the Logos modular application platform. It provides AI coding agents and human developers with accurate, always-available knowledge of the Logos SDK, build system, module architecture, and development workflows.

The tool solves a fundamental problem: AI agents (Claude Code, Cursor, Copilot, Codex) have no training data about the Logos ecosystem. They hallucinate APIs, use wrong build commands, generate Qt-dependent code where pure C++ is required, and cannot navigate the multi-repo architecture. Human developers face a similar but smaller-scale problem — the onboarding path from "I want to build a Logos module" to a working, packaged, tested plugin is steep.

logos-dev-boost addresses this by operating at three levels:

1. **Always-loaded context** — `AGENTS.md` / `CLAUDE.md` files with a compressed documentation index. Loaded automatically at session start. Based on Next.js research showing 100% AI eval pass rate with bundled docs versus 79% with skills-only approaches.
2. **On-demand skills** — Detailed, step-by-step task guides that activate when the agent works on a specific task. Follows the Agent Skills specification for cross-tool compatibility.
3. **MCP server** — Live project introspection tools (project info, documentation search, API reference, build help, scaffolding) via the Model Context Protocol.

## Definitions & Acronyms

| Term | Definition |
|------|------------|
| **Universal Module** | A Logos module whose implementation is pure C++ (no Qt types). All Qt glue is generated at build time by `logos-cpp-generator --from-header`. Identified by `"interface": "universal"` in metadata.json. |
| **UI App** | A QML-based UI component displayed as a tab in Basecamp's MDI workspace. Either pure QML (calls backend modules via `logos.callModule()`) or QML + process-isolated C++ backend (Qt Remote Objects). Identified by `"type": "ui_qml"` in metadata.json. |
| **LIDL** | Logos Interface Definition Language — a lightweight DSL for declaring module interfaces. Alternative to the `--from-header` C++ parser path. Both produce identical generated output. |
| **Provider Glue** | Generated code (`_qt_glue.h`, `_dispatch.cpp`) that wraps a pure C++ implementation class in a `LogosProviderObject` with `callMethod()` dispatch and `getMethods()` introspection. |
| **Client Stub** | Generated type-safe C++ wrapper class that callers use to invoke a module's methods without string-based dispatch. |
| **LogosAPI** | The runtime API that modules use to call other modules. Provides `callModule(name, method, args)` which returns a `LogosResult`. |
| **LogosResult** | Structured return type for cross-module calls. Contains `success()`, `data()` (QVariant), and `errorMessage()`. |
| **LGX** | Logos Package Format — gzip tar archives with platform-specific variants for distributing modules and UI apps. |
| **logoscore** | Headless CLI runtime that loads modules and optionally calls their methods. Used for testing modules without the full GUI. |
| **logos_host** | Per-module host process spawned by `liblogos_core`. Each module runs in isolation, communicating via Qt Remote Objects IPC. |
| **MCP** | Model Context Protocol — open standard for AI agent tool integration. logos-dev-boost exposes tools via MCP's stdio transport. |
| **Agent Skill** | A portable knowledge module (SKILL.md + optional assets) that AI agents activate on demand. Follows the agentskills.io specification. |

## Domain Model

### Two Component Types

This distinction is fundamental to the entire Logos ecosystem and to everything logos-dev-boost teaches:

**Logos Modules (core)** are process-isolated backend services. The developer writes a plain C++ implementation class using standard types (`std::string`, `int64_t`, `std::vector<T>`, `bool`). No Qt types appear in user code. The build system runs `logos-cpp-generator --from-header` to generate all Qt glue: the plugin class, method dispatch table, and introspection metadata. Modules are loaded by `logoscore` (headless) or `logos-basecamp` (GUI) via `liblogos_core`. Each runs in its own isolated `logos_host` process and communicates via Qt Remote Objects IPC.

Reference implementation: `logos-accounts-module` — `metadata.json` has `"interface": "universal"`, `src/accounts_module_impl.h` is pure C++, `flake.nix` runs the code generator in `preConfigure`.

**UI Apps** (`"type": "ui_qml"`) are QML-based UI components displayed as tabs in Basecamp's MDI workspace. Two subtypes exist: pure QML apps (no C++, call backend modules via `logos.callModule()`) and QML + C++ backend apps (process-isolated C++ backend communicating via Qt Remote Objects, QML gets a typed replica via `logos.module()`).

```
                   Logos Module (universal)             UI App (ui_qml)
                   ─────────────────────────            ──────────────────────────
User writes:       Pure C++ impl header                 QML (pure) or QML + .rep + C++ plugin
                   (std::string, int64_t, etc.)         (Qt types OK in backend)

Generated:         Qt glue, dispatch, plugin class      QTRO source/replica (from .rep)
                   (logos-cpp-generator --from-header)

metadata.json:     "interface": "universal"             "type": "ui_qml"
                   "type": "core"                       "view": "Main.qml"

Loaded by:         logoscore / liblogos_core            Basecamp / standalone runner
Runs in:           Isolated logos_host process           QML in-process, C++ backend in logos_host
Has UI:            No                                   Yes (tab in MDI workspace)
```

### Universal Module Type System

The code generator maps C++ standard types to LIDL types to Qt types:

| C++ type | LIDL type | Qt type |
|----------|-----------|---------|
| `std::string` / `const std::string&` | `tstr` | `QString` |
| `bool` | `bool` | `bool` |
| `int64_t` | `int` | `int` |
| `uint64_t` | `uint` | `int` |
| `double` | `float64` | `double` |
| `void` | `void` | `void` |
| `std::vector<std::string>` | `[tstr]` | `QStringList` |
| `std::vector<uint8_t>` | `bstr` | `QByteArray` |
| `std::vector<int64_t>` | `[int]` | `QVariantList` |
| `std::vector<bool>` | `[bool]` | `QVariantList` |

Module authors only work with the C++ column. The generator handles everything else.

### How logos-dev-boost Layers Work Together

```
Layer 1: AGENTS.md / CLAUDE.md        Always loaded at session start
         (compressed docs index)       Every AI tool reads these automatically
                │
Layer 2: Guidelines                    Loaded into AGENTS.md content
         (core, universal-module,      Conventions the agent must always follow
          ui-app, nix-build, etc.)
                │
Layer 3: Skills                        Activated on demand by the AI agent
         (create-module, package,      Detailed step-by-step task guides
          test, wrap-lib, etc.)
                │
Layer 4: MCP Server                    Called by the agent when it needs live data
         (project-info, search-docs,   Parses the actual project on disk
          api-reference, build-help)
                │
Layer 5: Scaffolding                   Generates new projects from templates
         (init command, templates)     Pre-configured with correct AI context
```

## User/Agent Journeys

### Journey 1: Create a Universal C++ Module

The primary journey. A developer (or AI agent) creates a pure C++ module with no Qt in user code.

**Step 1: Scaffold the project**

```
nix run github:logos-co/logos-dev-boost -- init crypto_utils --type module
```

Or tell an AI agent in an empty directory: "create a new Logos module called crypto_utils that provides hashing utilities"

The `create-universal-module` skill activates. Output:

```
crypto_utils/
├── src/
│   ├── crypto_utils_impl.h       # Pure C++ class (std::string, bool, etc.)
│   └── crypto_utils_impl.cpp     # Implementation stubs
├── metadata.json                 # "interface": "universal", "type": "core"
├── CMakeLists.txt                # logos_module() with generated_code sources
├── flake.nix                     # preConfigure runs logos-cpp-generator --from-header
├── tests/
│   ├── main.cpp                  # LOGOS_TEST_MAIN() entry point
│   ├── test_crypto_utils.cpp     # Unit tests using LOGOS_TEST() and assertions
│   └── CMakeLists.txt            # logos_test() macro (auto-detected by builder)
├── CLAUDE.md                     # Generated: knows this is a universal module
├── AGENTS.md                     # Universal context for any AI tool
└── .mcp.json                     # MCP server registration
```

**Step 2: Implement business logic in pure C++**

```cpp
#pragma once
#include <string>
#include <vector>
#include <cstdint>

class CryptoUtilsImpl {
public:
    std::string hash(const std::string& input);
    bool verify(const std::string& input, const std::string& hash);
    std::string generateKey(int64_t bits);
    std::vector<std::string> listAlgorithms();
};
```

No `Q_OBJECT`, no `Q_INVOKABLE`, no `QString`. The code generator handles all Qt integration at build time.

**Step 3: Build**

```bash
nix build
```

The generator runs automatically via `preConfigure` in `flake.nix`:

```bash
logos-cpp-generator --from-header src/crypto_utils_impl.h \
  --backend qt \
  --impl-class CryptoUtilsImpl \
  --impl-header crypto_utils_impl.h \
  --metadata metadata.json \
  --output-dir ./generated_code
```

This produces `generated_code/crypto_utils_qt_glue.h` and `generated_code/crypto_utils_dispatch.cpp` containing the Qt plugin class, method dispatch, and introspection metadata.

**Step 4: Test with logoscore**

```bash
logoscore -m ./result/lib -l crypto_utils \
  -c "crypto_utils.hash(hello_world)"
```

**Step 5: Unit test (no logoscore needed)**

```bash
nix build .#unit-tests -L
```

Unit tests use logos-test-framework (`LOGOS_TEST()` macros, `LOGOS_ASSERT_*`) and instantiate `CryptoUtilsImpl` directly — it is a plain C++ class with no framework dependencies. `logos-module-builder` auto-detects `tests/CMakeLists.txt` and creates the `unit-tests` target.

**Step 6: Inter-module communication**

Other modules call crypto_utils via LogosAPI:

```cpp
LogosResult result = api->callModule("crypto_utils", "hash", {"hello"});
if (result.success()) {
    std::string hashValue = result.data().toString().toStdString();
}
```

**Step 7: Package for distribution**

```bash
lgx create crypto_utils
lgx add crypto_utils.lgx -v linux-x86_64 -f ./result/lib/crypto_utils_plugin.so
lgx add crypto_utils.lgx -v darwin-arm64 -f ./result/lib/crypto_utils_plugin.dylib
lgx verify crypto_utils.lgx
```

**What logos-dev-boost provides at each step:**

- Step 1: `init` command scaffolds from universal module template; generated CLAUDE.md/AGENTS.md teach agents the universal pattern
- Step 2: Guidelines ensure pure C++, no Qt types; the type mapping table is always available
- Step 3: Build help explains the codegen pipeline; troubleshooting for common generator errors
- Steps 4-5: Testing skill covers logos-test-framework unit tests (LOGOS_TEST, LogosTestContext, mocking) and logoscore integration tests
- Step 6: Inter-module comm skill explains LogosAPI patterns and dependency declaration
- Step 7: Packaging skill covers the full LGX workflow

### Journey 2: Wrap an External C/C++ Library as a Module

Like `logos-accounts-module` wrapping `go-wallet-sdk`, or a module wrapping libsodium.

**Step 1: Scaffold with external lib flag**

```bash
nix run github:logos-co/logos-dev-boost -- init sodium_module --type module --external-lib
```

Output includes `lib/` directory structure and `metadata.json` with `"nix.external_libraries"` pre-configured.

**Step 2: Configure the external library in metadata.json**

```json
{
  "nix": {
    "external_libraries": [{
      "name": "libsodium",
      "build_command": "make",
      "output_pattern": "build/libsodium.*"
    }]
  }
}
```

**Step 3: Write impl header wrapping the C API**

```cpp
#pragma once
#include <string>
#include <vector>

extern "C" {
    #include "lib/sodium.h"
}

class SodiumModuleImpl {
public:
    std::string encrypt(const std::string& plaintext, const std::string& key);
    std::string decrypt(const std::string& ciphertext, const std::string& key);
    std::string generateKey();
};
```

The external C API is accessed via `extern "C"` includes. The impl class presents a clean C++ interface that the generator can process.

**Steps 4+:** Same as Journey 1 (build, test, package).

### Journey 3a: Create a Pure QML UI App

A Basecamp UI App with no C++ — QML only, calls backend modules via `logos.callModule()`.

**Step 1: Scaffold**

```bash
nix run github:logos-co/logos-dev-boost -- init notes_ui --type ui-qml
```

Output:

```
notes_ui/
├── Main.qml                      # QML entry point
├── metadata.json                 # "type": "ui_qml", "view": "Main.qml"
├── flake.nix                     # mkLogosQmlModule
├── CLAUDE.md
└── AGENTS.md
```

**Step 2: Develop the QML UI**

```qml
import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    Button {
        text: "Save Note"
        onClicked: {
            var result = logos.callModule("storage_module", "save", [noteField.text])
            console.log("Saved:", result)
        }
    }
}
```

**Step 3: Build and run**

```bash
nix build
nix run .    # standalone app with QML Inspector on localhost:3768
```

The QML Inspector MCP server starts automatically. AI agents can use `qml_screenshot`, `qml_find_and_click`, `qml_get_tree`, etc. to interact with and verify the UI. Write `.mjs` test files in `tests/` for headless CI testing via `nix build .#integration-test`.

### Journey 3b: Create a QML + C++ Backend UI App

A Basecamp UI App with process-isolated C++ backend and QML frontend.

**Step 1: Scaffold**

```bash
nix run github:logos-co/logos-dev-boost -- init notes_app --type ui-qml-backend
```

Output:

```
notes_app/
├── src/
│   ├── notes_app.rep             # Qt Remote Objects interface
│   ├── notes_app_interface.h     # extends PluginInterface
│   ├── notes_app_plugin.h        # SimpleSource + ViewPluginBase
│   ├── notes_app_plugin.cpp      # implementation
│   └── qml/
│       └── Main.qml              # QML frontend (logos.module() replica)
├── metadata.json                 # "type": "ui_qml", "main": "notes_app_plugin"
├── CMakeLists.txt                # REP_FILE
├── flake.nix                     # mkLogosQmlModule
├── CLAUDE.md
└── AGENTS.md
```

**Step 2: Define the backend interface (.rep file)**

```
class NotesApp
{
    PROP(QString status READWRITE)
    PROP(QVariantList notes READWRITE)
    SLOT(void addNote(const QString& title))
    SLOT(void deleteNote(int index))
}
```

**Step 3: Implement the C++ backend**

```cpp
class NotesAppPlugin : public NotesAppSimpleSource,
                       public NotesAppInterface,
                       public NotesAppViewPluginBase
{
    Q_OBJECT
    Q_PLUGIN_METADATA(IID NotesAppInterface_iid FILE "metadata.json")
    Q_INTERFACES(NotesAppInterface)

public:
    Q_INVOKABLE void initLogos(LogosAPI* api) {
        m_logosAPI = api;
        setBackend(this);
    }

    void addNote(const QString& title) override { /* ... */ }
    void deleteNote(int index) override { /* ... */ }
};
```

**Step 4: Develop the QML frontend**

```qml
import QtQuick
import QtQuick.Controls

Item {
    readonly property var backend: logos.module("notes_app")
    readonly property bool ready: logos.isViewModuleReady("notes_app")

    ListView {
        model: backend ? backend.notes : []
        delegate: Text { text: modelData.title }
    }

    Button {
        text: "Add Note"
        enabled: root.ready
        onClicked: logos.watch(backend.addNote("New Note"),
            function() { console.log("Added") },
            function(err) { console.log("Error:", err) }
        )
    }
}
```

**Step 5: Build and test**

```bash
nix build
nix run .    # standalone app with QML Inspector on localhost:3768
```

AI agents can test the running UI via MCP tools (`qml_screenshot`, `qml_find_and_click`, etc.). Write `.mjs` test files in `tests/` for headless CI via `nix build .#integration-test`.

**The C++/QML boundary** (taught by guidelines):

| Concern | Goes in C++ | Goes in QML |
|---------|-------------|-------------|
| Data models, state | `PROP()` in `.rep` file | Bind to `backend.property` |
| Business logic | `SLOT()` in `.rep` + implement in plugin | Never — no JS business logic |
| Module calls | `LogosAPI*` in `initLogos()` | `logos.callModule()` (pure QML only) |
| File I/O, networking | Always C++ | Never |
| UI layout, styling | Never | Always — `Logos.Theme`, `Logos.Controls` |
| User interactions | `SLOT()` methods | `logos.watch(backend.doX())` |
| Plugin lifecycle | `initLogos()` + `setBackend(this)` | N/A |

### Journey 4: AI Agent Building a Module from Scratch

What happens when a developer tells an AI agent "create a module that provides encryption utilities":

1. Agent reads AGENTS.md (always loaded) — knows about universal interface, Logos ecosystem, type system, build pipeline. This is the critical difference from not having logos-dev-boost.

2. Agent activates `create-universal-module` skill — gets step-by-step template with correct file structure, `metadata.json` schema, `flake.nix` pattern with `preConfigure`.

3. Agent writes pure C++ impl header — guidelines ensure it uses `std::string` not `QString`, `int64_t` not `int`, returns meaningful types from the type mapping table.

4. Agent writes `flake.nix` — skill provides exact template with `logos-cpp-generator --from-header` in `preConfigure` and correct `logos-module-builder` input.

5. Agent builds with `nix build` — build-help guidelines explain the pipeline. If errors occur, agent knows common fixes: generator type mapping issues, missing `find_package`, `metadata.json`/header class name mismatch.

6. Agent runs unit tests with `nix build .#unit-tests -L` — the scaffolded `tests/` directory uses logos-test-framework (`LOGOS_TEST()`, `LOGOS_ASSERT_*`). Tests are auto-detected by `logos-module-builder`. Agent also tests with `logoscore` for integration testing — testing skill provides exact commands and expected output patterns.

**Without logos-dev-boost:** Agent would write `Q_INVOKABLE` methods, use `QString` everywhere, try `cmake --build` instead of `nix build`, hallucinate a `LogosPlugin` base class that doesn't exist, and have no idea about the code generator pipeline.

### Journey 5: Installing logos-dev-boost for an Existing Project

For a developer with an existing Logos module who wants AI assistance:

**Step 1: Run the installer**

```bash
nix run github:logos-co/logos-dev-boost -- install
```

**Step 2: Interactive configuration**

```
Detected: Universal C++ module (accounts_module)
SDK version: logos-cpp-sdk 0.3.0

Which AI tools do you use?
  [x] Claude Code
  [x] Cursor
  [ ] Codex
  [ ] Gemini CLI

Generated:
  CLAUDE.md           (always-loaded context for Claude Code)
  AGENTS.md           (universal context for any AI tool)
  .cursor/rules/logos.mdc  (Cursor-specific rules)
  .claude/skills/     (8 skills for Claude Code)
  .mcp.json           (MCP server registration)
  .logos-dev-boost/   (pre-built MCP server binary)
```

**Step 3: AI tools auto-detect configuration**

- Claude Code reads `CLAUDE.md` automatically, discovers `.claude/skills/`, connects to MCP server via `.mcp.json`
- Cursor reads `AGENTS.md` automatically, loads `.cursor/rules/logos.mdc`, connects to MCP server
- Manual fallback if auto-detection fails:
  - Claude Code: `claude mcp add -s local -t stdio logos-dev-boost node .logos-dev-boost/mcp-server/index.js`
  - Cursor: Command Palette -> "/open MCP Settings" -> toggle on `logos-dev-boost`
  - Codex: `codex mcp add logos-dev-boost -- node .logos-dev-boost/mcp-server/index.js`

## Features & Requirements

### Phase 1: Foundation (MVP)

- Always-loaded context files (AGENTS.md, CLAUDE.md) with compressed documentation index
- 7 guideline files covering core conventions, universal modules, UI apps, Nix build, testing, metadata.json, and code generation
- 8 on-demand skills for common development tasks
- Scaffolding templates for universal modules, external library modules, and UI apps
- Context file generators (AGENTS.md, CLAUDE.md, .cursor/rules, llms.txt)
- Nix flake with `init`, `install`, and `generate` commands

### Phase 2: MCP Server

- Live project introspection via 5 MCP tools (project-info, search-docs, api-reference, build-help, scaffold)
- Full-text documentation search over bundled docs
- Context-aware build commands with troubleshooting
- Interactive installer that detects AI tools and generates per-tool configuration

### Phase 3: Rich Features

- Semantic documentation search with local ONNX embeddings
- Cross-repo dependency graph tool
- LIDL language validation and preview
- Integration with logos-qt-mcp for combined dev-time and runtime introspection

### Phase 4: Ecosystem

- Third-party module skills (module authors ship skills in their repos)
- Hosted documentation API with centralized semantic search
- CI integration (`logos-dev-boost check` validates project configuration)
- Auto-update for context files when dependencies change

## Success Metrics

1. **Module creation time** — An AI agent can scaffold, build, and test a new universal C++ module in under 5 minutes (currently impossible without deep knowledge)
2. **Zero hallucinated APIs** — Agents never suggest non-existent Logos APIs or use Qt types in universal module code
3. **Build success rate** — Agent-generated Nix flakes and C++ impl headers build on first try
4. **Correct interface choice** — Agents use the universal interface for modules and ui_qml for UI apps, never mixing the two
5. **Onboarding time** — New human developers can create their first module in under 30 minutes with AI assistance

## Supported Platforms

logos-dev-boost runs on any platform with Nix:
- Linux (x86_64, aarch64)
- macOS (x86_64, aarch64)

The generated context files (AGENTS.md, CLAUDE.md, skills) are plain text and work on any platform.
