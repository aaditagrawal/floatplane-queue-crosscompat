# Dependency refresh

The Bun lock selects unimport 6.5.0 within WXT 0.21.4's existing supported range, ^3.13.1 || ^4.0.0 || ^5.0.0 || ^6.0.0. This replaces unimport 3.14.6's fast-glob dependency with tinyglobby and removes the micromatch and braces dependency chain. It resolves this checkout's exposure to [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) by updating the supported dependency graph. Braces itself still has no published fixed release. There is no override, ignored advisory, or removed project tooling.

Bun 1.4.3's targeted transitive update was used: bun update unimport. Version 7 is outside WXT's declared range and was not selected. Validation covers frozen installation and WXT type generation, tsrs, lint, formatting, and default, Firefox, Chrome, and Edge extension builds. There is no project test suite or live Floatplane service test.
