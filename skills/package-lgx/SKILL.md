---
name: package-lgx
description: Activate when packaging a Logos module or UI app for distribution as an LGX package. Covers lgx create, adding platform variants, verification, portable builds, and installation via lgpm.
---

# Package a Module as LGX

## When to Use

Use this skill when:
- Distributing a module or UI app as an LGX package
- Creating platform-specific variants (linux-x86_64, darwin-arm64)
- Installing packages locally via lgpm

## Step 1: Build the Module

```bash
nix build
```

The built plugin is at `./result/lib/<name>_plugin.so` (Linux) or `./result/lib/<name>_plugin.dylib` (macOS).

## Step 2: Create the LGX Package

```bash
lgx create <name>
```

This creates an empty `<name>.lgx` archive.

## Step 3: Add Platform Variants

```bash
lgx add <name>.lgx -v linux-x86_64 -f ./result/lib/<name>_plugin.so
lgx add <name>.lgx -v darwin-arm64 -f ./result/lib/<name>_plugin.dylib
```

For directory variants (e.g., UI apps with multiple files):

```bash
lgx add <name>.lgx -v linux-x86_64 -f ./result/lib/ --main <name>_plugin.so -y
```

## Step 4: Verify

```bash
lgx verify <name>.lgx
```

Validates the package against the LGX specification.

## Step 5: Install Locally

```bash
# Install a single package
lgpm --modules-dir ./test-modules install --file <name>.lgx

# Install all packages in a directory
lgpm --modules-dir ./test-modules install --dir ./packages/

# List installed packages
lgpm --modules-dir ./test-modules list

# Get package info
lgpm --modules-dir ./test-modules info <name>
```

## Step 6: Test the Installed Package

```bash
logoscore -m ./test-modules -l <name> -c "<name>.someMethod(test)"
```

## Portable Builds

For distribution, ensure the shared library has no Nix store references:

```bash
# Build portable (self-contained)
nix build .#portable

# Or use nix-bundle-lgx for automated bundling
nix build .#bin-bundle-lgx
```

Verify no store references leaked:

```bash
rg /nix/store result/ && echo "FAIL: store refs found" || echo "OK: portable"
```

## Automated Packaging with nix-bundle-lgx

If the module's `flake.nix` includes `nix-bundle-lgx` as an input, it may provide automated packaging outputs:

```bash
nix build .#lgx-package
```

This produces a ready-to-distribute `.lgx` file with the correct platform variant.

## Downloading from the Online Catalog

```bash
lgpd search <query>
lgpd list --category <category>
lgpd download <name> -o ./packages/
lgpm --modules-dir ./modules install --dir ./packages/
```
