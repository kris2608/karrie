import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearListHash, decodeSharedList, payloadFromHash, type SharedListV1 } from "../../domain/shareList";
import { trackEvent } from "../../services/analytics";
import { useAdventure } from "../../state/AdventureContext";
import { ImportSharedListErrorSheet, ImportSharedListSheet } from "./ImportSharedListSheet";

type BootState =
  | { status: "idle" }
  | { status: "preview"; list: SharedListV1; entry: "link" | "unknown" }
  | { status: "error" };

/** After hydrate: detect `#list=`, preview, then import without silently overwriting an open adventure. */
export function SharedListBoot() {
  const { adventure, dispatch } = useAdventure();
  const navigate = useNavigate();
  const handled = useRef(false);
  const [boot, setBoot] = useState<BootState>({ status: "idle" });

  useEffect(() => {
    if (handled.current) return;
    const payload = payloadFromHash(window.location.hash);
    if (!payload) return;
    handled.current = true;
    const entry: "link" | "unknown" = window.location.hash.includes("list=") ? "link" : "unknown";
    void decodeSharedList(payload).then((result) => {
      if (!result.ok) {
        setBoot({ status: "error" });
        return;
      }
      setBoot({ status: "preview", list: result.list, entry });
    });
  }, []);

  function dismiss() {
    clearListHash();
    setBoot({ status: "idle" });
  }

  function importList(mode: "open" | "save-only") {
    if (boot.status !== "preview") return;
    const { list, entry } = boot;
    dispatch({ type: "import-shared-list", list, mode });
    trackEvent({ name: "shared_list_imported", data: { item_count: list.items.length, entry } });
    clearListHash();
    setBoot({ status: "idle" });
    if (mode === "open") navigate("/controleren");
  }

  return (
    <>
      <ImportSharedListSheet
        list={boot.status === "preview" ? boot.list : null}
        adventure={adventure}
        onClose={dismiss}
        onImport={importList}
      />
      <ImportSharedListErrorSheet open={boot.status === "error"} onClose={dismiss} />
    </>
  );
}
