# Contributing

## Try it and tell us

Every change to Stacks runs automated tests: unit tests, and end-to-end tests in desktop Obsidian, also with the mobile UI emulated. The Android app is tested nightly on an emulator. Emulators aren't real devices, though, and testing by hand on real phones, tablets and sync services has covered few setups so far. [What is tested](sync-and-mobile.md#what-is-tested) lists what the automated tests cover and what still needs real devices. Your library and setup are different, and that is exactly why your experience helps. If you use Stacks:

- **Something broke or surprised you?** [Open an issue](https://github.com/jag3773/obsidian-stacks/issues/new) with what you did, what you expected, and your Obsidian version and platform.
- **It worked?** That is useful too, especially on a phone or tablet, with a sync service, or with a large library or an import from another tool. A short note in an issue is welcome.
- **Want to fix or add something?** Pull requests are welcome. See [build and contribute](#build-and-contribute) below.

Please keep a backup of your vault. Stacks previews its bigger changes before making them, but a backup is the best safety net for any plugin that changes your files.

## Build and contribute

```sh
git clone https://github.com/jag3773/obsidian-stacks.git
cd obsidian-stacks
npm ci
npm run build
```

Copy the three plugin files into your vault as described in [manual installation](install.md#manual-installation). For development:

```sh
npm run dev      # watch build
npm test         # pure-module and vault/settings tests
npm run lint:scanner  # lint the way the Obsidian community directory scans a release
npm run bbt-accuracy -- path/to/BetterBibTeX.json 2025
```

### Testing

`npm test` runs the unit tests against an in-memory Obsidian stand-in, in seconds. End-to-end tests run Stacks in real Obsidian, downloaded on first use, with lookups answered from fixtures instead of the network:

```sh
npm run build
npm run test:e2e         # desktop (oldest supported and latest Obsidian) and the emulated mobile UI
npm run test:e2e:mobile  # emulated mobile only
```

They run on every pull request; the Android app runs nightly. See [test/e2e/README.md](../test/e2e/README.md) for Android, Linux without a display, and how sync and offline capture are simulated. iOS, real sync services and touch use aren't covered automatically ([what is tested](sync-and-mobile.md#what-is-tested)), so testing in a real vault is still the most valuable help, especially on phones and tablets and with your sync setup.

Have a workflow that still sends you back to a separate reference manager? [Describe it in an issue](https://github.com/jag3773/obsidian-stacks/issues/new). Concrete examples help shape what Stacks builds next.

<details>
<summary>Publishing a release</summary>

Set the same new version in `manifest.json` and `package.json`, add it to `versions.json`, and merge that change to `main`. When `main` has a version with no tag yet, the Release workflow creates the tag, runs tests, builds, and publishes a release containing `main.js`, `manifest.json`, and `styles.css`, which Obsidian's community plugin directory picks up. Pushing a matching, unused version tag yourself also works. A version with a hyphen (`0.4.0-beta.1`) is published as a pre-release instead.

</details>
