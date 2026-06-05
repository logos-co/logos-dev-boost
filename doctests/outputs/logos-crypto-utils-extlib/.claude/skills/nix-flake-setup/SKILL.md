---
name: nix-flake-setup
description: Activate when configuring Nix flake.nix for a Logos module. Covers flake inputs, follows declarations, preConfigure for code generation, mkLogosModule, overrides for local development, and workspace integration.
---

# Nix Flake Setup for Logos Modules

## When to Use

Use this skill when:
- Creating a flake.nix for a new Logos module
- Adding or modifying flake inputs
- Configuring the code generator in preConfigure
- Setting up local development overrides

## Minimal Universal Module flake.nix

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
        logos-cpp-generator --from-header src/my_module_impl.h \
          --backend qt \
          --impl-class MyModuleImpl \
          --impl-header my_module_impl.h \
          --metadata metadata.json \
          --output-dir ./generated_code
      '';
    };
}
```

## With Module Dependencies

```nix
inputs = {
  logos-module-builder.url = "github:logos-co/logos-module-builder";
  nix-bundle-lgx.url = "github:logos-co/nix-bundle-lgx";
  logos-storage-module.url = "github:logos-co/logos-storage-module";
  logos-crypto-module.url = "github:logos-co/logos-crypto-module";
};
```

No `follows` declarations needed at the individual module level — the workspace handles dependency unification via its own `follows` in the workspace `flake.nix`.

## With External Libraries

```nix
inputs = {
  logos-module-builder.url = "github:logos-co/logos-module-builder";
  nix-bundle-lgx.url = "github:logos-co/nix-bundle-lgx";
  my-ext-lib = {
    url = "github:org/my-lib/<commit-hash>";
    flake = false;
  };
};

outputs = inputs@{ logos-module-builder, ... }:
  logos-module-builder.lib.mkLogosModule {
    src = ./.;
    configFile = ./metadata.json;
    flakeInputs = inputs;
    externalLibInputs = {
      mylib = inputs.my-ext-lib;
    };
    preConfigure = ''
      logos-cpp-generator --from-header src/my_module_impl.h \
        --backend qt --impl-class MyModuleImpl \
        --impl-header my_module_impl.h \
        --metadata metadata.json --output-dir ./generated_code
    '';
  };
```

The `externalLibInputs` key must match the `name` in `metadata.json` `nix.external_libraries`.

## mkLogosModule Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `src` | Yes | Source directory (usually `./.`) |
| `configFile` | Yes | Path to metadata.json |
| `flakeInputs` | Yes | Pass `inputs` to make all flake inputs available |
| `externalLibInputs` | No | Map of external library names to flake inputs |
| `preConfigure` | No | Shell script to run before CMake (code generator) |

## Local Development with Overrides

Test with local changes to a dependency:

```bash
# Manual override
nix build --override-input logos-storage-module path:../logos-storage-module

# Via workspace CLI (auto-detects dirty repos)
ws build my-module --auto-local

# Explicit local overrides
ws build my-module --local logos-storage-module logos-cpp-sdk
```

## Key Rules

- All flake inputs must be tracked by git (`git add flake.nix flake.lock`)
- nixpkgs is inherited through logos-module-builder (never pin separately)
- Qt version comes from logos-cpp-sdk (never override)
- `preConfigure` runs BEFORE cmake — this is where the code generator goes
- The `nix-bundle-lgx` input enables LGX packaging outputs
