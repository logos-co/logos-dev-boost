# Wrapping an External C Library with logos-dev-boost

Most real modules wrap an existing C or C++ library — libsodium, SQLite, a
vendor SDK. `logos-dev-boost` automates the boilerplate: point `init` at a
directory of C sources with `--lib-dir`, and it parses the header, copies the
library in, and **generates a pure C++ wrapper class** with one method per C
function, mapping C types to the Logos type system. (`--lib-dir` implies
`--external-lib`; passing `--external-lib` alone scaffolds an empty external
library you fill in by hand.)

This doc-test exercises **this** dev-boost commit end-to-end on that workflow:

1. Write a tiny C library, `libcipher` (a header + its `.c` source).
2. Scaffold a `crypto_utils` module with
   `init crypto_utils --type module --lib-dir ./lib` — built from the commit
   under test. The scaffold parses `libcipher.h` and generates a
   `CryptoUtilsImpl` C++ class wrapping every function.
3. Build the module. The C source is compiled straight into the plugin and the
   Qt glue is generated from the wrapper header — no Qt in your code.
4. Introspect the compiled plugin with `lm` and run the generated unit tests.
5. Install the module and call its methods through the `logoscore` daemon —
   each call a real round-trip into the wrapped C library.

A green run is real evidence that `init --lib-dir` still produces a module that
correctly wraps a C library and runs end-to-end.

**What you'll build:** A `crypto_utils` module wrapping a small C library (`libcipher`), scaffolded by this dev-boost commit, then built, introspected, unit-tested, and called through `logoscore`.

**What you'll learn:**

- How `init --lib-dir` parses a C header and generates a C++ wrapper class
- How C types map to the Logos type system (`int` → `int64_t`, `const char*` → `std::string`)
- How a source-only C library is compiled straight into the plugin
- How to introspect, unit-test, and call the wrapped module through `logoscore`

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

## Step 1: Write the C library to wrap

Start with a small, self-contained C library: a header declaring three
functions and its implementation. This stands in for any real C library you
might wrap (libsodium, SQLite, a vendor SDK).

### 1.1 Create lib/libcipher.h

```c
#ifndef LIBCIPHER_H
#define LIBCIPHER_H

#ifdef __cplusplus
extern "C" {
#endif

/** Sum of the byte values of `text` (a simple checksum). */
int cipher_checksum(const char* text);

/** Caesar-shift a character code by `shift` positions. */
int cipher_caesar_shift(int code, int shift);

/** Library version string. Caller must NOT free. */
const char* cipher_version(void);

#ifdef __cplusplus
}
#endif

#endif /* LIBCIPHER_H */
```

### 1.2 Create lib/libcipher.c

```c
#include "libcipher.h"

int cipher_checksum(const char* text)
{
    int sum = 0;
    if (!text) return 0;
    for (const char* p = text; *p; ++p)
        sum += (unsigned char)*p;
    return sum;
}

int cipher_caesar_shift(int code, int shift)
{
    return code + shift;
}

const char* cipher_version(void)
{
    return "1.0.0";
}
```

The library directory now holds just `lib/libcipher.h` and
`lib/libcipher.c` — a source-only C library, no pre-built binaries.

---

## Step 2: Scaffold the module

Run `init` with `--lib-dir ./lib`. dev-boost parses `libcipher.h`, copies
the library into the project, and generates a `CryptoUtilsImpl` C++ class
with one method per C function — converting C types to the Logos type
system as it goes.

> `` pins dev-boost to the commit under test: the runner expands it
> to this checkout's `HEAD` locally (see `run.sh`), or the PR commit in CI.
> With no pin it falls back to the latest published `master`.

### 2.1 Run init with --lib-dir

```bash
nix run github:logos-co/logos-dev-boost -- init crypto_utils --type module --lib-dir ./lib
```

The scaffold copies the library in and generates the wrapper, build
files, and one unit test per function:

```
logos-crypto-utils/
├── lib/
│   ├── libcipher.h             # copied from --lib-dir
│   └── libcipher.c             # compiled into the plugin
├── src/
│   ├── crypto_utils_impl.h     # generated C++ wrapper class
│   └── crypto_utils_impl.cpp   # calls through to the C functions
├── tests/                      # one test per wrapped function
├── metadata.json               # declares the external library
├── CMakeLists.txt              # LANGUAGES C CXX; compiles libcipher.c
└── flake.nix
```

### 2.2 Confirm the library was copied in

### 2.3 Inspect the generated wrapper

The generated impl header `extern "C"`-includes the library and declares
a typed method per C function. Note the type mapping: C `int` becomes
`int64_t`, and `const char*` becomes `std::string` (return) or
`const std::string&` (parameter).

```bash
cat logos-crypto-utils/src/crypto_utils_impl.h
```

The implementation (`crypto_utils_impl.cpp`) calls each C function with
the necessary casts — e.g. `::cipher_checksum(text.c_str())` — so your
module API stays pure C++ while the real work happens in the C library.

---

## Step 3: Build the module

`nix build` compiles the module. Because the library is source-only
(`.c` + `.h`), the scaffold's `CMakeLists.txt` enables `LANGUAGES C CXX` and
compiles `libcipher.c` straight into the plugin; `logos-cpp-generator`
produces the Qt glue from the wrapper header. Nix only sees git-tracked
files, so we `git init` and stage everything first.

### 3.1 Init git, stage, and build

```bash
cd logos-crypto-utils
git init && git add -A
nix build
```

The build produces `result/lib/crypto_utils_plugin.dylib` — a Qt plugin
with the C library statically linked in.

---

## Step 4: Inspect the module with `lm`

[`lm`](https://github.com/logos-co/logos-module) is the module inspector.
Build it, then point it at the plugin to confirm the wrapped C functions are
exposed as module methods.

### 4.1 Build lm

```bash
nix build 'github:logos-co/logos-module#lm' -o lm
```

The inspector is at `./lm/bin/lm`.

### 4.2 Inspect the plugin

`lm` lists each wrapped function as a callable method — `checksum`,
`caesar_shift`, and `version`.

```bash
lm crypto_utils_plugin.dylib
```

---

## Step 5: Run the generated unit tests

The scaffold generates one `LOGOS_TEST` per wrapped function that constructs
`CryptoUtilsImpl` directly and calls the method — no Qt, no host, no IPC.
`nix build .#unit-tests` compiles and runs them.

### 5.1 Build and run the unit tests

```bash
nix build '.#unit-tests' -L
```

A green build means every generated test compiled, linked against the C
library, and passed.

---

## Step 6: Run the module in `logoscore`

Finally, run the module in the real headless runtime. Build
[`logoscore`](https://github.com/logos-co/logos-logoscore-cli), install the
module into a runtime `modules/` directory, then start the daemon and call
the wrapped functions — each call a real round-trip through the C library.

### 6.1 Build logoscore

```bash
nix build 'github:logos-co/logos-logoscore-cli' -o logos
```

The runtime is at `./logos/bin/logoscore`.

### 6.2 Install the module into a runtime directory

`logoscore` discovers modules from `modules/<name>/` directories, each
with a `manifest.json`. The scaffold's flake exposes a ready-to-use
`#install` output that produces exactly that layout.

```bash
cd logos-crypto-utils
nix build '.#install' -o ../modules-install
```

### 6.3 Start the daemon

Start logoscore in daemon mode pointed at the installed modules
directory, capturing output to `logs.txt`:

```bash
logoscore -D -m modules-install/modules > logs.txt &
```

```bash
sleep 3
```

### 6.4 Load the module

Load `crypto_utils` into the running daemon:

```bash
logoscore load-module crypto_utils
```

### 6.5 Call checksum

`cipher_checksum` sums the byte values of its argument. For `hello` that
is `104 + 101 + 108 + 108 + 111 = 532` — a deterministic round-trip
through the wrapped C function:

```bash
logoscore call crypto_utils checksum hello
```

### 6.6 Call caesar_shift

`cipher_caesar_shift` adds `shift` to a character code. `5 + 3` is `8`,
exercising an `int → int64_t` round-trip in both directions:

```bash
logoscore call crypto_utils caesar_shift 5 3
```

### 6.7 Call version

`cipher_version` returns a C string; the wrapper converts it to a
`std::string`, which comes back as `"1.0.0"`:

```bash
logoscore call crypto_utils version
```

Three real calls into the wrapped `libcipher` — a checksum, an integer
shift, and a version string — all dispatched over IPC into C functions
the scaffold wrapped automatically from the header.

### 6.8 Stop the daemon

Shut the daemon down cleanly:

```bash
logoscore stop
```

The module this dev-boost commit scaffolded from a raw C library builds,
introspects, tests, and runs end-to-end.
