import { useMemo } from "react";
import { useAllInstancesUpdateStatus } from "./useUpdater";
import { useAllNitradoUpdateStatus } from "./useMods";
import { useManagerUpdate, useAppInfo } from "./useInfo";

/**
 * Single place to know if anything the app cares about has a pending update.
 * Used for sidebar badge and the Updates tab overview.
 */
export function useAggregatedPendingUpdates() {
  const { data: game } = useAllInstancesUpdateStatus();
  const { data: nitrado } = useAllNitradoUpdateStatus();
  const { data: mgr } = useManagerUpdate();
  const { data: info } = useAppInfo();

  return useMemo(() => {
    const gameInstances = Object.entries(game?.instances ?? {}).filter(
      ([, row]) => row.update_available
    );
    const nitradoInstances = Object.entries(nitrado?.instances ?? {}).filter(
      ([, row]) => row.installed && row.update_available
    );

    const serverGamePending = gameInstances.length > 0;
    const nitradoPending = nitradoInstances.length > 0;
    const managerPending = mgr?.update_available === true;
    const addonPending =
      info?.experimental_addon_update_available === true &&
      info?.experimental_addon_installed === true;

    const flags = [serverGamePending, nitradoPending, managerPending, addonPending];
    const count = flags.filter(Boolean).length;

    return {
      pendingCount: count,
      serverGamePending,
      nitradoPending,
      managerPending,
      addonPending,
      gameInstances,
      nitradoInstances,
    };
  }, [game, nitrado, mgr, info]);
}
