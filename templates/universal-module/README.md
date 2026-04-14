# Universal Module Template

This template is used by `logos-dev-boost init <name> --type module` to scaffold a new universal C++ module.

The scaffold tool in `mcp-server/tools/scaffold.ts` generates files programmatically using this template's patterns. The actual file generation logic is in the `createUniversalModule()` function.

## Generated files

- `src/<name>_impl.h` -- Pure C++ implementation header (module API)
- `src/<name>_impl.cpp` -- Implementation file
- `metadata.json` -- Module identity with `"interface": "universal"`
- `CMakeLists.txt` -- Uses `logos_module()` macro with generated_code sources
- `flake.nix` -- `mkLogosModule` with `preConfigure` running `logos-cpp-generator`
- `tests/main.cpp` -- Test runner entry point (`LOGOS_TEST_MAIN()`)
- `tests/test_<name>.cpp` -- Unit tests using `LOGOS_TEST()` macros and assertions
- `tests/CMakeLists.txt` -- `logos_test()` macro integration (auto-detected by `logos-module-builder`)

## Testing

The generated tests use logos-test-framework. Run with:

```bash
nix build .#unit-tests -L
```

`logos-module-builder` auto-detects `tests/CMakeLists.txt` and creates `checks.<system>.unit-tests` and `packages.<system>.unit-tests`.

## Reference

See `repos/logos-accounts-module` for a complete working example.
