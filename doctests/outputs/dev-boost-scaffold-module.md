# Scaffolding a Pure C++ Module with logos-dev-boost

`logos-dev-boost` is the AI-assisted accelerator for the Logos platform: its
`init` command scaffolds a ready-to-build project — source, Nix build files,
tests, and AI context — from a single command. This doc-test exercises **this**
dev-boost commit end-to-end on its headline use case: a **universal (pure C++)
module**.

Starting from nothing, it:

1. Scaffolds a `crypto_utils` module with
   `logos-dev-boost init crypto_utils --type module` — built from the commit
   under test, not the latest published flake.
2. Builds the scaffolded module through Nix. The build runs
   `logos-cpp-generator` over the plain C++ interface to synthesise all the Qt
   plugin glue, so your code never touches Qt.
3. Introspects the compiled plugin with `lm`, confirming the `echo` method the
   scaffold exposes is a discoverable `Q_INVOKABLE`.
4. Builds and runs the scaffold's generated unit tests (`nix build .#unit-tests`).
5. Loads the module into the headless `logoscore` runtime and calls `echo` —
   a real IPC round-trip into the freshly-scaffolded module.

Because every step runs against the scaffold this dev-boost commit emits, a
green run is real evidence that `init --type module` still produces a module
that builds, introspects, tests, and runs.

**What you'll build:** A `crypto_utils` universal C++ module, scaffolded by this dev-boost commit, then built, introspected, unit-tested, and called through `logoscore`.

**What you'll learn:**

- How `logos-dev-boost init --type module` scaffolds a pure C++ module
- How the Nix build generates Qt plugin glue from a plain C++ interface
- How to introspect a compiled module's `Q_INVOKABLE` methods with `lm`
- How to run a scaffolded module's generated unit tests
- How to call a module method through the headless `logoscore` runtime

## Prerequisites

- **Nix** with flakes enabled. Install from [nixos.org](https://nixos.org/download.html), then enable flakes:

```bash
mkdir -p ~/.config/nix
echo 'experimental-features = nix-command flakes' >> ~/.config/nix/nix.conf
```

Verify: `nix flake --help >/dev/null 2>&1 && echo "Flakes enabled"`

- **git** — the scaffolded project is a flake, and Nix only sees git-tracked files.
- A Linux or macOS machine.

---

## Step 1: Scaffold the module

Run `logos-dev-boost init` with `--type module`. This is the default and
most common project type: a **universal** module written in plain C++
(`std::string`, `int64_t`, `std::vector<T>`) with no Qt in your sources.
The command creates a `logos-crypto-utils/` directory containing the impl
class, `metadata.json`, a `flake.nix`, generated unit tests, and AI context
files.

> `` pins dev-boost to the commit under test: the runner expands it
> to this checkout's `HEAD` locally (see `run.sh`), or the PR commit in CI.
> With no pin it falls back to the latest published `master`.

### 1.1 Run init

```bash
nix run github:logos-co/logos-dev-boost -- init crypto_utils --type module
```

The scaffold lays out a complete, buildable project:

```
logos-crypto-utils/
├── src/
│   ├── crypto_utils_impl.h     # Pure C++ interface — your code
│   └── crypto_utils_impl.cpp   # Implementation
├── tests/
│   ├── main.cpp                # LOGOS_TEST_MAIN() entry point
│   ├── test_crypto_utils.cpp   # Generated unit tests
│   └── CMakeLists.txt          # logos_test() wiring
├── metadata.json               # Module identity, deps, build config
├── CMakeLists.txt              # logos_module() build config
├── flake.nix                   # Nix build (generates Qt glue)
├── AGENTS.md / CLAUDE.md       # AI context
└── .mcp.json / .claude/skills/ # MCP server + on-demand skills
```

### 1.2 Confirm the key source files exist

### 1.3 Confirm the flake and generated tests exist

### 1.4 Inspect the generated interface

The scaffold's interface is plain C++ — a single `echo` method, no Qt
types. The Nix build turns this into a Qt plugin for you.

```bash
cat logos-crypto-utils/src/crypto_utils_impl.h
```

`echo(const std::string&)` is the module's entire public API. Every
public method on this class becomes a discoverable, callable module
method once the build generates the Qt glue around it.

---

## Step 2: Build the module

`nix build` compiles the scaffolded module. Under the hood the flake runs
`logos-cpp-generator --from-header` over `crypto_utils_impl.h` to synthesise
the Qt plugin wrapper and dispatch code, then builds the plugin. Nix only
sees git-tracked files, so we `git init` and stage everything first.

### 2.1 Init git, stage, and build

```bash
cd logos-crypto-utils
git init && git add -A
nix build
```

The build produces `result/lib/crypto_utils_plugin.dylib` — a Qt plugin
wrapping your plain `CryptoUtilsImpl` class. No Qt appeared in your
sources; the generator produced all of it.

---

## Step 3: Inspect the module with `lm`

[`lm`](https://github.com/logos-co/logos-module) is the module inspector: it
loads a compiled plugin and prints its metadata and the `Q_INVOKABLE`
methods it exposes. Build it once and link it as `./lm`.

### 3.1 Build lm

```bash
nix build 'github:logos-co/logos-module#lm' -o lm
```

The inspector is at `./lm/bin/lm`.

### 3.2 Inspect the plugin

Point `lm` at the built plugin. It reports the module name from
`metadata.json` and lists `echo` among the exposed methods — proof the
generator turned the plain C++ method into a real module API.

```bash
lm crypto_utils_plugin.dylib
```

---

## Step 4: Run the generated unit tests

Because a universal module is a plain C++ class, the scaffold ships unit
tests that construct `CryptoUtilsImpl` directly — no Qt, no host, no IPC.
The generated `tests/test_crypto_utils.cpp` asserts that `echo("hello")`
returns `"echo: hello"`. `nix build .#unit-tests` compiles and runs them.

### 4.1 Build and run the unit tests

```bash
nix build '.#unit-tests' -L
```

The build compiles `crypto_utils_impl.cpp` against the test sources and
runs every `LOGOS_TEST`. A failed assertion prints its file/line and
fails the build; a green build means every generated test passed.

---

## Step 5: Run the module in `logoscore`

Finally, run the scaffolded module in the real headless runtime. Build the
[`logoscore`](https://github.com/logos-co/logos-logoscore-cli) CLI, install
the module into a runtime `modules/` directory, then start the daemon, load
`crypto_utils`, and call `echo` — a real IPC round-trip into the module.

### 5.1 Build logoscore

```bash
nix build 'github:logos-co/logos-logoscore-cli' -o logos
```

The runtime is at `./logos/bin/logoscore`.

### 5.2 Install the module into a runtime directory

`logoscore` discovers modules from `modules/<name>/` directories, each
with a `manifest.json` beside the plugin. The scaffold's flake exposes a
ready-to-use `#install` output that produces exactly that layout — build
it and link it as `./modules-install`.

```bash
cd logos-crypto-utils
nix build '.#install' -o ../modules-install
```

`modules-install/modules/crypto_utils/` now holds the plugin, its
`manifest.json`, and a platform `variant` marker — the layout the host
scans at startup.

### 5.3 Start the daemon

Start logoscore in daemon mode pointed at the installed modules
directory, capturing output to `logs.txt`:

```bash
logoscore -D -m modules-install/modules > logs.txt &
```

The `-D` flag starts the background daemon; the client subcommands below
connect to it via the config under `~/.logoscore/`.

```bash
sleep 3
```

### 5.4 List discovered modules

`crypto_utils` should appear in the scan directory:

```bash
logoscore list-modules
```

### 5.5 Load the module

Load `crypto_utils` into the running daemon:

```bash
logoscore load-module crypto_utils
```

### 5.6 Call echo

Call `echo` with a string argument. This is a real round-trip: the
client sends the call to the daemon, the host dispatches it to the
plugin's generated glue, which invokes `CryptoUtilsImpl::echo`, and the
result travels back over IPC.

```bash
logoscore call crypto_utils echo hello
```

`echo: hello` comes straight from `CryptoUtilsImpl::echo` — the plain
C++ method you saw in Step 1, now compiled into a Qt plugin, loaded by
the host, and invoked over IPC.

### 5.7 Stop the daemon

Shut the daemon down cleanly:

```bash
logoscore stop
```

The scaffold this dev-boost commit produced builds, introspects, tests,
and runs end-to-end.
