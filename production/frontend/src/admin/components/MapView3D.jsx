import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { Settings2, Layers, Filter, Box, Sun, Moon, X, Info } from "lucide-react";

// Warm gold elevation ramp for the 3D hex columns (low -> high density).
const GOLD_RANGE = [
  [255, 246, 219],
  [250, 224, 150],
  [242, 185, 74],
  [230, 160, 32],
  [201, 134, 26],
  [150, 96, 12],
];

const TAIPEI = [121.5645, 25.0375];

// Judgement palette (shared idea with the dashboard charts), as RGB for deck.
const JUDGEMENTS = [
  { key: "COMPLIANT", label: "符合規定", color: [21, 154, 99] },
  { key: "OVERDUE", label: "開單逾時", color: [230, 160, 32] },
  { key: "DATA_ERROR", label: "資料異常", color: [224, 72, 63] },
  { key: "PARSE_ERROR", label: "格式錯誤", color: [176, 101, 26] },
  { key: "UNKNOWN", label: "未知", color: [185, 179, 168] },
];
const JCOLOR = Object.fromEntries(JUDGEMENTS.map((j) => [j.key, j.color]));
const JLABEL = Object.fromEntries(JUDGEMENTS.map((j) => [j.key, j.label]));

const BASEMAPS = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};

// 3D case-distribution map on a MapLibre base map (CARTO tiles, no API key)
// with a deck.gl overlay. A togglable settings HUD lets admins switch between
// hex-density and per-case scatter views, filter by judgement, and tune the
// aggregation radius / column height / tilt / base map.
export default function MapView3D({ points }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const styledOnce = useRef(false);

  const [tileError, setTileError] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [viz, setViz] = useState("hexagon"); // "hexagon" | "scatter"
  const [radius, setRadius] = useState(90);
  const [elevation, setElevation] = useState(14);
  const [extruded, setExtruded] = useState(true);
  const [basemap, setBasemap] = useState("dark");
  const [enabled, setEnabled] = useState(() => new Set(JUDGEMENTS.map((j) => j.key)));

  const valid = useMemo(
    () => (points || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [points]
  );
  const filtered = useMemo(
    () => valid.filter((p) => enabled.has(p.judgement || "UNKNOWN")),
    [valid, enabled]
  );

  // --- Mount the map exactly once. ---
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const center = valid.length
      ? [
          valid.reduce((s, p) => s + p.lng, 0) / valid.length,
          valid.reduce((s, p) => s + p.lat, 0) / valid.length,
        ]
      : TAIPEI;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAPS.dark,
      center,
      zoom: valid.length ? 12.6 : 11.5,
      pitch: 52,
      bearing: -20,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("error", (e) => {
      // A failed tile fetch (offline / blocked) shouldn't blank the panel.
      if (String(e?.error || "").includes("tile") || e?.sourceId) setTileError(true);
    });

    const overlay = new MapboxOverlay({ layers: [] });
    overlayRef.current = overlay;
    map.addControl(overlay);

    return () => {
      overlay.finalize?.();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // Mount once — data is already present when the component first renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Rebuild the deck layer whenever data or display options change. ---
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const layer =
      viz === "hexagon"
        ? new HexagonLayer({
            id: "cases-hex",
            data: filtered,
            getPosition: (d) => [d.lng, d.lat],
            radius,
            coverage: 0.88,
            elevationScale: extruded ? elevation : 0,
            elevationRange: [0, 900],
            extruded,
            pickable: true,
            colorRange: GOLD_RANGE,
            material: { ambient: 0.6, diffuse: 0.6, shininess: 40, specularColor: [255, 235, 200] },
          })
        : new ScatterplotLayer({
            id: "cases-scatter",
            data: filtered,
            getPosition: (d) => [d.lng, d.lat],
            getFillColor: (d) => JCOLOR[d.judgement] || JCOLOR.UNKNOWN,
            getRadius: 70,
            radiusMinPixels: 5,
            radiusMaxPixels: 26,
            opacity: 0.85,
            stroked: true,
            getLineColor: [255, 255, 255, 130],
            lineWidthMinPixels: 1,
            pickable: true,
          });
    overlay.setProps({
      layers: [layer],
      getTooltip: ({ object }) => {
        if (!object) return null;
        if (viz === "hexagon") return { text: `${object.points.length} 件案件` };
        const j = JLABEL[object.judgement] || "未知";
        return { text: `${j}${object.district ? " · " + object.district : ""}` };
      },
    });
  }, [filtered, viz, radius, elevation, extruded]);

  // --- Ease the camera flat/tilted when the 3D toggle changes. ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: extruded ? 52 : 0, duration: 400 });
  }, [extruded]);

  // --- Swap the base map style (skip the first run: it matches the initial). ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!styledOnce.current) {
      styledOnce.current = true;
      return;
    }
    map.setStyle(BASEMAPS[basemap]);
  }, [basemap]);

  const toggleJudgement = (key) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="map3d-wrap">
      <div ref={containerRef} className="map3d" />

      {/* Settings toggle */}
      <button
        type="button"
        className={`map3d-gear${panelOpen ? " open" : ""}`}
        onClick={() => setPanelOpen((o) => !o)}
        title={panelOpen ? "關閉設定" : "地圖設定"}
        aria-label="地圖設定"
      >
        {panelOpen ? <X size={16} /> : <Settings2 size={16} />}
      </button>

      {/* Operation HUD */}
      {panelOpen && (
        <div className="map3d-hud">
          <div className="hud-head">地圖設定</div>

          <div className="hud-section">
            <div className="hud-label"><Layers size={13} /> 視覺化模式</div>
            <div className="hud-seg">
              <button className={viz === "hexagon" ? "on" : ""} onClick={() => setViz("hexagon")}>
                六角密度
              </button>
              <button className={viz === "scatter" ? "on" : ""} onClick={() => setViz("scatter")}>
                判定散點
              </button>
            </div>
            <p className="hud-hint">
              {viz === "hexagon"
                ? "將鄰近案件聚合成六角網格，柱體越高／越深代表案件越密集。"
                : "每一點為單一案件，顏色代表其判定結果。"}
            </p>
          </div>

          <div className="hud-section">
            <div className="hud-label"><Filter size={13} /> 判定類別</div>
            <div className="hud-checks">
              {JUDGEMENTS.map((j) => (
                <label key={j.key} className="hud-check">
                  <input
                    type="checkbox"
                    checked={enabled.has(j.key)}
                    onChange={() => toggleJudgement(j.key)}
                  />
                  <span className="hud-dot" style={{ background: `rgb(${j.color.join(",")})` }} />
                  {j.label}
                </label>
              ))}
            </div>
          </div>

          {viz === "hexagon" && (
            <>
              <div className="hud-section">
                <label className="hud-switch">
                  <span className="hud-label"><Box size={13} /> 立體柱體</span>
                  <input type="checkbox" checked={extruded} onChange={(e) => setExtruded(e.target.checked)} />
                </label>
              </div>
              <div className="hud-section">
                <div className="hud-label">聚合半徑 <b>{radius} m</b></div>
                <input type="range" min="40" max="220" step="10" value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))} />
              </div>
              {extruded && (
                <div className="hud-section">
                  <div className="hud-label">柱體高度 <b>×{elevation}</b></div>
                  <input type="range" min="2" max="40" step="2" value={elevation}
                    onChange={(e) => setElevation(Number(e.target.value))} />
                </div>
              )}
            </>
          )}

          <div className="hud-section">
            <div className="hud-label">底圖樣式</div>
            <div className="hud-seg">
              <button className={basemap === "dark" ? "on" : ""} onClick={() => setBasemap("dark")}>
                <Moon size={12} /> 深色
              </button>
              <button className={basemap === "light" ? "on" : ""} onClick={() => setBasemap("light")}>
                <Sun size={12} /> 淺色
              </button>
            </div>
          </div>

          <div className="hud-foot">
            <Info size={12} /> 顯示 {filtered.length} / {valid.length} 筆定位案件
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="map3d-legend">
        {viz === "hexagon" ? (
          <>
            <span className="mll-title">案件密度</span>
            <span className="mll-end">低</span>
            <span className="mll-ramp" />
            <span className="mll-end">高</span>
          </>
        ) : (
          JUDGEMENTS.filter((j) => enabled.has(j.key)).map((j) => (
            <span key={j.key} className="mll-item">
              <span className="hud-dot" style={{ background: `rgb(${j.color.join(",")})` }} />
              {j.label}
            </span>
          ))
        )}
      </div>

      {tileError && (
        <div className="map3d-note">底圖磚無法載入（離線或被封鎖），資料層仍會顯示。</div>
      )}
    </div>
  );
}
