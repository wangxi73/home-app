import Cocoa
import ApplicationServices
import Foundation

func getHomeApp() -> AXUIElement? {
    if let app = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier == "com.apple.Home" }) {
        return AXUIElementCreateApplication(app.processIdentifier)
    }
    return nil
}

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
    var val: AnyObject?
    return AXUIElementCopyAttributeValue(el, name as CFString, &val) == .success ? val : nil
}

func clickSidebarRoom(_ win: AXUIElement, _ roomName: String) -> Bool {
    var found = false
    func walk(_ el: AXUIElement) {
        if found { return }
        let role = attr(el, kAXRoleAttribute) as? String ?? ""
        let desc = attr(el, kAXDescriptionAttribute) as? String ?? ""
        if role == "AXStaticText" && desc == roomName {
            if let parent = attr(el, kAXParentAttribute) {
                AXUIElementPerformAction(parent as! AXUIElement, kAXPressAction as CFString)
            }
            AXUIElementPerformAction(el, kAXPressAction as CFString)
            found = true
            return
        }
        if let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
            for c in children { walk(c) }
        }
    }
    walk(win)
    return found
}

func clickDeviceButton(_ win: AXUIElement, _ devName: String) -> String? {
    var matchedDesc: String? = nil
    func walk(_ el: AXUIElement) {
        if matchedDesc != nil { return }
        let role = attr(el, kAXRoleAttribute) as? String ?? ""
        let desc = attr(el, kAXDescriptionAttribute) as? String ?? ""
        if role == "AXButton" && (desc.hasPrefix(devName + ",") || desc == devName || desc.contains(", " + devName + ",")) {
            AXUIElementPerformAction(el, kAXPressAction as CFString)
            matchedDesc = desc
            return
        }
        if let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
            for c in children { walk(c) }
        }
    }
    walk(win)
    return matchedDesc
}

func collectButtons(_ win: AXUIElement, _ out: inout [String]) {
    let role = attr(win, kAXRoleAttribute) as? String ?? ""
    let desc = attr(win, kAXDescriptionAttribute) as? String ?? ""
    if role == "AXButton" && !desc.isEmpty {
        out.append(desc)
    }
    if let children = attr(win, kAXChildrenAttribute) as? [AXUIElement] {
        for c in children { collectButtons(c, &out) }
    }
}

let args = CommandLine.arguments
guard let appRef = getHomeApp(),
      let wins = attr(appRef, kAXWindowsAttribute) as? [AXUIElement],
      let win = wins.first else {
    print("{\"ok\":false,\"error\":\"Home.app not running or no window\"}")
    exit(0)
}

let cmd = args.count > 1 ? args[1] : "status"

if cmd == "toggle" && args.count >= 4 {
    let room = args[2]
    let dev = args[3]
    _ = clickSidebarRoom(win, room)
    Thread.sleep(forTimeInterval: 0.35)
    if let hit = clickDeviceButton(win, dev) {
        print("{\"ok\":true,\"room\":\"\(room)\",\"device\":\"\(dev)\",\"matched\":\"\(hit)\"}")
    } else {
        print("{\"ok\":false,\"room\":\"\(room)\",\"device\":\"\(dev)\",\"error\":\"Button not found\"}")
    }
} else if cmd == "scene" && args.count >= 3 {
    let sceneName = args[2]
    _ = clickSidebarRoom(win, "Home")
    Thread.sleep(forTimeInterval: 0.3)
    if let hit = clickDeviceButton(win, sceneName) {
        print("{\"ok\":true,\"scene\":\"\(sceneName)\",\"matched\":\"\(hit)\"}")
    } else {
        print("{\"ok\":false,\"scene\":\"\(sceneName)\",\"error\":\"Scene not found\"}")
    }
} else {
    let rooms = ["客厅", "书房", "主卧", "儿童房", "卫生间", "厨房", "Default Room"]
    var devList: [[String: Any]] = []
    for rm in rooms {
        if clickSidebarRoom(win, rm) {
            Thread.sleep(forTimeInterval: 0.25)
            var btns: [String] = []
            collectButtons(win, &btns)
            for b in btns {
                let parts = b.components(separatedBy: ", ")
                if parts.count == 2 {
                    let nm = parts[0], st = parts[1]
                    let isOn = (st == "On" || st == "Open" || st.contains("% Open"))
                    devList.append(["room": rm, "name": nm, "on": isOn, "statusText": st])
                } else if parts.count == 3 && parts[0] == rm {
                    let nm = parts[1], st = parts[2]
                    let isOn = (st == "On" || st == "Open" || st.contains("% Open"))
                    devList.append(["room": rm, "name": nm, "on": isOn, "statusText": st])
                }
            }
        }
    }
    let payload: [String: Any] = ["ok": true, "devices": devList]
    if let data = try? JSONSerialization.data(withJSONObject: payload),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        print("{\"ok\":true,\"devices\":[]}")
    }
}
