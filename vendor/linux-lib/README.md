# Bundled Linux .so deps for the AppImage (zero-install)

At release time the CI `ubuntu-latest` job runs `scripts/bundle-linux-libs.sh`,
which walks the full transitive `ldd` closure of `bin/restash-linux-helper` and
copies every non-ABI shared library into this directory, then `patchelf`s an
RPATH of `$ORIGIN` onto each copied `.so` so sibling libs resolve from the
bundle.

ABI libs that intentionally stay unbundled (they must resolve from the host —
bundling them breaks across glibc versions):
`libc`, `libm`, `libpthread`, `libdl`, `librt`, `libresolv`, `libutil`,
`libnsl`, `libcrypt`, `libgcc_s`, `libstdc++`, `ld-linux*`, `linux-vdso`.

Everything else the helper transitively needs ends up here:
`libei`, `libportal`, `libdbus-1`, `libglib-2.0`, `libgio-2.0`, `libgobject-2.0`,
`libffi`, `libpcre*`, `libsystemd`/`libelogind`, `libcap`, `libmount`,
`libblkid`, `libz`, `libselinux`, plus the libxcb family.

electron-builder bundles this directory as `<Resources>/lib`, the helper's
linker-set RPATH (`$ORIGIN/../lib`) finds it, and `platform/linux.js` also
prepends it to `LD_LIBRARY_PATH` as belt-and-braces. Nothing the helper needs
is ever resolved from the host.

## .deb caveat (vs. AppImage)

The `linux.extraResources` mapping above is shared by **both** the AppImage and
the `.deb` target, so the bundle layout is identical in both: the helper lands at
`resources/bin/restash-linux-helper` and the libs at `resources/lib/*.so`, at the
same parent. For the `.deb`, electron-builder installs that tree under
`/opt/Restash/`, i.e. `/opt/Restash/resources/{bin,lib}` — the **relative**
`bin/ ↔ lib/` layout is preserved, so the helper's RPATH `$ORIGIN/../lib` (and
the `LD_LIBRARY_PATH` from `platform/linux.js`) resolve the bundled libs exactly
as they do inside the AppImage. The zero-install guarantee therefore holds for
the `.deb` too: nothing app-specific resolves from `/usr`.

Two differences worth knowing:
- The `.deb` is **not** a single self-contained file (it unpacks into
  `/opt/Restash`), but it still carries its own copies of the bundled `.so`
  files — it does **not** declare them as apt `Depends:` and does **not** pull
  libei/libportal from the distro. RPATH + `LD_LIBRARY_PATH` make the bundled
  copies win over any host-installed ones.
- Auto-update: the AppImage updates via zsync; the `.deb` updates by
  re-download / `apt` (no differential), which is an electron-updater
  limitation, not a bundling one.
- The clean-`ubuntu:22.04` `ldd` assertion in `ci.yml` reproduces the AppImage's
  `bin/ + lib/` parent layout, which is the same relative layout the `.deb`
  installs — so that CI gate covers the `.deb` resolution too.

Empty in the repo on purpose — the `.so` files are produced per-arch by CI,
not committed (they are large, arch-specific build artifacts). X11-only builds
(no libei/libportal in the build env) leave this directory empty: libxcb ships
with every X11 server runtime.
