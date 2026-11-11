import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ingestHelloNetworks,
  listNetworkPaths,
  loadCandidateNetworks,
  loadNetworkMode,
  loadSelectedNetwork,
  modeMatches,
  modeOfKind,
  networkKind,
  rememberNetworkCandidates,
  resetHelloNetworks,
  seedStickyFromHere,
  setStickyNetwork,
} from "./network";

const ORIGIN = "http://127.0.0.1:18660";

describe("networkKind", () => {
  it("classifies LAN, public IP, IPv6 and names", () => {
    expect(networkKind("http://127.0.0.1:18660")).toBe("lan");
    expect(networkKind("http://192.0.2.10:18660")).toBe("ipv4");
    expect(networkKind("https://[2001:db8::1]:18662")).toBe("ipv6");
    expect(networkKind("https://[fe80::1]:18662")).toBe("lan");
    expect(networkKind("https://hub.example.com")).toBe("name");
    expect(networkKind("http://hub.local:18660")).toBe("lan");
  });
});

describe("mode helpers", () => {
  it("maps lan to home and everything else to away", () => {
    expect(modeOfKind("lan")).toBe("home");
    expect(modeOfKind("name")).toBe("away");
    expect(modeMatches("home", "lan")).toBe(true);
    expect(modeMatches("away", "lan")).toBe(false);
    expect(modeMatches("away", "ipv6")).toBe(true);
  });
});

describe("sticky persistence and paths", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    resetHelloNetworks();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("location", { origin: ORIGIN, href: ORIGIN + "/" } as unknown as Location);
  });
  afterEach(() => {
    resetHelloNetworks();
    vi.unstubAllGlobals();
  });

  it("seeds once from this origin and does not overwrite later", () => {
    seedStickyFromHere();
    expect(loadNetworkMode()).toBe("home");
    expect(loadSelectedNetwork()).toBe(ORIGIN);
    expect(loadCandidateNetworks()).toContain(ORIGIN);

    setStickyNetwork("away", "https://hub.example.com");
    seedStickyFromHere();
    expect(loadNetworkMode()).toBe("away");
    expect(loadSelectedNetwork()).toBe("https://hub.example.com");
  });

  it("remembers hello candidates without changing sticky mode", () => {
    setStickyNetwork("home", ORIGIN);
    rememberNetworkCandidates(["https://hub.example.com", "https://[2001:db8::1]:18662"]);
    expect(loadNetworkMode()).toBe("home");
    expect(loadSelectedNetwork()).toBe(ORIGIN);
    expect(loadCandidateNetworks()).toEqual(expect.arrayContaining(["https://hub.example.com", "https://[2001:db8::1]:18662"]));
  });

  it("lists this page and hello endpoints as multiple networks", () => {
    ingestHelloNetworks({
      public_url: "https://hub.example.com",
      endpoints: [
        { url: ORIGIN, kind: "lan" },
        { url: "https://[2001:db8::1]:18662", kind: "ipv6" },
        { url: "https://hub.example.com", kind: "name" },
      ],
      hub_name: "Home hub",
    });
    const paths = listNetworkPaths();
    const urls = paths.map((p) => p.url);
    expect(urls).toContain(ORIGIN);
    expect(urls).toContain("https://hub.example.com");
    expect(urls).toContain("https://[2001:db8::1]:18662");
    expect(paths.find((p) => p.url === ORIGIN)?.source).toBe("here");
    expect(paths.filter((p) => modeMatches("home", p.kind)).length).toBeGreaterThan(0);
    expect(paths.filter((p) => modeMatches("away", p.kind)).length).toBeGreaterThan(0);
  });

  it("does not treat other saved hubs as this hub's network paths", () => {
    store.set("persona.hubs", JSON.stringify([{ url: "https://other.example.com", name: "Other" }]));
    const paths = listNetworkPaths({ endpoints: [{ url: ORIGIN, kind: "lan" }] });
    expect(paths.map((p) => p.url)).not.toContain("https://other.example.com");
  });
});
