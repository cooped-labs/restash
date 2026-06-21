// restash-notch — reports the physical notch geometry of the built-in display.
//
// macOS does not expose the notch's x-range through Electron's Display API. The
// exact center/width comes from NSScreen: on a notch Mac the menu bar is split
// into two strips flanking the notch — `auxiliaryTopLeftArea` (left of notch)
// and `auxiliaryTopRightArea` (right of notch). The gap between them IS the
// notch. `safeAreaInsets.top` gives the notch height. We translate everything
// into top-left origin, points (not pixels), matching Electron's screen bounds.
//
// Output: JSON for the built-in screen, e.g.
//   {"hasNotch":true,"display":{"x":0,"y":0,"w":1512,"h":982},
//    "notch":{"x":682,"y":0,"w":148,"h":37}}
// or {"hasNotch":false, ...} on non-notch Macs. On any failure prints
// {"hasNotch":false} and exits 0 so the JS caller can fall back to centering.
//
// Build: swiftc -O bin/restash-notch.swift -o bin/restash-notch -framework Cocoa

import Cocoa

func emit(_ obj: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: obj),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        print("{\"hasNotch\":false}")
    }
}

// Find the built-in screen. NSScreen with a notch always has non-zero
// safeAreaInsets.top; the built-in display is also the one carrying the menu
// bar at app launch. Prefer the screen that actually reports a notch.
let screens = NSScreen.screens
guard !screens.isEmpty else { emit(["hasNotch": false]); exit(0) }

func notchScreen() -> NSScreen? {
    for s in screens {
        if #available(macOS 12.0, *) {
            if s.safeAreaInsets.top > 0 { return s }
        }
    }
    return nil
}

guard let screen = notchScreen() else {
    // No notch on any screen — report the main screen bounds for context.
    let f = screens.first!.frame
    emit([
        "hasNotch": false,
        "display": ["x": f.origin.x, "y": f.origin.y, "w": f.size.width, "h": f.size.height],
    ])
    exit(0)
}

// AppKit's coordinate system is bottom-left origin. Electron's screen bounds are
// top-left origin. Convert by flipping against the *primary* screen height (the
// screen whose origin is (0,0)), which is what AppKit uses as the global frame.
let primaryHeight = (NSScreen.screens.first(where: { $0.frame.origin == .zero })?.frame.height)
    ?? screen.frame.height

let df = screen.frame                       // full display frame (bottom-left origin)
let dispX = df.origin.x
let dispW = df.size.width
let dispH = df.size.height
// Top edge in top-left coordinates:
let dispYTop = primaryHeight - (df.origin.y + df.size.height)

var notch: [String: Any]? = nil
if #available(macOS 12.0, *) {
    let notchHeight = screen.safeAreaInsets.top
    // The two auxiliary strips flank the notch. The notch spans the gap between
    // the right edge of the left strip and the left edge of the right strip.
    if let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea {
        // Areas are in the same (bottom-left, global) coordinate space.
        let notchLeftX = left.origin.x + left.size.width
        let notchRightX = right.origin.x
        let notchW = max(0, notchRightX - notchLeftX)
        if notchW > 0 {
            notch = [
                "x": notchLeftX,
                "y": dispYTop,            // flush to the very top edge
                "w": notchW,
                "h": notchHeight,
            ]
        }
    }
    if notch == nil {
        // Fallback: we know there's a notch (safeAreaInsets.top > 0) but the
        // auxiliary areas weren't available — synthesize a centered notch using
        // a typical notch width so the caller still gets a real geometry.
        let approxW: CGFloat = 160
        notch = [
            "x": dispX + (dispW - approxW) / 2,
            "y": dispYTop,
            "w": approxW,
            "h": notchHeight,
        ]
    }
}

emit([
    "hasNotch": notch != nil,
    "display": ["x": dispX, "y": dispYTop, "w": dispW, "h": dispH],
    "notch": notch as Any,
])
