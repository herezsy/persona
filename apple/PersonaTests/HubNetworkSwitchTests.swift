import Foundation
import Testing
@testable import Persona

struct HubNetworkSwitchTests {
    @Test func lanKinds() {
        #expect(HubNetworkSwitch.kind(of: URL(string: "http://127.0.0.1:18660")!) == "lan")
        #expect(HubNetworkSwitch.kind(of: URL(string: "http://localhost:18660")!) == "lan")
        #expect(HubNetworkSwitch.kind(of: URL(string: "http://hub.local:18660")!) == "lan")
        #expect(HubNetworkSwitch.mode(for: "lan") == .home)
    }

    @Test func awayKinds() {
        #expect(HubNetworkSwitch.kind(of: URL(string: "https://hub.example.com:18662")!) == "name")
        #expect(HubNetworkSwitch.kind(of: URL(string: "https://192.0.2.10:18662")!) == "ipv4")
        #expect(HubNetworkSwitch.mode(for: "name") == .away)
        #expect(HubNetworkSwitch.matches(.away, kind: "ipv6"))
        #expect(!HubNetworkSwitch.matches(.home, kind: "name"))
    }

    @Test func stickyConfigPrefersSelectedWithinMode() {
        var hub = PairedHub(config: ServerConfig(url: URL(string: "http://127.0.0.1:18660")!, token: "jd_x"))
        hub.candidateEndpoints = [
            "http://127.0.0.1:18660",
            "https://hub.example.com:18662",
            "https://backup.example.com:18662",
        ]
        hub.networkMode = .away
        hub.selectedEndpoint = "https://backup.example.com:18662"
        let sticky = HubNetworkSwitch.stickyConfig(for: hub)
        #expect(sticky?.url.absoluteString == "https://backup.example.com:18662")
        #expect(sticky?.token == "jd_x")
    }

    @Test func applyingModePicksMatchingAddress() {
        var hub = PairedHub(config: ServerConfig(url: URL(string: "http://127.0.0.1:18660")!, token: "jd_x"))
        hub.candidateEndpoints = [
            "http://127.0.0.1:18660",
            "https://hub.example.com:18662",
        ]
        HubNetworkSwitch.applying(mode: .away, to: &hub)
        #expect(hub.networkMode == .away)
        #expect(hub.selectedEndpoint == "https://hub.example.com:18662")
    }

    @Test func rememberSeedsStickyOnce() {
        var hub = PairedHub(config: ServerConfig(url: URL(string: "http://127.0.0.1:18660")!, token: "jd_x"))
        HubNetworkSwitch.remember(connected: URL(string: "http://127.0.0.1:18660")!,
                                  publicURL: URL(string: "https://hub.example.com:18662"),
                                  meshSelf: [], on: &hub)
        #expect(hub.networkMode == .home)
        #expect(hub.selectedEndpoint == "http://127.0.0.1:18660")
        #expect(hub.candidateEndpoints.contains("https://hub.example.com:18662"))
        // A later connect of another address must not overwrite an explicit selection.
        hub.selectedEndpoint = "https://hub.example.com:18662"
        hub.networkMode = .away
        HubNetworkSwitch.remember(connected: URL(string: "http://127.0.0.1:18660")!,
                                  publicURL: nil, meshSelf: [], on: &hub)
        #expect(hub.networkMode == .away)
        #expect(hub.selectedEndpoint == "https://hub.example.com:18662")
    }
}
