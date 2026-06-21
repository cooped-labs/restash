#!/usr/bin/env bash
# Build restash-linux-helper on a Linux runner (CI) or locally.
#
# Links libxcb (+xcb-xtest) — part of any X11 server runtime, not a user
# install. The uinput Wayland fallback needs no extra libs (kernel headers
# only). The Wayland libei path is enabled (-DHAVE_LIBEI) when BOTH libei-1.0
# AND libportal dev headers are present — the implementation in
# native/linux/wayland_ei.c uses libportal's RemoteDesktop session to obtain
# the EIS file descriptor and libei to inject keystrokes, so we need both.
#
# The AppImage step bundles the .so deps and sets RPATH so they resolve from
# the bundled copy, never the host — see scripts/bundle-linux-libs.sh.
#
# Usage: native/build-linux-helper.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_MAIN="$ROOT/native/linux/restash-linux-helper.c"
SRC_EI="$ROOT/native/linux/wayland_ei.c"
OUT="$ROOT/bin/restash-linux-helper"
mkdir -p "$ROOT/bin"

CFLAGS="-O2 -Wall"
LIBS="-lxcb -lxcb-xtest"
SRCS=("$SRC_MAIN")
# xcb-util provides some atom helpers on some distros; link if available.
if pkg-config --exists xcb-util 2>/dev/null; then LIBS="$LIBS -lxcb-util"; fi

# Enable the Wayland libei path only if BOTH libei and libportal are available.
if pkg-config --exists libei-1.0 2>/dev/null && pkg-config --exists libportal 2>/dev/null; then
  echo "libei + libportal found — building with -DHAVE_LIBEI"
  CFLAGS="$CFLAGS -DHAVE_LIBEI $(pkg-config --cflags libei-1.0 libportal)"
  LIBS="$LIBS $(pkg-config --libs libei-1.0 libportal)"
  SRCS+=("$SRC_EI")
  # libportal >= 0.8 exports xdp_portal_create_remote_desktop_session_full and
  # the XDP_PERSIST_MODE_* enum — the persist path in wayland_ei.c is gated on
  # -DHAVE_PORTAL_PERSIST. On older libportal (e.g. 0.7.1 on ubuntu-latest CI)
  # those symbols are absent, so we leave the define off and fall back to the
  # base xdp_portal_create_remote_desktop_session() call. Same Ctrl+V behavior,
  # the only difference is the compositor consent dialog re-prompts each launch.
  if pkg-config --atleast-version=0.8 libportal 2>/dev/null; then
    echo "libportal >= 0.8 — enabling persist path with -DHAVE_PORTAL_PERSIST"
    CFLAGS="$CFLAGS -DHAVE_PORTAL_PERSIST"
  else
    echo "libportal < 0.8 — persist path disabled (consent dialog will re-prompt)"
  fi
else
  echo "libei or libportal missing — X11 + uinput-only build (portal path disabled)"
fi

# RPATH '$ORIGIN/../lib' so the AppImage-bundled libs resolve from our copy.
# electron-builder maps vendor/linux-lib -> <Resources>/lib (see package.json),
# so the helper at <Resources>/bin/restash-linux-helper finds its libs at
# $ORIGIN/../lib. scripts/bundle-linux-libs.sh re-stamps this with patchelf.
gcc $CFLAGS -o "$OUT" "${SRCS[@]}" $LIBS -Wl,-rpath,'$ORIGIN/../lib'
chmod +x "$OUT"
echo "Built $OUT"
ldd "$OUT" || true

# Walk the helper's transitive ldd closure and vendor every non-ABI .so under
# vendor/linux-lib/, skipping libc/libm/libpthread/libdl/libgcc_s/libstdc++/
# librt/libresolv/libutil/libnsl/libcrypt/ld-linux* (these MUST come from the
# host glibc — bundling them breaks the loader). See scripts/bundle-linux-libs.sh.
if [ -x "$ROOT/scripts/bundle-linux-libs.sh" ]; then
  bash "$ROOT/scripts/bundle-linux-libs.sh" "$OUT"
else
  echo "WARN: scripts/bundle-linux-libs.sh missing — AppImage will resolve .so deps from host" >&2
fi
