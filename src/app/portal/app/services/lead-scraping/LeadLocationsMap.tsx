"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useRef, useState } from "react";

import { portalGlassSectionClass } from "@/components/portalGlass";

type LeadMapPoint = {
  id: string;
  businessName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  tagColor?: string | null;
};

function isFiniteCoordinate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export default function LeadLocationsMap({
  points,
  selectedLeadId,
  onSelectLead,
}: {
  points: LeadMapPoint[];
  selectedLeadId: string | null;
  onSelectLead?: (leadId: string) => void;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const lastBoundsKeyRef = useRef<string | null>(null);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [mapReadyTick, setMapReadyTick] = useState(0);

  const validPoints = useMemo(
    () =>
      points
        .filter((point) => isFiniteCoordinate(point.latitude) && isFiniteCoordinate(point.longitude))
        .map((point) => ({
          ...point,
          latitude: point.latitude as number,
          longitude: point.longitude as number,
        })),
    [points],
  );
  const selectedPoint = useMemo(() => validPoints.find((point) => point.id === selectedLeadId) ?? null, [selectedLeadId, validPoints]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const findThemeRoot = () =>
      (document.querySelector("[data-portal-theme]") as HTMLElement | null) ||
      document.documentElement ||
      document.body;

    const root = findThemeRoot();
    if (!root) return;

    const syncTheme = () => setThemeMode(root.getAttribute("data-portal-theme") === "dark" ? "dark" : "light");
    syncTheme();

    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(syncTheme);
    observer?.observe(root, { attributes: true, attributeFilter: ["data-portal-theme"] });
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;

    (async () => {
      if (!mapElementRef.current || mapRef.current) return;
      const leaflet = await import("leaflet");
      if (disposed || !mapElementRef.current) return;

      leafletRef.current = leaflet;

      const map = leaflet.map(mapElementRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
      });
      leaflet.control.zoom({ position: "topright" }).addTo(map);
      markersLayerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      map.setView([39.8283, -98.5795], 4);
      setMapReadyTick((value) => value + 1);
    })();

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersLayerRef.current = null;
      leafletRef.current = null;
      lastBoundsKeyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const isDark = themeMode === "dark";
    tileLayerRef.current = leaflet.tileLayer(
      isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        subdomains: isDark ? "abcd" : undefined,
      },
    );
    tileLayerRef.current.addTo(map);
  }, [mapReadyTick, themeMode]);

  useEffect(() => {
    const map = mapRef.current;
    const element = mapElementRef.current;
    if (!map || !element) return;

    const invalidate = () => {
      window.requestAnimationFrame(() => {
        try {
          map.invalidateSize(false);
        } catch {
          // ignore
        }
      });
    };

    invalidate();
    const timeout = window.setTimeout(invalidate, 120);
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => invalidate()) : null;
    resizeObserver?.observe(element);
    window.addEventListener("resize", invalidate);

    return () => {
      window.clearTimeout(timeout);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", invalidate);
    };
  }, [validPoints.length, selectedLeadId]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!leaflet || !map || !markersLayer) return;

    markersLayer.clearLayers();

    for (const point of validPoints) {
      const selected = selectedLeadId === point.id;
      const color = String(point.tagColor || "").trim() || (selected ? "#1d4ed8" : "#0f172a");
      const marker = leaflet.circleMarker([point.latitude, point.longitude], {
        radius: selected ? 11 : 8,
        weight: selected ? 4 : 2,
        color: selected ? "#ffffff" : color,
        fillColor: color,
        fillOpacity: selected ? 0.95 : 0.78,
        opacity: 1,
      });

      marker.bindTooltip(
        `<div class="space-y-0.5"><div class="font-semibold">${String(point.businessName || "")}</div><div class="text-[11px] text-zinc-500">${String(point.address || "Location on map")}</div></div>`,
        {
          className: "pa-lead-map-tooltip",
          direction: "top",
          offset: [0, -8],
          opacity: 0.95,
        },
      );
      marker.on("click", () => onSelectLead?.(point.id));
      marker.addTo(markersLayer);
    }

    if (!validPoints.length) {
      lastBoundsKeyRef.current = null;
      map.setView([39.8283, -98.5795], 4);
      return;
    }

    if (selectedPoint) {
      map.flyTo([selectedPoint.latitude, selectedPoint.longitude], Math.max(map.getZoom() || 4, 14), {
        animate: true,
        duration: 0.45,
      });
      return;
    }

    const boundsKey = validPoints
      .map((point) => `${point.id}:${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}`)
      .join("|");
    if (boundsKey === lastBoundsKeyRef.current) return;
    lastBoundsKeyRef.current = boundsKey;

    const bounds = leaflet.latLngBounds(validPoints.map((point) => [point.latitude, point.longitude]));
    map.fitBounds(bounds.pad(0.14), { animate: false, maxZoom: 13 });
  }, [onSelectLead, selectedLeadId, selectedPoint, validPoints]);

  if (!validPoints.length) {
    return (
      <div className="flex h-full min-h-[50svh] items-center justify-center bg-zinc-50 text-center text-sm text-zinc-500">
        <div className="max-w-sm px-6">
          <div className="font-semibold text-zinc-700">No mappable leads yet</div>
          <div className="mt-2">Run a pull or refine your search to load leads with saved locations.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pa-lead-map relative h-full min-h-[50svh] overflow-hidden bg-white">
      <div className="pa-lead-map-top-fade pointer-events-none absolute inset-x-0 top-0 z-40 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0))]" />
      <div className="pa-lead-map-left-divider pointer-events-none absolute inset-y-0 left-0 z-30 w-px bg-zinc-200/90" />

      <div className={`pa-lead-map-summary pointer-events-none absolute left-4 top-4 z-1200 rounded-[1.35rem] border border-white/60 px-3.5 py-2.5 text-xs font-semibold text-zinc-700 ${portalGlassSectionClass}`}>
        <div>{validPoints.length} mapped lead{validPoints.length === 1 ? "" : "s"}</div>
        <div className="mt-1 text-[11px] font-medium text-zinc-500">Click a lead or marker to focus it.</div>
      </div>

      <div ref={mapElementRef} className="h-full w-full" />
    </div>
  );
}
