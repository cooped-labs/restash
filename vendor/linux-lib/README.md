# Bundled Linux .so deps for the AppImage (zero-install)

At release time the CI 'ubuntu-latest' job copies the libei/libportal shared
libraries (and their transitive deps) that restash-linux-helper links against
into this directory. electron-builder then bundles them under the AppImage as
resources/lib and the helper resolves them via RPATH ($ORIGIN/../lib) /
LD_LIBRARY_PATH so nothing is ever resolved from the host.

Empty in the repo on purpose — the .so files are produced per-arch by CI, not
committed (they are large, arch-specific build artifacts). X11-only builds
need no bundled libs because libxcb ships with every X11 server runtime.
