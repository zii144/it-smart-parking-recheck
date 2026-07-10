import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HexagonLayer } from "@deck.gl/aggregation-layers";

// Warm gold elevation ramp for the 3D hex columns.
const GOLD_RANGE = [
  [255, 246, 219],
  [250, 224, 150],
  [242, 185, 74],
  [230, 160, 32],
  [201, 134, 26],
  [150, 96, 12],
];

const TAIPEI = [121.5645, 25.0375];

// 3D hex-bin map of case GPS points on a MapLibre base map (CARTO dark tiles).
// Column height + colour encode case density per hexagon.
export default function MapView3D({ points }) {
  const containerRef = useRef(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const valid = (points || []).filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    );
    const center = valid.length
      ? [
          valid.reduce((s, p) => s + p.lng, 0) / valid.length,
          valid.reduce((s, p) => s + p.lat, 0) / valid.length,
        ]
      : TAIPEI;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center,
      zoom: valid.length ? 12.6 : 11.5,
      pitch: 52,
      bearing: -20,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("error", (e) => {
      // A failed tile fetch (offline / blocked) shouldn't blank the panel.
      if (String(e?.error || "").includes("tile") || e?.sourceId) setTileError(true);
    });

    const overlay = new MapboxOverlay({
      layers: [
        new HexagonLayer({
          id: "cases-hex",
          data: valid,
          getPosition: (d) => [d.lng, d.lat],
          radius: 90,
          coverage: 0.88,
          elevationScale: 14,
          elevationRange: [0, 900],
          extruded: true,
          pickable: true,
          colorRange: GOLD_RANGE,
          material: { ambient: 0.6, diffuse: 0.6, shininess: 40, specularColor: [255, 235, 200] },
        }),
      ],
      getTooltip: ({ object }) =>
        object && { text: `${object.points.length} 件` },
    });
    map.addControl(overlay);

    return () => {
      overlay.finalize?.();
      map.remove();
    };
  }, [points]);

  return (
    <div className="map3d-wrap">
      <div ref={containerRef} className="map3d" />
      {tileError && (
        <div className="map3d-note">底圖磚無法載入（離線或被封鎖），3D 資料層仍會顯示。</div>
      )}
    </div>
  );
}
