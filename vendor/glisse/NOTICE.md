# Glisse vendoring notice

- Upstream: Glisse 0.5.0, https://github.com/0kzh/glisse
- License: MIT (see `LICENSE`)
- Modifications 1 and 2: in `dist/index.js` and `dist/index.cjs`, `fit()` caps displacement-map density at `0.75` instead of `2`, and `paintRim()` caps rim-map density at `0.75` instead of `3`. They reduce dock initialization cost for S22-PO-7.
- Modification 3: package.json trimmed to runtime metadata: devDependencies/scripts removed so the local file: link adds no build tooling to the lockfile.
- Modification 4: `useGlisseRefraction(ref)` exports the existing refraction hook so Glisse can enhance an existing element without replacing its React host node or remounting children.
- On upgrade: re-apply or drop on upgrade.
