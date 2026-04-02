# Universal Module Template

This template is used by `logos-dev-boost init <name> --type module` to scaffold a new universal C++ module.

The scaffold tool in `mcp-server/tools/scaffold.ts` generates files programmatically using this template's patterns. The actual file generation logic is in the `createUniversalModule()` function.

## Generated files

- `src/<name>_impl.h` — Pure C++ implementation header (module API)
- `src/<name>_impl.cpp` — Implementation file
- `metadata.json` — Module identity with `"interface": "universal"`
- `CMakeLists.txt` — Uses `logos_module()` macro with generated_code sources
- `flake.nix` — `mkLogosModule` with `preConfigure` running `logos-cpp-generator`
- `tests/test_<name>.cpp` — Unit tests against impl class

## Reference

See `repos/logos-accounts-module` for a complete working example.
