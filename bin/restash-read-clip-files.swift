// restash-read-clip-files — READS the macOS pasteboard and prints any COPIED
// FILE PATHS to stdout, one POSIX path per line (UTF-8). This is the READ
// counterpart to restash-clip-file.swift (the WRITE helper). Electron's
// clipboard cannot reliably read file URLs / NSFilenamesPboardType, so the
// clipboard watcher in main.js shells out to this helper to detect files that
// the user copied in Finder or another app (⌘C / right-click → Copy).
//
// Exit codes:
//   0  one or more existing file paths were printed to stdout
//   1  nothing capturable (no file types on the pasteboard, or none existed)
//   3  the pasteboard only holds a FILE PROMISE with no resolvable path;
//      "PROMISE" is written to stderr and nothing to stdout.
//
// Build: swiftc -O bin/restash-read-clip-files.swift -o bin/restash-read-clip-files -framework Cocoa

import Cocoa

let pb = NSPasteboard.general
let fm = FileManager.default

// Preserve discovery order while de-duplicating identical paths.
var ordered: [String] = []
var seen = Set<String>()
func add(_ p: String) {
    guard !p.isEmpty, !seen.contains(p) else { return }
    // Skip paths that don't exist on disk (stale references, promises, etc.).
    guard fm.fileExists(atPath: p) else { return }
    seen.insert(p)
    ordered.append(p)
}

// 1) NSFilenamesPboardType — the universal "list of files" type Finder uses.
//    It's an XML/binary property list whose root is an array of POSIX paths.
let filenamesType = NSPasteboard.PasteboardType("NSFilenamesPboardType")
if let data = pb.data(forType: filenamesType),
   let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil),
   let paths = plist as? [String] {
    for p in paths { add(p) }
}

// 2) public.file-url — the modern per-item file-URL type. Resolve every
//    pasteboard item that carries one to its on-disk POSIX path.
let fileURLType = NSPasteboard.PasteboardType("public.file-url")
if let items = pb.pasteboardItems {
    for item in items {
        if let s = item.string(forType: fileURLType),
           let url = URL(string: s), url.isFileURL {
            add(url.path)
        }
    }
}
// Some apps put a single file-url at the top level rather than per-item.
if let s = pb.string(forType: fileURLType),
   let url = URL(string: s), url.isFileURL {
    add(url.path)
}

if !ordered.isEmpty {
    print(ordered.joined(separator: "\n"))
    exit(0)
}

// Nothing resolvable. Distinguish a pure FILE PROMISE (a drag/copy where the
// provider will write the bytes only on demand and exposes no real path yet)
// so the caller can choose to ignore it rather than treat it as "no files."
let types = pb.types ?? []
let promiseTypes: Set<String> = [
    "com.apple.NSFilePromiseItemMetaData",
    "com.apple.pasteboard.promised-file-url",
    "com.apple.pasteboard.promised-file-content-type",
]
if types.contains(where: { promiseTypes.contains($0.rawValue) }) {
    fputs("PROMISE\n", stderr)
    exit(3)
}

exit(1)
