import Foundation
import Network

/// Sticky home / away network selection for the phone apps (Settings › Network). Extends the existing hub URL /
/// candidate design: LAN addresses are Home, everything else is Away. The selection is persisted on `PairedHub` in
/// the keychain registry and only changes when the user switches it in Settings.
nonisolated enum HubNetworkMode: String, Codable, Sendable, CaseIterable, Hashable {
    case home
    case away

    var matchesLAN: Bool { self == .home }
}

nonisolated enum HubNetworkSwitch {
    /// `lan` / `ipv6` / `ipv4` / `name` / `unknown`, matching Android `endpointKind` (no DNS).
    static func kind(of url: URL) -> String {
        guard let host = url.host()?.lowercased(), !host.isEmpty else { return "unknown" }
        if host == "localhost" || host.hasSuffix(".local") { return "lan" }
        if let v6 = IPv6Address(host) {
            return isLocal(v6) ? "lan" : "ipv6"
        }
        if let v4 = IPv4Address(host) {
            return isLocal(v4) ? "lan" : "ipv4"
        }
        return "name"
    }

    static func mode(for kind: String) -> HubNetworkMode {
        kind == "lan" ? .home : .away
    }

    static func matches(_ mode: HubNetworkMode, kind: String) -> Bool {
        mode == .home ? kind == "lan" : kind != "lan"
    }

    /// Canonical comparison key for a hub address (lowercase, no trailing slash).
    static func key(_ url: URL) -> String {
        url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
    }

    static func key(_ string: String) -> String {
        string.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased()
    }

    /// Alternate `alt=` addresses on a pairing link, oldest first.
    static func alts(from pairURL: String) -> [URL] {
        guard let comps = URLComponents(string: pairURL.trimmingCharacters(in: .whitespacesAndNewlines)) else { return [] }
        return (comps.queryItems ?? []).compactMap { item -> URL? in
            guard item.name == "alt", let value = item.value, let url = URL(string: value) else { return nil }
            return url
        }
    }

    /// Candidates for a paired hub: its config URL, recorded candidates, public URL and its own mesh endpoints.
    static func candidates(for hub: PairedHub, publicURL: URL? = nil) -> [URL] {
        var seen = Set<String>()
        var out: [URL] = []
        func add(_ url: URL?) {
            guard let url else { return }
            let k = key(url)
            guard seen.insert(k).inserted else { return }
            out.append(url)
        }
        add(hub.config.url)
        for s in hub.candidateEndpoints { add(URL(string: s)) }
        add(publicURL)
        if let selfID = hub.hubID, let mesh = hub.mesh {
            for m in mesh where m.hubID == selfID || m.isSelf == true {
                for e in m.endpoints ?? [] { add(URL(string: e)) }
            }
        }
        return out
    }

    /// The sticky ServerConfig for a hub when a mode / selected endpoint is set; nil when the official auto route applies.
    static func stickyConfig(for hub: PairedHub, publicURL: URL? = nil) -> ServerConfig? {
        guard hub.networkMode != nil || hub.selectedEndpoint != nil else { return nil }
        let all = candidates(for: hub, publicURL: publicURL)
        let filtered: [URL]
        if let mode = hub.networkMode {
            filtered = all.filter { matches(mode, kind: kind(of: $0)) }
        } else {
            filtered = all
        }
        guard !filtered.isEmpty else { return nil }
        let selected = hub.selectedEndpoint.flatMap { want in filtered.first { key($0) == key(want) } }
        let url = selected ?? filtered[0]
        return ServerConfig(url: url, token: hub.config.token, access: hub.config.access)
    }

    /// Applies a user-chosen mode, picking a sticky address from the candidates that match it.
    static func applying(mode: HubNetworkMode, to hub: inout PairedHub, publicURL: URL? = nil) {
        hub.networkMode = mode
        let matching = candidates(for: hub, publicURL: publicURL).filter { matches(mode, kind: kind(of: $0)) }
        if let current = hub.selectedEndpoint, matching.contains(where: { key($0) == key(current) }) {
            return
        }
        hub.selectedEndpoint = matching.first.map { $0.absoluteString }
    }

    /// Applies a user-chosen address and locks the mode from its kind.
    static func applying(url: URL, to hub: inout PairedHub) {
        let k = kind(of: url)
        hub.networkMode = mode(for: k)
        hub.selectedEndpoint = url.absoluteString
        let key = key(url)
        if !hub.candidateEndpoints.contains(where: { Self.key($0) == key }) {
            hub.candidateEndpoints.append(url.absoluteString)
        }
    }

    /// Records addresses learned after connect, and seeds sticky selection once when none is set.
    static func remember(connected url: URL, publicURL: URL?, meshSelf: [String], on hub: inout PairedHub) {
        var extras = hub.candidateEndpoints
        func add(_ s: String?) {
            guard let s, let u = URL(string: s) else { return }
            let k = key(u)
            if !extras.contains(where: { key($0) == k }) { extras.append(u.absoluteString) }
        }
        add(url.absoluteString)
        add(publicURL?.absoluteString)
        for e in meshSelf { add(e) }
        hub.candidateEndpoints = extras
        if hub.networkMode == nil && hub.selectedEndpoint == nil {
            hub.networkMode = mode(for: kind(of: url))
            hub.selectedEndpoint = url.absoluteString
        }
    }

    private static func isLocal(_ address: IPv4Address) -> Bool {
        let octets = address.rawValue
        let a = octets[0], b = octets[1]
        if a == 10 { return true }
        if a == 127 { return true }
        if a == 192 && b == 168 { return true }
        if a == 169 && b == 254 { return true }
        if a == 172 && (16...31).contains(b) { return true }
        return false
    }

    private static func isLocal(_ address: IPv6Address) -> Bool {
        let bytes = [UInt8](address.rawValue)
        if bytes[0] == 0xfe && (bytes[1] & 0xc0) == 0x80 { return true } // fe80::/10
        if (bytes[0] & 0xfe) == 0xfc { return true } // fc00::/7 ULA
        if bytes.allSatisfy({ $0 == 0 }) { return true }
        if bytes.dropLast().allSatisfy({ $0 == 0 }) && bytes[15] == 1 { return true } // ::1
        return false
    }
}
