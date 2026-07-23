# Mobile

The Flutter GO SYNC client lives on the long-lived branch **`incubating/mobile`**, not on desktop trunk (`main` / `master`).

## Develop

```bash
git fetch origin
git checkout incubating/mobile
npm run mobile:setup
npm run mobile:quality
```

## Docs (on `incubating/mobile`)

| Doc (on that branch) | Purpose |
|----------------------|---------|
| `mobile/README.md` | Setup, run, merge playbook |
| `docs/MOBILE_RELEASE.md` | Store / `mobile-v*` tag flow |
| `docs/MOBILE_DEFERRED.md` | Post-beta backlog |
| `docs/MOBILE_CI_SECRETS.md` | CI secrets for AAB / IPA |

## Release

Tag `mobile-v*` **only from `incubating/mobile`** (after `npm run release:mobile` on that branch). Desktop trunk does not ship Flutter artifacts.
