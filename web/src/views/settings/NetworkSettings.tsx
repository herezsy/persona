// Settings › Network (组网切换): sticky Home / Away paths for this hub's web page.
// Lists hello-advertised addresses and remembered candidates; switching opens that origin (same-origin design).
// Mode and selection live in this origin's localStorage and change only here — never on reconnect or probes.

import { useEffect, useState } from "react";
import { t } from "../../i18n";
import { here, hostOf } from "../../lib/hubs";
import {
  applyNetworkMode,
  goToNetwork,
  listNetworkPaths,
  loadNetworkMode,
  loadSelectedNetwork,
  modeMatches,
  onNetworkChange,
  seedStickyFromHere,
  setStickyNetwork,
  type NetworkMode,
  type NetworkPath,
} from "../../lib/network";
import { onHubEvent } from "../../lib/store";
import { Button, cx } from "../../ui/atoms";
import { Group, Pill, Row } from "./SettingsParts";

function kindLabel(kind: string): string {
  if (kind === "lan") return t("settings-network.kind_lan");
  if (kind === "ipv6") return t("settings-network.kind_ipv6");
  if (kind === "ipv4") return t("settings-network.kind_ipv4");
  if (kind === "name") return t("settings-network.kind_name");
  return t("settings-network.kind_unknown");
}

export function NetworkSettings() {
  const [paths, setPaths] = useState<NetworkPath[]>(() => listNetworkPaths());
  const [mode, setMode] = useState<NetworkMode | null>(loadNetworkMode);
  const [selected, setSelected] = useState<string | null>(loadSelectedNetwork);

  const refresh = () => {
    seedStickyFromHere();
    setPaths(listNetworkPaths());
    setMode(loadNetworkMode());
    setSelected(loadSelectedNetwork());
  };

  useEffect(() => {
    refresh();
    const offNet = onNetworkChange(refresh);
    const offHello = onHubEvent("hello", () => refresh());
    const storage = (e: StorageEvent) => {
      if (e.key?.startsWith("persona.network.")) refresh();
    };
    addEventListener("storage", storage);
    return () => {
      offNet();
      offHello();
      removeEventListener("storage", storage);
    };
  }, []);

  const home = paths.filter((p) => modeMatches("home", p.kind));
  const away = paths.filter((p) => modeMatches("away", p.kind));
  const shown = mode === "home" ? home : mode === "away" ? away : paths;
  const current = here();

  const pickMode = (next: NetworkMode) => {
    const matching = next === "home" ? home : away;
    if (!matching.length) return;
    applyNetworkMode(next, paths);
    setMode(next);
    setSelected(loadSelectedNetwork());
  };

  const pickPath = (p: NetworkPath) => {
    setStickyNetwork(modeMatches("home", p.kind) ? "home" : "away", p.url);
    setMode(modeMatches("home", p.kind) ? "home" : "away");
    setSelected(p.url);
    if (p.url !== current) goToNetwork(p.url);
  };

  return (
    <>
      <p className="mb-4 px-1 text-[12.5px] leading-relaxed text-ink-3">{t("settings-network.intro")}</p>

      <Group title={t("settings-network.mode_title")} footer={t("settings-network.mode_footer")} anchor="network-mode">
        <ModeRow
          label={t("settings-network.home")}
          hint={t("settings-network.home_hint")}
          active={mode === "home"}
          enabled={home.length > 0}
          onPick={() => pickMode("home")}
        />
        <ModeRow
          label={t("settings-network.away")}
          hint={t("settings-network.away_hint")}
          active={mode === "away"}
          enabled={away.length > 0}
          onPick={() => pickMode("away")}
        />
      </Group>

      <Group
        title={mode === "home" ? t("settings-network.addresses_home") : mode === "away" ? t("settings-network.addresses_away") : t("settings-network.addresses")}
        footer={t("settings-network.addresses_footer")}
        anchor="network-addresses"
      >
        {shown.length === 0 ? (
          <p className="px-4 py-3 text-[12.5px] text-ink-3">{mode ? t("settings-network.empty_mode") : t("settings-network.empty")}</p>
        ) : (
          shown.map((p) => {
            const onThis = p.url === current;
            const sticky = selected === p.url;
            return (
              <Row
                key={p.url}
                label={hostOf(p.url)}
                hint={
                  <span className="font-mono text-[11.5px]">
                    {p.url}
                    <span className="text-ink-3"> · {kindLabel(p.kind)}</span>
                  </span>
                }
              >
                {onThis && <Pill tone="green">{t("settings-network.current")}</Pill>}
                {!onThis && sticky && <Pill>{t("settings-network.selected")}</Pill>}
                {!onThis && (
                  <Button tone="secondary" onClick={() => pickPath(p)} className="h-7 px-2.5">
                    {t("settings-network.use")}
                  </Button>
                )}
                {onThis && !sticky && (
                  <Button tone="quiet" onClick={() => pickPath(p)} className="h-7 px-2.5">
                    {t("settings-network.keep")}
                  </Button>
                )}
              </Row>
            );
          })
        )}
      </Group>
    </>
  );
}

function ModeRow({ label, hint, active, enabled, onPick }: { label: string; hint: string; active: boolean; enabled: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onPick}
      className={cx(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
        enabled ? "hover:bg-hover" : "opacity-50",
        active && "bg-accent-tint",
      )}
      aria-pressed={active}
    >
      <span className="min-w-0 flex-1">
        <span className={cx("block text-[13.5px] font-medium", active ? "text-accent-ink" : "text-ink")}>{label}</span>
        <span className="mt-0.5 block text-[11.5px] text-ink-3">{hint}</span>
      </span>
      {active && <Pill tone="green">{t("settings-network.active")}</Pill>}
    </button>
  );
}
