// restash-decode-qr — decodes any QR (or other supported barcode) in an
// image and prints its payload to stdout. Uses macOS Vision so it's fast,
// dependency-free, and ships with the OS.
//
// usage: restash-decode-qr <png-path>
// exits:
//   0 + stdout = payload   → success
//   2                       → image opened but no QR/barcode found
//   3                       → image couldn't be opened
//   4                       → Vision request failed
//
// Build: swiftc -O bin/restash-decode-qr.swift -o bin/restash-decode-qr -framework Vision -framework AppKit

import Foundation
import AppKit
import Vision

let args = Array(CommandLine.arguments.dropFirst())
guard let pathArg = args.first else {
    fputs("usage: restash-decode-qr <image-path>\n", stderr)
    exit(1)
}

let url = URL(fileURLWithPath: pathArg)
guard FileManager.default.fileExists(atPath: url.path) else {
    fputs("restash-decode-qr: file not found: \(url.path)\n", stderr)
    exit(3)
}

guard let nsimg = NSImage(contentsOf: url),
      let cg = nsimg.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("restash-decode-qr: could not open image\n", stderr)
    exit(3)
}

let request = VNDetectBarcodesRequest()
// Restrict to QR for clarity; uncomment to also pick up Code128, EAN, etc.
request.symbologies = [.qr]

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
    try handler.perform([request])
} catch {
    fputs("restash-decode-qr: Vision failed: \(error.localizedDescription)\n", stderr)
    exit(4)
}

guard let observations = request.results as? [VNBarcodeObservation],
      !observations.isEmpty else {
    exit(2)
}

// Take the highest-confidence result; multiple QRs in one screenshot are rare
// enough that we don't expose them yet.
let best = observations.max(by: { $0.confidence < $1.confidence })
guard let payload = best?.payloadStringValue, !payload.isEmpty else {
    exit(2)
}

// Single line of stdout = the payload, exactly as encoded.
FileHandle.standardOutput.write(payload.data(using: .utf8) ?? Data())
exit(0)
