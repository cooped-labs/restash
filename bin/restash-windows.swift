// restash-windows — lists the app windows on the CURRENT macOS Desktop (Space).
//
// Uses CGWindowListCopyWindowInfo with .optionOnScreenOnly, which returns only
// windows on the active Space — the public, supported way to scope to "this
// desktop". Owner (app) names never need Screen Recording permission; window
// titles DO on Catalina+ (empty string when not granted, which we tolerate).
//
// Output: JSON array of { "owner": <app name>, "title": <window title> }, one
// entry per normal (layer 0) on-screen window.
//
// Build: swiftc -O bin/restash-windows.swift -o bin/restash-windows -framework Cocoa

import Cocoa
import CoreGraphics

let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let info = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
    print("[]")
    exit(0)
}

var arr: [[String: String]] = []
for w in info {
    // Layer 0 = ordinary application windows. Menubar/Dock/wallpaper/overlays
    // sit on other layers and are skipped.
    let layer = w[kCGWindowLayer as String] as? Int ?? -1
    if layer != 0 { continue }

    guard let owner = w[kCGWindowOwnerName as String] as? String, !owner.isEmpty else { continue }
    let title = (w[kCGWindowName as String] as? String) ?? ""

    // Drop tiny helper windows (tooltips, pickers) — keep real app windows.
    if let b = w[kCGWindowBounds as String] as? [String: Any],
       let h = b["Height"] as? Double, let wd = b["Width"] as? Double,
       (h < 40 || wd < 40) {
        continue
    }

    arr.append(["owner": owner, "title": title])
}

if let data = try? JSONSerialization.data(withJSONObject: arr),
   let json = String(data: data, encoding: .utf8) {
    print(json)
} else {
    print("[]")
}
