import { useEffect, useState } from "react";
import { MapPin, Navigation, ArrowRight } from "lucide-react";
import { api } from "../api";
import Spinner from "./Spinner";

export default function LocationSelect({ onSelected }) {
  const [districts, setDistricts] = useState([]);
  const [districtIdx, setDistrictIdx] = useState(0);
  const [roadIdx, setRoadIdx] = useState(0);
  const [spot, setSpot] = useState("");
  const [gps, setGps] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLocations().then((res) => {
      setDistricts(res.districts);
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
  }, []);

  if (loading) {
    return (
      <div className="card">
        <Spinner label="載入行政區資料中…" />
      </div>
    );
  }

  const district = districts[districtIdx];
  const road = district.roads[roadIdx];
  const spots = road.spots;
  const currentSpot = spot || spots[0];

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <MapPin size={18} />
        </span>
        <h2>選擇稽查地點</h2>
      </div>
      <label>
        行政區
        <select
          value={districtIdx}
          onChange={(e) => {
            setDistrictIdx(Number(e.target.value));
            setRoadIdx(0);
            setSpot("");
          }}
        >
          {districts.map((d, i) => (
            <option key={d.district} value={i}>
              {d.district}
            </option>
          ))}
        </select>
      </label>
      <label>
        路段
        <select
          value={roadIdx}
          onChange={(e) => {
            setRoadIdx(Number(e.target.value));
            setSpot("");
          }}
        >
          {district.roads.map((r, i) => (
            <option key={r.road} value={i}>
              {r.road}
            </option>
          ))}
        </select>
      </label>
      <label>
        停車格
        <select value={currentSpot} onChange={(e) => setSpot(e.target.value)}>
          {spots.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {gps && (
        <p className="muted small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Navigation size={13} /> GPS 輔助定位：{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
          {gps.source === "demo" ? "（示範座標）" : ""}
        </p>
      )}
      <div className="button-row">
        <button
          className="btn-primary"
          onClick={() =>
            onSelected({
              district: district.district,
              road: road.road,
              spot_no: currentSpot,
              gps_lat: gps ? gps.lat : null,
              gps_lng: gps ? gps.lng : null,
            })
          }
        >
          下一步：掃描停車單 <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
