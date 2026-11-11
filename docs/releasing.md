# Releasing

Written for: maintainers who publish @agentspaces/a2ui-react to npm.

The package is scoped, and npm makes a scoped package private unless it is told otherwise. `publishConfig.access` is `public`, so `npm publish` makes it public without a flag.

## Order

Release [agentspaces-a2ui](https://github.com/badmonkeyai/agentspaces-a2ui) 0.6.0 first, from the commit whose catalogs this package's `src/generated/` matches. The package needs no Maven artifact at run time, but it draws that release's catalogs, so the two releases name the same catalogs.

## The dry run

```sh
npm ci
npm test
npm pack --dry-run
```

The list holds `dist/`, `src/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `NOTICE`, and `package.json`. It holds no test, no log, and no `dist/axe.json` or `dist/size.json`.

## The release

```sh
npm publish --otp=<code>
npm view @agentspaces/a2ui-react@0.6.0 version
```

`prepublishOnly` removes `dist/`, rebuilds it, and runs the tests, so the tarball never carries a stale chunk. npm does not let a version be replaced, so a bad release is fixed by the next version. Tag the release commit with the bare version (`0.6.0`) and push the tag.
