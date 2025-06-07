import { useState, useEffect } from "react";
import { fixLeafletIcon, fuelIcon, restIcon, vehicleIcon } from "../components/fixLeafletIcon.ts";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./trips.css";

const TripForm = () => {
  const [formData, setFormData] = useState({
    current_location: "",
    pickup_location: "",
    dropoff_location: "",
    cycle_hours_used: "",
  });
  const [route, setRoute] = useState([]);
  const [eldLogs, setEldLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fuelStops, setFuelStops] = useState([]);
  const [restIndices, setRestIndices] = useState([]);
  const [currentMarker, setCurrentMarker] = useState(null);
  const [truncatedRoute, setTruncatedRoute] = useState([]);

  useEffect(() => {
    fixLeafletIcon();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === "cycle_hours_used" ? parseFloat(value) : value,
    });
  };

  const geocode = async (place) => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      place
    )}&format=json&limit=1`;
    const response = await axios.get(url);
    if (response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lon: parseFloat(response.data[0].lon),
      };
    } else {
      throw new Error(`Geocoding failed for: ${place}`);
    }
  };

  const fetchRoute = async () => {
    try {
      const pickupCoords = await geocode(formData.pickup_location);
      const dropoffCoords = await geocode(formData.dropoff_location);
      const currentCoords = await geocode(formData.current_location);

      const routeUrl = `https://router.project-osrm.org/route/v1/driving/${pickupCoords.lon},${pickupCoords.lat};${dropoffCoords.lon},${dropoffCoords.lat}?overview=full&geometries=geojson`;
      const response = await axios.get(routeUrl);

      const fullCoordinates = response.data.routes[0].geometry.coordinates.map(
        (coord) => [coord[1], coord[0]]
      );

      setRoute(fullCoordinates);

      // Find closest point to current location
      const closestIndex = fullCoordinates.reduce((closestIdx, coord, idx) => {
        const dist = (a, b) =>
          Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
        return dist(coord, [currentCoords.lat, currentCoords.lon]) <
          dist(fullCoordinates[closestIdx], [currentCoords.lat, currentCoords.lon])
          ? idx
          : closestIdx;
      }, 0);

      const slicedRoute = fullCoordinates.slice(0, closestIndex + 1);
      const slicedDistanceKm =
        (response.data.routes[0].distance / 1000) * (slicedRoute.length / fullCoordinates.length);

      generateFuelStops(slicedRoute, slicedDistanceKm);
      generateEldLogs(slicedRoute.length);
      setTruncatedRoute(slicedRoute);
      setCurrentMarker([currentCoords.lat, currentCoords.lon]);
    } catch (error) {
      setError("Error fetching route. Please check location names and try again.");
    }
  };

  const generateFuelStops = (coordinates, distanceKm) => {
    const fuelStops = [];
    const interval = 1600; // 1000 miles in km
    const numStops = Math.floor(distanceKm / interval);
    const segmentLength = Math.floor(coordinates.length / (numStops + 1));
    for (let i = 1; i <= numStops; i++) {
      fuelStops.push(coordinates[i * segmentLength]);
    }
    setFuelStops(fuelStops);
  };

  const generateEldLogs = (routeLength) => {
    const logs = [];
    const totalHours = parseFloat(formData.cycle_hours_used);
    if (isNaN(totalHours) || totalHours <= 0) return;

    // Initialize all as Driving
    for (let i = 0; i < totalHours; i++) {
      logs.push({ hour: i + 1, status: "Driving" });
    }

    // First hour = Pickup
    if (logs.length > 0) logs[0].status = "Pickup";

    const isAtDropoff =
      formData.current_location.trim().toLowerCase() ===
      formData.dropoff_location.trim().toLowerCase();

    // Last hour = Dropoff
    if (logs.length > 1 && isAtDropoff) {
      logs[logs.length - 1].status = "Dropoff";
    }

    const maxHoursPerDay = 9;
    // For each day (max 9 hours), set middle hour as Resting
    for (let d = 0; d < logs.length; d += maxHoursPerDay) {
      const end = Math.min(d + maxHoursPerDay, logs.length);
      const restIndex = d + Math.floor((end - d - 1) / 2);
      if (logs[restIndex].status === "Driving") {
        logs[restIndex].status = "Resting";
      }
    }

    // Split into daily logs (max 9 hours per day)
    const dailyLogs = [];
    for (let d = 0; d < logs.length; d += maxHoursPerDay) {
      dailyLogs.push(logs.slice(d, d + maxHoursPerDay));
    }
    setEldLogs(dailyLogs);

    const restIndices = logs
    .map((log, i) => (log.status === "Resting" ? i : -1))
    .filter(i => i !== -1 && i < routeLength);  // only up to current
    setRestIndices(restIndices);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setRoute([]);
    setFuelStops([]);
    setEldLogs([]);
    setRestIndices([]);
    setCurrentMarker(null);

    try {
      const response = await axios.post(
        "https://trip-planner-backend-8v2e.onrender.com/api/trips/",
        formData
      );
      console.log("Trip created:", response.data);
      await fetchRoute();
    } catch (error) {
      setError("Failed to create trip. Please try again.");
      console.error("Error creating trip:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="trip-form-container">
      <h2>Create a Trip</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit} className="trip-form">
        <input name="current_location" placeholder="Current Location" onChange={handleChange} required />
        <input name="pickup_location" placeholder="Pickup Location" onChange={handleChange} required />
        <input name="dropoff_location" placeholder="Dropoff Location" onChange={handleChange} required />
        <input
          name="cycle_hours_used"
          type="number"
          placeholder="Current Cycle Used (Hrs)"
          onChange={handleChange}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : "Submit"}
        </button>
      </form>

      <div className="map-section">
        <h3>Route Map</h3>
        <MapContainer center={route.length ? route[0] : [37.78, -122.42]} zoom={6} style={{ height: "400px", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {route.length > 0 && (
            <>
              <Polyline positions={route} color="blue" />
              <Marker position={route[0]}>
                <Popup>Pickup Location</Popup>
              </Marker>
              <Marker position={route[route.length - 1]}>
                <Popup>Dropoff Location</Popup>
              </Marker>
              {currentMarker && (
                <Marker position={currentMarker} icon={vehicleIcon}>
                  <Popup>Current Location</Popup>
                </Marker>
              )}
              {fuelStops.map((stop, idx) => (
                <Marker key={idx} position={stop} icon={fuelIcon}>
                  <Popup>Fuel Stop {idx + 1}</Popup>
                </Marker>
              ))}
              {restIndices.map((index, idx) => {
              const posIndex = Math.floor((index / parseFloat(formData.cycle_hours_used)) * truncatedRoute.length);
              const position = truncatedRoute[posIndex];
              return (
                <Marker key={`rest-${idx}`} position={position} icon={restIcon}>
                  <Popup>Rest Stop (Hour {index + 1})</Popup>
                </Marker>
              );
              })}
            </>
          )}
        </MapContainer>
      </div>

      <div className="log-section">
        <h3>ELD Log Sheets</h3>
        {eldLogs.map((dayLogs, dayIndex) => (
          <div key={dayIndex} className="log-sheet">
            <h4>Day {dayIndex + 1}</h4>
            <table>
              <thead>
                <tr>
                  <th>Hour</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dayLogs.map((log) => (
                  <tr
                    key={log.hour}
                    className={
                      log.status === "Driving"
                        ? "driving"
                        : log.status === "Resting"
                        ? "resting"
                        : "pickup-dropoff"
                    }
                  >
                    <td>{log.hour}</td>
                    <td>{log.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TripForm;
