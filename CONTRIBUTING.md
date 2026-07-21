# Contributing

Contributions are welcome. Keep reverse-engineering work clean-room: document
observable behaviour and independently derived structures, never copy proprietary
code, assets, databases or offsets from closed-source tools.

Before opening a pull request:

1. Run `cargo fmt --all --check` and `cargo test --workspace`.
2. Run `npm run build` and `npm run test`.
3. Add tests for parsers, scoring rules and write validation.
4. Never commit real savegames, memory dumps or personal player exports.
