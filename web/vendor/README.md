# G6 browser distribution

`g6.min.js` is the unmodified standalone browser bundle from `@antv/g6` **5.1.1**.
No npm install, CDN access, or JavaScript build is required to use News Graph.

- Package: https://registry.npmjs.org/@antv/g6/5.1.1
- Archive: https://registry.npmjs.org/@antv/g6/-/g6-5.1.1.tgz
- Archive SHA-1 (npm metadata): `e3ebcb6f1b3ca79563d3a461b28a36a7feb8b55e`
- Bundle SHA-256: `3e091a94fd08994a383ff34bfba256bb8e382e4be4042197a206d2ecc0957331`
- Upstream source: https://github.com/antvis/G6
- License: MIT; upstream license text is in `LICENSE` and embedded in generated HTML.

To update, obtain the standalone bundle and license from a fixed upstream release,
verify its archive against registry metadata, replace both files, and update this
record and the version label in `web/graph.html`. Run the Python export tests and
browser checks (including file:// opening, filtering, and mobile layout) before
regenerating the example. Never edit the minified bundle directly.
