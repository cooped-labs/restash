# Native helpers (bundled, zero-install)

Restash's hard constraint: **no feature may depend on a user-installed binary,
package, daemon, browser extension, or system tool.** Every native capability
ships *inside* the app. These two helpers mirror the macOS `bin/restash-*` Swift
pattern: tiny, self-contained, committed-as-source and **CI-built per OS**, then
shipped in electron-builder `extraResources` (outside asar).

| Helper | OS | Source | Built by |
|---|---|---|---|
| `bin/restash-win-helper.exe` | Windows x64/arm64 | `win32/restash-win-helper.c` | `windows-latest` runner (MSVC) — see `build-win-helper.ps1` |
| `bin/restash-linux-helper` | Linux x64/arm64 | `linux/restash-linux-helper.c` | `ubuntu-latest` runner (gcc) — see `build-linux-helper.sh` |

Why per-OS CI: the Windows exe must be compiled (and signed) on Windows; the
Linux ELF must be compiled on Linux. They **cannot** be produced on the macOS
dev machine. The committed `.c` is the source of truth; CI compiles it on every
release so the published installer is fully self-contained — no postinstall
downloads, no runtime fetch.

## Windows helper (`restash-win-helper.exe`)
Win32 C, statically linked (`/MT`), depends only on system DLLs (user32,
shell32, ole32) present on every Win10/11. Modes: `--get-foreground`,
`--paste [hwnd]` (SetForegroundWindow + AttachThreadInput workaround + SendInput
Ctrl+V), `--clip-files <paths...>` (CF_HDROP), `--list` (EnumWindows JSON).
Known limitation: SendInput can't target elevated/admin windows unless Restash
is elevated (documented; no elevation required for normal use).

## Linux helper (`restash-linux-helper`)
C. Links libxcb + libxcb-xtest (part of any X11 server runtime — not a user
install; still bundled in the AppImage with RPATH). Modes: `--get-active`,
`--paste [id]` (XTEST Ctrl+V after `_NET_ACTIVE_WINDOW` activate),
`--clip-files <paths...>` (becomes a short-lived CLIPBOARD selection owner
serving `text/uri-list` + `x-special/gnome-copied-files` — no xclip/wl-copy),
`--list` (`_NET_CLIENT_LIST`), `--paste-wayland`, `--check-uinput`.

Wayland paste is sanctioned only via:
1. **PRIMARY** — `org.freedesktop.portal.RemoteDesktop` + libei (compile with
   `-DHAVE_LIBEI`). The compositor shows its OWN one-time consent dialog (a
   PERMISSION, not a download). The portal `restore_token` is persisted so
   later sessions reconnect without re-prompting.
2. **FALLBACK** — `/dev/uinput` directly (the helper IS the daemon, spawned on
   demand — no ydotoold, no second install). `/dev/uinput` access is the one-time
   OS permission, granted via the OS's own pkexec/polkit dialog (a udev rule —
   a permission, not a package). `--check-uinput` reports whether it's satisfied.
3. **LAST RESORT** — copy-only: the JS layer writes the clipboard and toasts.

`libei.so`/`libportal.so` and their transitive deps are bundled under the
AppImage and resolved via `RPATH`/`LD_LIBRARY_PATH` pointed at the bundled copy
so nothing resolves from the host.
