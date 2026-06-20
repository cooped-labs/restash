#!/usr/bin/env bash
# Build restash-linux-helper on a Linux runner (CI) or locally.
#
# Links libxcb (+xcb-xtest) — part of any X11 server runtime, not a user install
# — and, when libei dev headers are present, the Wayland RemoteDesktop/libei path
# (-DHAVE_LIBEI). The uinput fallback needs no extra libs (kernel headers only).
#
# The AppImage step (electron-builder) bundles the .so deps and sets RPATH so
# they resolve from the bundled copy, never the host. See packaging config.
#
# Usage: native/build-linux-helper.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/native/linux/restash-linux-helper.c"
OUT="$ROOT/bin/restash-linux-helper"
mkdir -p "$ROOT/bin"

CFLAGS="-O2 -Wall"
LIBS="-lxcb -lxcb-xtest"
# xcb-util provides some atom helpers on some distros; link if available.
if pkg-config --exists xcb-util 2>/dev/null; then LIBS="$LIBS -lxcb-util"; fi

# Enable the Wayland libei path only if libei dev is installed in the build env.
if pkg-config --exists libei-1.0 2>/dev/null; then
  echo "libei found — building with -DHAVE_LIBEI"
  CFLAGS="$CFLAGS -DHAVE_LIBEI $(pkg-config --cflags libei-1.0)"
  LIBS="$LIBS $(pkg-config --libs libei-1.0)"
fi

# RPATH '$ORIGIN/../lib' so the AppImage-bundled libs resolve from our copy.
gcc $CFLAGS -o "$OUT" "$SRC" $LIBS -Wl,-rpath,'$ORIGIN/../lib'
chmod +x "$OUT"
echo "Built $OUT"
ldd "$OUT" || true
