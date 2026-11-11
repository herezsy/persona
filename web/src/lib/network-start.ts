// Register the sticky Network (组网切换) hello listener once the app loads (imported from App).
import { ingestHelloNetworks } from "./network";
import { onHubEvent } from "./store";

onHubEvent("hello", (msg) => {
  ingestHelloNetworks({
    public_url: msg.public_url,
    endpoints: msg.endpoints,
    mesh: msg.mesh as Parameters<typeof ingestHelloNetworks>[0]["mesh"],
    hub_id: msg.hub_id,
    hub_name: msg.hub_name,
  });
});
