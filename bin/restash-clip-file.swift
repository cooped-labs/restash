// restash-clip-file — writes one OR MANY file paths to the macOS pasteboard
// so a single ⌘V attaches/copies all of them at once.
//
// usage: restash-clip-file <path1> [path2] [path3] ...
//
// Build: swiftc -O bin/restash-clip-file.swift -o bin/restash-clip-file -framework Cocoa

import Cocoa

let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else {
    fputs("usage: restash-clip-file <path1> [path2] ...\n", stderr)
    exit(1)
}

let fm = FileManager.default
let urls: [URL] = args.compactMap { raw in
    let u = URL(fileURLWithPath: raw)
    return fm.fileExists(atPath: u.path) ? u : nil
}
guard !urls.isEmpty else {
    fputs("restash-clip-file: no existing paths in \(args)\n", stderr)
    exit(2)
}

let pb = NSPasteboard.general
pb.clearContents()

// Type IDs. NSFilenamesPboardType is the universal "list of files" type that
// Finder, Mail, Messages, Slack all respect. public.file-url is the modern
// per-item type. .string is a fallback for text fields.
let filenamesType = NSPasteboard.PasteboardType("NSFilenamesPboardType")
let fileURLType   = NSPasteboard.PasteboardType("public.file-url")
let stringType    = NSPasteboard.PasteboardType.string

pb.declareTypes([filenamesType, fileURLType, stringType], owner: nil)

// 1) NSFilenamesPboardType — XML property list of POSIX paths. Universal
//    multi-file pasteboard type; what Finder uses internally.
let pathList = NSArray(array: urls.map { $0.path })
if let data = try? PropertyListSerialization.data(
    fromPropertyList: pathList,
    format: .xml,
    options: 0
) {
    pb.setData(data, forType: filenamesType)
}

// 2) public.file-url — first file's URL (some recipients only check this
//    single-item type; for multi-file they fall back to NSFilenamesPboardType).
if let first = urls.first {
    pb.setString(first.absoluteString, forType: fileURLType)
}

// 3) Plain-text fallback — newline-separated paths if multiple, single path if one.
let asText = urls.map { $0.path }.joined(separator: "\n")
pb.setString(asText, forType: stringType)

exit(0)
