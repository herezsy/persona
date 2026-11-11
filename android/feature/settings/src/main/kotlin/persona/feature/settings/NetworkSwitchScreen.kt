package persona.feature.settings

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import persona.core.contracts.api.ConnectionEndpoints
import persona.core.contracts.api.EndpointEntry
import persona.core.contracts.api.NetworkMode
import persona.core.designsystem.GroupPosition
import persona.core.designsystem.JGroupItem
import persona.core.designsystem.JListPage
import persona.core.designsystem.JNotice
import persona.core.designsystem.JRow
import persona.core.designsystem.JSectionHeader
import persona.core.designsystem.Status
import persona.core.designsystem.Tokens
import persona.core.designsystem.icons.PhIcons
import kotlinx.coroutines.launch

/**
 * Top-level Settings › Network (组网切换): Home (LAN) vs Away (outside). The sticky mode and selected address
 * change only here; connect / reconnect / probes never switch them.
 */
@Composable
internal fun NetworkSwitchScreen(
    endpoints: ConnectionEndpoints?,
    paired: Boolean,
    onBack: (() -> Unit)? = null,
    onDiagnostics: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val routes by (endpoints?.state ?: kotlinx.coroutines.flow.MutableStateFlow(persona.core.contracts.api.ConnectionEndpointsState()))
        .collectAsStateWithLifecycle()
    val mode = routes.mode
    val home = routes.entries.filter { it.kind == "lan" && it.enabled }
    val away = routes.entries.filter { it.kind != "lan" && it.enabled }
    JListPage(title = stringResource(R.string.settings_network_title), onBack = onBack) {
        item {
            SettingsCaption(
                stringResource(R.string.settings_network_caption),
                Modifier.padding(bottom = Tokens.Space.m),
            )
        }
        if (!paired || endpoints == null) {
            item {
                JNotice(stringResource(R.string.settings_network_need_pair), status = Status.NeedsYou)
            }
        } else {
            item { JSectionHeader(stringResource(R.string.settings_network_mode_header)) }
            item {
                JGroupItem(GroupPosition.of(0, 2)) {
                    ModeRow(
                        title = stringResource(R.string.settings_network_mode_home),
                        subtitle = stringResource(R.string.settings_network_mode_home_subtitle),
                        selected = mode == NetworkMode.Home,
                        enabled = home.isNotEmpty(),
                        testTag = "settings-network-home",
                    ) { scope.launch { runCatching { endpoints.setMode(NetworkMode.Home) } } }
                }
            }
            item {
                JGroupItem(GroupPosition.of(1, 2)) {
                    ModeRow(
                        title = stringResource(R.string.settings_network_mode_away),
                        subtitle = stringResource(R.string.settings_network_mode_away_subtitle),
                        selected = mode == NetworkMode.Away,
                        enabled = away.isNotEmpty(),
                        testTag = "settings-network-away",
                    ) { scope.launch { runCatching { endpoints.setMode(NetworkMode.Away) } } }
                }
            }
            if (mode == null) {
                item {
                    SettingsCaption(
                        stringResource(R.string.settings_network_mode_unset),
                        Modifier.padding(top = Tokens.Space.s, bottom = Tokens.Space.m),
                    )
                }
            }
            val shown = when (mode) {
                NetworkMode.Home -> home
                NetworkMode.Away -> away
                null -> routes.entries.filter { it.enabled }
            }
            if (shown.isNotEmpty()) {
                item {
                    JSectionHeader(
                        stringResource(
                            when (mode) {
                                NetworkMode.Home -> R.string.settings_network_addresses_home
                                NetworkMode.Away -> R.string.settings_network_addresses_away
                                null -> R.string.settings_network_addresses_all
                            },
                        ),
                        count = shown.size,
                    )
                }
                shown.forEachIndexed { index, entry ->
                    item(key = "net-${entry.url}") {
                        JGroupItem(GroupPosition.of(index, shown.size)) {
                            AddressRow(entry, selected = endpointSelected(routes.selected, entry), active = entry.active) {
                                scope.launch { runCatching { endpoints.select(entry.url) } }
                            }
                        }
                    }
                }
            } else {
                item {
                    JNotice(
                        stringResource(
                            when (mode) {
                                NetworkMode.Home -> R.string.settings_network_empty_home
                                NetworkMode.Away -> R.string.settings_network_empty_away
                                null -> R.string.settings_network_empty_all
                            },
                        ),
                        Modifier.padding(top = Tokens.Space.m),
                        status = Status.NeedsYou,
                    )
                }
            }
            item {
                SettingsCaption(
                    stringResource(R.string.settings_network_diag_hint),
                    Modifier.padding(top = Tokens.Space.l, bottom = Tokens.Space.s),
                )
            }
            item {
                JGroupItem(GroupPosition.Single) {
                    JRow(
                        title = stringResource(R.string.settings_diag_title),
                        leadingIcon = PhIcons.Gauge,
                        subtitle = stringResource(R.string.settings_row_diag_subtitle),
                        onClick = onDiagnostics,
                        modifier = Modifier.testTag("settings-network-diagnostics"),
                    )
                }
            }
        }
    }
}

@Composable
private fun ModeRow(
    title: String,
    subtitle: String,
    selected: Boolean,
    enabled: Boolean,
    testTag: String,
    onClick: () -> Unit,
) {
    JRow(
        title = title,
        subtitle = subtitle,
        selected = selected,
        value = if (selected) stringResource(R.string.settings_network_in_use) else null,
        enabled = enabled,
        onClick = onClick,
        modifier = Modifier.testTag(testTag),
    )
}

@Composable
private fun AddressRow(entry: EndpointEntry, selected: Boolean, active: Boolean, onClick: () -> Unit) {
    val tag = when {
        selected && active -> stringResource(R.string.settings_network_in_use)
        selected -> stringResource(R.string.settings_network_selected)
        active -> stringResource(R.string.settings_endpoint_tag_active)
        else -> null
    }
    JRow(
        title = entry.url,
        subtitle = networkKindLabel(entry.kind),
        value = tag,
        selected = selected,
        subtitleLines = Int.MAX_VALUE,
        onClick = onClick,
        modifier = Modifier.testTag("settings-network-address"),
    )
}

@Composable
private fun networkKindLabel(kind: String): String = stringResource(
    when (kind) {
        "lan" -> R.string.settings_route_lan
        "ipv6" -> R.string.settings_route_ipv6
        "ipv4" -> R.string.settings_route_ipv4
        "name" -> R.string.settings_route_name
        else -> R.string.settings_route_unknown
    },
)

private fun endpointSelected(selected: String?, entry: EndpointEntry): Boolean {
    if (selected.isNullOrBlank()) return false
    return selected == entry.url || selected.equals(entry.url.trimEnd('/'), ignoreCase = true)
}
