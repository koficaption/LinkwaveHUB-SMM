import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { persistPanelSlug } from "@/utils/panel";

export function StoreCapture() {
  const location = useLocation();
  const { slug } = useParams();
  const fromQuery = new URLSearchParams(location.search).get("store")
    || new URLSearchParams(location.search).get("storeSlug")
    || "";
  const fromPath = location.pathname.match(/^\/store\/([a-z0-9-]{2,80})/i)?.[1] || "";
  const value = slug || fromPath || fromQuery;

  useEffect(() => {
    if (value) persistPanelSlug(value);
  }, [value]);

  return null;
}
