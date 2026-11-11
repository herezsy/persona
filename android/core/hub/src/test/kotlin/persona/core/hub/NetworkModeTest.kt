package persona.core.hub

import persona.core.contracts.Endpoint
import persona.core.contracts.api.EndpointOverrides
import persona.core.contracts.api.NetworkMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NetworkModeTest {
    private val lan = Endpoint("http://192.168.1.10:18660", "lan")
    private val name = Endpoint("https://hub.example.com:18662", "name")
    private val ipv6 = Endpoint("https://[2001:db8::1]:18662", "ipv6")

    @Test fun homeMatchesOnlyLan() {
        assertTrue(NetworkMode.Home.matches("lan"))
        assertFalse(NetworkMode.Home.matches("name"))
        assertFalse(NetworkMode.Home.matches("ipv6"))
        assertEquals(NetworkMode.Home, networkModeOf("lan"))
        assertEquals(NetworkMode.Away, networkModeOf("name"))
    }

    @Test fun stickyEndpointsPutSelectedFirstWithinMode() {
        val overrides = EndpointOverrides(mode = NetworkMode.Away, selected = endpointKey(name.url))
        assertEquals(listOf(name, ipv6), stickyEndpoints(listOf(lan, ipv6, name), overrides))
    }

    @Test fun stickyEndpointsWithoutModeKeepOrder() {
        val all = listOf(lan, name, ipv6)
        assertEquals(all, stickyEndpoints(all, EndpointOverrides()))
    }

    @Test fun homeModeDropsOutsideAddresses() {
        val overrides = EndpointOverrides(mode = NetworkMode.Home)
        assertEquals(listOf(lan), stickyEndpoints(listOf(lan, name, ipv6), overrides))
    }
}
