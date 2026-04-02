# Universal Module with External Library Template

Extends the universal module template with external C/C++ library wrapping support.

## Additional generated files

- `lib/` directory for external library headers
- `metadata.json` with `nix.external_libraries` pre-configured
- `flake.nix` with `externalLibInputs` and non-flake library input
- `CMakeLists.txt` with `find_library` for the external library

## Reference

See `repos/logos-accounts-module` for a complete working example wrapping a Go CGo library.
