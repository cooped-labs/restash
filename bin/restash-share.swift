// restash-share — tiny CLI that pops up the native macOS share sheet
// (NSSharingServicePicker), anchored to the mouse location. Restash spawns
// this when the user clicks the Share button on a row.
//
// usage: restash-share <text> [url] [url] ...
//        Each remaining arg is treated as an additional item to share.
//
// Build: swiftc -O bin/restash-share.swift -o bin/restash-share -framework Cocoa

import Cocoa

final class ShareDelegate: NSObject, NSSharingServicePickerDelegate {
    weak var panel: NSPanel?

    func sharingServicePicker(_ picker: NSSharingServicePicker, didChoose service: NSSharingService?) {
        // Give the chosen service a beat to start before we exit.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            self.panel?.orderOut(nil)
            NSApp.terminate(nil)
        }
    }
}

// Args we recognize:
//   --title=<string>   sets the preview title shown above the value
//   --icon=<path>      path to an image file (PNG/SVG) for the preview thumbnail
//   <anything else>    treated as content (first non-flag = primary text;
//                      http(s) URLs become NSURL items)
let rawArgs = Array(CommandLine.arguments.dropFirst())
guard !rawArgs.isEmpty else { exit(0) }

var title: String? = nil
var iconPath: String? = nil
var contentArgs: [String] = []

for a in rawArgs {
    if a.hasPrefix("--title=") {
        title = String(a.dropFirst("--title=".count))
    } else if a.hasPrefix("--icon=") {
        iconPath = String(a.dropFirst("--icon=".count))
    } else {
        contentArgs.append(a)
    }
}

guard !contentArgs.isEmpty else { exit(0) }

var items: [Any] = []

// Primary content item — wrap with a NSPreviewRepresentingActivityItem when
// we have an icon, so the share sheet shows our title + chain logo instead
// of an auto-generated text preview.
let primary = contentArgs.first!
if let iconPath, let img = NSImage(contentsOfFile: iconPath) {
    if #available(macOS 13.0, *) {
        items.append(NSPreviewRepresentingActivityItem(
            item: primary,
            title: title,
            image: img,
            icon: nil
        ))
    } else {
        items.append(primary as NSString)
    }
} else {
    items.append(primary as NSString)
}

// Additional args: absolute filesystem paths become file URLs (so Mail /
// Messages / AirDrop offer attachment behavior), http(s) become web URLs.
for a in contentArgs.dropFirst() {
    if a.hasPrefix("/") && FileManager.default.fileExists(atPath: a) {
        items.append(URL(fileURLWithPath: a) as NSURL)
    } else if let url = URL(string: a), let scheme = url.scheme, scheme == "http" || scheme == "https" {
        items.append(url)
    }
}

// If the PRIMARY arg is itself a file path, treat that as the file item
// instead of wrapping it as text. This covers file-only shares.
if !contentArgs.isEmpty {
    let first = contentArgs[0]
    if first.hasPrefix("/") && FileManager.default.fileExists(atPath: first) {
        // Replace the text-wrapped item we appended earlier with the file URL.
        items.removeAll()
        items.append(URL(fileURLWithPath: first) as NSURL)
        for a in contentArgs.dropFirst() {
            if a.hasPrefix("/") && FileManager.default.fileExists(atPath: a) {
                items.append(URL(fileURLWithPath: a) as NSURL)
            } else if let url = URL(string: a), let scheme = url.scheme, scheme == "http" || scheme == "https" {
                items.append(url)
            }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let mouseLoc = NSEvent.mouseLocation
let panel = NSPanel(
    contentRect: NSRect(x: mouseLoc.x - 1, y: mouseLoc.y - 1, width: 2, height: 2),
    styleMask: [.borderless, .nonactivatingPanel],
    backing: .buffered,
    defer: false
)
panel.alphaValue = 0.0
panel.level = .screenSaver  // must be above Restash's pop-up-menu level
panel.isFloatingPanel = true
panel.hidesOnDeactivate = false

let delegate = ShareDelegate()
delegate.panel = panel

let picker = NSSharingServicePicker(items: items)
picker.delegate = delegate

panel.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)

if let view = panel.contentView {
    picker.show(relativeTo: view.bounds, of: view, preferredEdge: .minY)
}

// Safety: if the user dismisses the picker without choosing, we'd otherwise
// hang forever. Exit after 60 seconds no matter what.
DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
    NSApp.terminate(nil)
}

app.run()
