import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { shareIdFromPath, type SharedListV1 } from "../../domain/shareList";
import { trackEvent } from "../../services/analytics";
import { shareListClient } from "../../services/shareList/client";
import { useAdventure } from "../../state/AdventureContext";
import { ImportSharedListErrorSheet, ImportSharedListSheet } from "./ImportSharedListSheet";

type BootState =
  | { status: "idle" }
  | { status: "preview"; list: SharedListV1 }
  | { status: "expired" }
  | { status: "error" };

/** After hydrate: detect `/l/{id}`, preview, then import without silently overwriting an open adventure. */
export function SharedListBoot() {
  const { adventure, dispatch } = useAdventure();
  const navigate = useNavigate();
  const location = useLocation();
  const handled = useRef<string | null>(null);
  const [boot, setBoot] = useState<BootState>({ status: "idle" });

  useEffect(() => {
    const id = shareIdFromPath(location.pathname);
    if (!id) return;
    if (handled.current === id) return;
    handled.current = id;
    void shareListClient.fetch(id).then((result) => {
      if (result.status === "ok") {
        setBoot({ status: "preview", list: result.list });
        return;
      }
      if (result.code === "expired") {
        setBoot({ status: "expired" });
        return;
      }
      setBoot({ status: "error" });
    });
  }, [location.pathname]);

  function dismiss() {
    setBoot({ status: "idle" });
    if (shareIdFromPath(location.pathname)) navigate("/", { replace: true });
  }

  function importList(mode: "open" | "save-only") {
    if (boot.status !== "preview") return;
    const { list } = boot;
    dispatch({ type: "import-shared-list", list, mode });
    trackEvent({ name: "shared_list_imported", data: { item_count: list.items.length, entry: "link" } });
    setBoot({ status: "idle" });
    navigate(mode === "open" ? "/controleren" : "/", { replace: true });
  }

  return (
    <>
      <ImportSharedListSheet
        list={boot.status === "preview" ? boot.list : null}
        adventure={adventure}
        onClose={dismiss}
        onImport={importList}
      />
      <ImportSharedListErrorSheet
        open={boot.status === "error" || boot.status === "expired"}
        expired={boot.status === "expired"}
        onClose={dismiss}
      />
    </>
  );
}
