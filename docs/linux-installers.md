# Linux installer builds

The **Linux installers** GitHub Actions workflow builds unsigned x86_64 Debian packages (`.deb`) and portable AppImages on Ubuntu 22.04. It runs for pull requests and pushes to `main` or `feat/first-build`. Once the workflow exists on the default branch, it can also be started from **Actions → Linux installers → Run workflow**.

The workflow runs TypeScript checks, JavaScript and Rust tests, builds both packages, checks Debian metadata and packaged files, extracts the AppImage, installs the Debian package, and verifies that its GUI process stays running for 15 seconds under Xvfb. This is a startup smoke test, not an interactive desktop test.

## Download and use

Open a successful workflow run on GitHub and download its `ChalkSmith-linux-x86_64-<commit>` artifact (GitHub sign-in may be required). Artifacts expire after 14 days. Extract the ZIP, then verify its package checksums:

```sh
sha256sum -c SHA256SUMS
```

For Debian/Ubuntu, from the extracted directory:

```sh
sudo apt install ./ChalkSmith_*.deb
chalksmith
```

Use the actual `.deb` filename if its capitalization differs. Alternatively, run the AppImage without installing:

```sh
chmod +x ./*.AppImage
./ChalkSmith_*.AppImage
```

Use the actual AppImage filename if needed. If FUSE is unavailable, try `APPIMAGE_EXTRACT_AND_RUN=1 ./ChalkSmith_*.AppImage`. These builds target Linux x86_64 and are not ARM builds. Ubuntu 22.04 is the build baseline, not a guarantee of compatibility with every distribution. The Debian package requires WebKitGTK 4.1 and GTK 3; APT installs declared dependencies.

## Interactive Linux VM verification

Use a disposable Ubuntu 22.04 or newer x86_64 desktop VM. Test the `.deb` and AppImage separately. Confirm the window renders, draw and erase strokes, save a board to a temporary `.chalk` file, quit and reopen that file, and export SVG. Test rescue only with synthetic fixtures or a copy of your own export. Confirm the original export is unchanged. Record the exact artifact commit, VM version, format tested, and results.

These artifacts are for testing. The workflow does not sign installers, create a GitHub Release, merge changes, or publish packages to a package repository.
