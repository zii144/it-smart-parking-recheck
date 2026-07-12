import { useEffect, useMemo, useState } from "react";
import { MapPin, Navigation, ArrowRight, ArrowLeft } from "lucide-react";
import { api } from "../api";
import Spinner from "./Spinner";
import SearchableSelect from "./SearchableSelect";

export default function LocationSelect({ onSelected, onBack, initialDistrict = null, initialRoad = null, initialSpot = null }) {
  const [districts, setDistricts] = useState([]);
  // Track selections by name (not array index) so they stay valid as the
  // seeded location data grows or is reordered. Seed from any already-picked
  // values on the draft so jumping back to 地點 keeps the selection.
  const [districtName, setDistrictName] = useState(initialDistrict ?? "");
  const [roadName, setRoadName] = useState(initialRoad ?? "");
  const [spot, setSpot] = useState(initialSpot ?? "");
  const [gps, setGps] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLocations().then((res) => {
      setDistricts(res.districts);
      // Only fall back to the first options when nothing was pre-selected.
      if (!initialDistrict) {
        const d0 = res.districts[0];
        const r0 = d0?.roads[0];
        setDistrictName(d0?.district ?? "");
        setRoadName(r0?.road ?? "");
        setSpot(r0?.spots[0] ?? "");
      }
      setLoading(false);
    });

    // Real device GPS as auxiliary positioning. It's non-blocking and the
    // whole flow works without it, so if permission is denied or geolocation
    // isn't available (e.g. served over plain http on a LAN IP), fall back to
    // demo coordinates rather than stalling the inspector.
    const demoCoords = () => ({
      lat: 25.033 + Math.random() * 0.01,
      lng: 121.565 + Math.random() * 0.01,
      source: "demo",
    });
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: "device" }),
        () => setGps(demoCoords()),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    } else {
      setGps(demoCoords());
    }
    // Mount-once: initialDistrict is only the seed value for the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const district = useMemo(
    () => districts.find((d) => d.district === districtName),
    [districts, districtName]
  );
  const roads = district?.roads ?? [];
  const road = roads.find((r) => r.road === roadName);
  const spots = road?.spots ?? [];

  function changeDistrict(name) {
    setDistrictName(name);
    const d = districts.find((x) => x.district === name);
    const r0 = d?.roads[0];
    setRoadName(r0?.road ?? "");
    setSpot(r0?.spots[0] ?? "");
  }

  if (loading) {
    return (
      <div className="card">
        <Spinner label="載入行政區資料中…" />
      </div>
    );
  }

  const ready = districtName && roadName && spot;

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <MapPin size={18} />
        </span>
        <h2>選擇稽查地點</h2>
      </div>

      <SearchableSelect
        label="行政區"
        value={districtName}
        onChange={changeDistrict}
        options={districts.map((d) => d.district)}
        searchPlaceholder="搜尋行政區…"
      />
      <div className="field">
        <span className="field-label">路段</span>
        <input
          list="road-suggestions"
          value={roadName}
          onChange={(e) => setRoadName(e.target.value)}
          placeholder="輸入路段名稱"
        />
        {roads.length > 0 && (
          <datalist id="road-suggestions">
            {roads.map((r) => (
              <option key={r.road} value={r.road} />
            ))}
          </datalist>
        )}
      </div>
      <div className="field">
        <span className="field-label">停車格</span>
        <input
          list="spot-suggestions"
          value={spot}
          onChange={(e) => setSpot(e.target.value)}
          placeholder="輸入停車格編號"
        />
        {spots.length > 0 && (
          <datalist id="spot-suggestions">
            {spots.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>

      {gps && (
        <p className="muted small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Navigation size={13} /> GPS 輔助定位：{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
          {gps.source === "demo" ? "（示範座標）" : ""}
        </p>
      )}
      <div className="button-row">
        {onBack && (
          <button className="btn-secondary" onClick={onBack}>
            <ArrowLeft size={15} /> 返回
          </button>
        )}
        <button
          className="btn-primary"
          disabled={!ready}
          onClick={() =>
            onSelected({
              district: districtName,
              road: roadName,
              spot_no: spot,
              gps_lat: gps ? gps.lat : null,
              gps_lng: gps ? gps.lng : null,
            })
          }
        >
          下一步：確認資料 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
