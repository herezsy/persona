import SwiftUI

/// Settings › Network (组网切换): sticky Home / Away for the current hub group.
struct NetworkSwitchView: View {
    @Environment(AppModel.self) private var model

    private var hub: PairedHub? {
        guard let group = model.hub?.group else { return model.registry.primary("") }
        return model.registry.primary(group)
    }

    private var publicURL: URL? { model.hub?.hello.publicURL }

    private var candidates: [URL] {
        guard let hub else { return [] }
        return HubNetworkSwitch.candidates(for: hub, publicURL: publicURL)
    }

    private var home: [URL] { candidates.filter { HubNetworkSwitch.kind(of: $0) == "lan" } }
    private var away: [URL] { candidates.filter { HubNetworkSwitch.kind(of: $0) != "lan" } }

    var body: some View {
        List {
            Section {
                Text(String(localized: "Choose how this phone reaches the hub. The app keeps your choice across launches and does not switch by itself on reconnect or connectivity checks."))
                    .font(Theme.Font.caption)
                    .foregroundStyle(.secondary)
            }

            if hub == nil || model.isDemo {
                Section {
                    Text(String(localized: "Pair a hub first to switch networks."))
                        .foregroundStyle(.secondary)
                }
            } else {
                Section {
                    modeRow(.home, title: String(localized: "Home"),
                            enabled: !home.isEmpty)
                    modeRow(.away, title: String(localized: "Away"),
                            enabled: !away.isEmpty)
                } header: {
                    SettingsHeading(String(localized: "Connection Mode"))
                } footer: {
                    Text(String(localized: "Home uses LAN addresses; Away uses outside addresses. The choice stays until you switch it here."))
                }

                let shown: [URL] = {
                    switch hub?.networkMode {
                    case .home: return home
                    case .away: return away
                    case nil: return candidates
                    }
                }()

                Section {
                    if shown.isEmpty {
                        Text(emptyMessage).foregroundStyle(.secondary)
                    } else {
                        ForEach(shown, id: \.absoluteString) { url in
                            addressRow(url)
                        }
                    }
                } header: {
                    SettingsHeading(addressesHeading)
                }

                Section {
                    NavigationLink(value: SettingsPage.hubs) {
                        SettingsRow(title: "hub", symbol: Theme.Icon.hubGroup, tint: Theme.Hue.green,
                                    value: String(localized: "Tunnels and pairing"), look: .oneLine)
                    }
                    .settingsListRow(SettingsPage.hubs)
                } footer: {
                    Text(String(localized: "To set up SSH tunnels, a local proxy or Cloudflare Access, open hub."))
                }
            }
        }
        .themedGroupedPage()
        .navigationTitle(String(localized: "Network"))
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private var addressesHeading: String {
        switch hub?.networkMode {
        case .home: return String(localized: "Home Addresses")
        case .away: return String(localized: "Away Addresses")
        case nil: return String(localized: "Addresses")
        }
    }

    private var emptyMessage: String {
        switch hub?.networkMode {
        case .home: return String(localized: "No LAN addresses are available. Pair again with a LAN URL, or switch to Away.")
        case .away: return String(localized: "No outside addresses are available. Add a public URL on the hub, or switch to Home.")
        case nil: return String(localized: "No candidate addresses yet.")
        }
    }

    @ViewBuilder
    private func modeRow(_ mode: HubNetworkMode, title: String, enabled: Bool) -> some View {
        let selected = hub?.networkMode == mode
        Button {
            model.setNetworkMode(mode)
        } label: {
            SettingsRow(title: title, symbol: mode == .home ? Theme.Icon.home : Theme.Icon.servedPage,
                        tint: Theme.Hue.blue, value: selected ? String(localized: "In Use") : nil, look: .oneLine)
        }
        .disabled(!enabled)
        .modifier(SettingsButtonLook())
        .accessibilityIdentifier(mode == .home ? "settings.network.home" : "settings.network.away")
    }

    @ViewBuilder
    private func addressRow(_ url: URL) -> some View {
        let selected = hub?.selectedEndpoint.map { HubNetworkSwitch.key($0) == HubNetworkSwitch.key(url) } == true
        let kind = HubNetworkSwitch.kind(of: url)
        Button {
            model.selectNetwork(url)
        } label: {
            SettingsRow(title: "\(kindLabel(kind)) · \(url.absoluteString)", symbol: Theme.Icon.server, tint: Theme.Hue.green,
                        value: selected ? String(localized: "Selected") : nil, look: .oneLine)
        }
        .modifier(SettingsButtonLook())
        .accessibilityIdentifier("settings.network.address")
    }

    private func kindLabel(_ kind: String) -> String {
        switch kind {
        case "lan": return String(localized: "LAN")
        case "ipv6": return String(localized: "Public IPv6")
        case "ipv4": return String(localized: "Public IPv4")
        case "name": return String(localized: "Domain")
        default: return String(localized: "Unknown type")
        }
    }
}
