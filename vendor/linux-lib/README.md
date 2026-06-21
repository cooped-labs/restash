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

Empty in the repo on purpose — the `.so` files are produced per-arch by CI,
not committed (they are large, arch-specific build artifacts). X11-only builds
(no libei/libportal in the build env) leave this directory empty: libxcb ships
with every X11 server runtime.
