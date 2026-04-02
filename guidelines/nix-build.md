# Nix Build Patterns

## All Builds Go Through Nix

Never run raw `cmake` without `nix develop` or `ws develop`. The Nix build system provides Qt, the SDK, the code generator, and all dependencies. Running `cmake --build` outside Nix will fail.

## Flake Structure for Universal Modules

```nix
{
  description = "My Logos Module";

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
        logos-cpp-generator --from-header src/<name>_impl.h \
          --backend qt \
          --impl-class <ImplClassName> \
          --impl-header <name>_impl.h \
          --metadata metadata.json \
          --output-dir ./generated_code
      '';
    };
}
```

The `preConfigure` hook runs the code generator before CMake. This is required for universal modules.

## Flake Structure for Modules with External Libraries

Add the external library as a non-flake input and pass it via `externalLibInputs`:

```nix
inputs = {
  logos-module-builder.url = "github:logos-co/logos-module-builder";
  nix-bundle-lgx.url = "github:logos-co/nix-bundle-lgx";
  my-lib = {
    url = "github:org/my-lib/commit-hash";
    flake = false;
  };
};

outputs = inputs@{ logos-module-builder, ... }:
  logos-module-builder.lib.mkLogosModule {
    src = ./.;
    configFile = ./metadata.json;
    flakeInputs = inputs;
    externalLibInputs = {
      mylib = inputs.my-lib;
    };
    preConfigure = ''
      logos-cpp-generator --from-header src/<name>_impl.h \
        --backend qt --impl-class <ClassName> \
        --impl-header <name>_impl.h \
        --metadata metadata.json --output-dir ./generated_code
    '';
  };
```

## Build Commands

```bash
nix build                          # Build the module
nix build .#lib                    # Build just the shared library
nix flake check -L                 # Run tests
nix develop                        # Enter dev shell with build tools
```

Inside the workspace (multi-repo):
```bash
ws build my-module                 # Build
ws build my-module --auto-local    # Build with local dirty dep overrides
ws test my-module                  # Run tests
ws test my-module --auto-local     # Test with local overrides
ws develop my-module               # Enter dev shell
```

## Key Rules

- Flake inputs must be tracked by git. Run `git add <file>` before Nix can see new files.
- `nixpkgs` follows `logos-cpp-sdk` via `logos-module-builder`. Never pin a separate nixpkgs.
- Qt version is fixed by `logos-cpp-sdk`. All repos must use the same Qt to avoid version conflicts.
- Use `-L` flag to stream build logs: `nix build -L`
- Use `--override-input` to test with local dependency changes (the `ws` CLI does this for you with `--auto-local`).

## Dev Shell for CMake Iteration

```bash
nix develop
cmake -B build -GNinja && cmake --build build
```

The dev shell provides all build dependencies. Use this for rapid C++ iteration without full Nix rebuilds.
