#!/usr/bin/env bash
# scripts/bundle-linux-libs.sh — zero-install Linux .so bundling.
#
# Walks the transitive ldd closure of bin/restash-linux-helper, copies every
# non-ABI shared library into vendor/linux-lib, and patchelf's an RPATH of
# '$ORIGIN' onto each copied .so so sibling libs resolve from the bundle. The
# helper itself already has RPATH '$ORIGIN/../lib' set by the linker.
#
# At runtime electron-builder ships vendor/linux-lib as <Resources>/lib and
# platform/linux.js also prepends that dir to LD_LIBRARY_PATH. Combined: every
# lib the helper transitively needs resolves from inside the AppImage, not
# from the host.
#
# ABI allowlist (these MUST resolve from the host — bundling them breaks):
#   libc, libm, libpthread, libdl, librt, libresolv, libutil, libnsl,
#   libgcc_s, libstdc++, libcrypt, ld-linux*
# Everything else (libei, libportal, libdbus, libglib, libgio, libgobject,
# libffi, libpcre, libelogind/libsystemd, libcap, libmount, libblkid, libz,
# libselinux, etc.) is copied.
#
# Usage:
#   scripts/bundle-linux-libs.sh                  # uses ./bin/restash-linux-helper
#   scripts/bundle-linux-libs.sh /path/to/binary
#
# Requires: ldd, patchelf, install. patchelf is apt-installable on Ubuntu.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${1:-$ROOT/bin/restash-linux-helper}"
OUT="$ROOT/vendor/linux-lib"

if [ ! -x "$BIN" ]; then
  echo "bundle-linux-libs: $BIN missing or not executable" >&2
  exit 1
fi
mkdir -p "$OUT"

# ABI libs that MUST resolve from the host. Matched as basename prefix.
abi_skip() {
  case "$1" in
    libc.so.*|libc-*.so) return 0 ;;
    libm.so.*|libm-*.so) return 0 ;;
    libpthread.so.*|libpthread-*.so) return 0 ;;
    libdl.so.*|libdl-*.so) return 0 ;;
    librt.so.*|librt-*.so) return 0 ;;
    libresolv.so.*|libresolv-*.so) return 0 ;;
    libutil.so.*|libutil-*.so) return 0 ;;
    libnsl.so.*) return 0 ;;
    libcrypt.so.*) return 0 ;;
    libgcc_s.so.*) return 0 ;;
    libstdc++.so.*) return 0 ;;
    ld-linux*.so.*|ld-*.so) return 0 ;;
    linux-vdso.so.*) return 0 ;;
  esac
  return 1
}

declare -A SEEN=()
TO_COPY=()
UNRESOLVED=0

# Recursively walk ldd output. Each dependency line looks like:
#   libei.so.1 => /lib/x86_64-linux-gnu/libei.so.1 (0x00007f..)
#   libfoo.so.0 => not found
walk() {
  local target="$1"
  local lddout
  if ! lddout="$(ldd "$target" 2>/dev/null)"; then return 0; fi
  while IFS= read -r line; do
    # Detect "=> not found" lines and fail loudly — a missing dep means the
    # build env is missing a -dev package and the AppImage would silently ship
    # a broken helper.
    if [[ "$line" == *"=> not found"* ]]; then
      local missing
      missing="$(printf '%s\n' "$line" | awk '{print $1}')"
      echo "ERROR: $missing not found while walking $target" >&2
      UNRESOLVED=$((UNRESOLVED + 1))
      continue
    fi
    # Extract the resolved path (3rd whitespace-separated field after "=>").
    local resolved
    resolved="$(printf '%s\n' "$line" | awk '{ for (i=1;i<=NF;i++) if ($i=="=>" && (i+1)<=NF) { print $(i+1); exit } }')"
    [ -z "$resolved" ] && continue
    [ "$resolved" = "not" ] && continue   # "not found" sentinel
    [ ! -f "$resolved" ] && continue
    local base
    base="$(basename "$resolved")"
    if abi_skip "$base"; then continue; fi
    # Resolve symlink chain to a canonical path so we dedupe across SONAME links.
    local real
    real="$(readlink -f "$resolved")"
    if [ -n "${SEEN[$real]:-}" ]; then continue; fi
    SEEN[$real]=1
    TO_COPY+=("$resolved")  # preserve SONAME-style filename for the copy
    walk "$real"
  done <<< "$lddout"
}

walk "$BIN"

if [ "$UNRESOLVED" -gt 0 ]; then
  echo "" >&2
  echo "bundle-linux-libs: $UNRESOLVED unresolved dep(s) — install missing -dev pkgs and rebuild the helper" >&2
  exit 2
fi

echo "Bundling ${#TO_COPY[@]} libs into $OUT (closure of $BIN)"
for src in "${TO_COPY[@]}"; do
  base="$(basename "$src")"
  # -L follows the SONAME symlink so we copy the real file, but name it after
  # the SONAME the loader will look for.
  install -m 0644 -L "$src" "$OUT/$base"
done

# patchelf — two passes:
#   1. Each bundled .so gets RPATH '$ORIGIN' so siblings resolve from the bundle
#      (otherwise a copied libportal could pull libglib from the host).
#   2. The helper binary itself gets RPATH '$ORIGIN/../lib' re-stamped, matching
#      the electron-builder extraResources mapping (vendor/linux-lib -> lib).
#      Belt-and-suspenders against future gcc -Wl,-rpath drift.
# Files were copied with `install -L`, so each entry is a real ELF (no symlinks).
if command -v patchelf >/dev/null 2>&1; then
  for f in "$OUT"/*.so*; do
    [ -f "$f" ] || continue
    patchelf --set-rpath '$ORIGIN' "$f" 2>/dev/null || true
  done
  patchelf --set-rpath '$ORIGIN/../lib' "$BIN"
  echo "patchelf: RPATH set to \$ORIGIN/../lib on $BIN"
  patchelf --print-rpath "$BIN" | sed 's/^/  helper RPATH=/'
else
  echo "WARN: patchelf not installed — bundled libs may resolve transitive deps from host" >&2
fi

# Sanity print so CI logs show the closure.
echo "--- vendor/linux-lib contents ---"
ls -la "$OUT" || true
echo "--- ldd $BIN ---"
ldd "$BIN" || true
