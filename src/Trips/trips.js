import React, { useState } from "react";
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
  const [fuelStops, setFuelStops] = useState([]);
  const [restStops, setRestStops] = useState([]);
  const [eldLogs, setEldLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tripDistance, setTripDistance] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post("https://trip-planner-backend-8v2e.onrender.com/api/trips/", formData);
      console.log("Trip created:", response.data);
      await fetchRoute();
    } catch (error) {
      setError("Failed to create trip. Please try again.");
      console.error("Error creating trip:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoute = async () => {
    try {
      const response = await axios.get("https://router.project-osrm.org/route/v1/driving/-122.42,37.78;-77.03,38.91?overview=full&geometries=geojson");
      const coordinates = response.data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const distanceKm = response.data.routes[0].distance / 1000;
      setRoute(coordinates);
      setTripDistance(distanceKm);
      generateEldLogs(distanceKm);
      calculateStops(coordinates, distanceKm);
    } catch (error) {
      setError("Error fetching route. Please check your network.");
      console.error("Error fetching route:", error);
    }
  };

  const generateEldLogs = (distanceKm) => {
    const logs = [];
    const totalHours = distanceKm / 80; // average 80 km/h driving speed
    const pickupDropoffTime = 2; // 1 hour for pickup, 1 hour for dropoff
    let usedHours = pickupDropoffTime;
    let cycleHoursUsed = parseFloat(formData.cycle_hours_used);
    let dailyHours = 0;
    let day = 1;

    logs.push({ day, hour: 0, status: "Pickup" });
    logs.push({ day, hour: 1, status: "Dropoff" });
    dailyHours = 2;

    let i = 2;
    let driving = true;
    while (usedHours < totalHours + pickupDropoffTime && cycleHoursUsed < 70) {
      logs.push({ day, hour: i % 24, status: driving ? "Driving" : "Resting" });
      usedHours += 1;
      cycleHoursUsed += 1;
      dailyHours += 1;
      i++;

      if (i % 24 === 0) {
        day += 1;
        dailyHours = 0;
      }
    }

    setEldLogs(logs);
  };

  const calculateStops = (coordinates, distanceKm) => {
    const fuelInterval = 1600; // km
    const restInterval = 640; // km (8 hrs driving)
    const totalCoords = coordinates.length;
    const fuelStops = [];
    const restStops = [];

    for (let i = 1; i * fuelInterval < distanceKm; i++) {
      const index = Math.floor((i * fuelInterval / distanceKm) * totalCoords);
      if (coordinates[index]) fuelStops.push(coordinates[index]);
    }

    for (let j = 1; j * restInterval < distanceKm; j++) {
      const index = Math.floor((j * restInterval / distanceKm) * totalCoords);
      if (coordinates[index]) restStops.push(coordinates[index]);
    }

    setFuelStops(fuelStops);
    setRestStops(restStops);
  };

  const groupedLogs = eldLogs.reduce((acc, log) => {
    if (!acc[log.day]) acc[log.day] = [];
    acc[log.day].push(log);
    return acc;
  }, {});

  return (
    <div className="trip-form-container">
      <h2 className="form-title">Create a Trip</h2>
      {error && <p className="form-error">{error}</p>}
      <form onSubmit={handleSubmit} className="trip-form">
        <input name="current_location" placeholder="Current Location" onChange={handleChange} className="trip-input" required />
        <input name="pickup_location" placeholder="Pickup Location" onChange={handleChange} className="trip-input" required />
        <input name="dropoff_location" placeholder="Dropoff Location" onChange={handleChange} className="trip-input" required />
        <input name="cycle_hours_used" type="number" placeholder="Current Cycle Used (Hrs)" onChange={handleChange} className="trip-input" required />
        <button type="submit" className="trip-button" disabled={loading}>
          {loading ? "Processing..." : "Submit"}
        </button>
      </form>

      <div className="map-section">
        <h3 className="section-title">Route Map</h3>
        <MapContainer center={[37.78, -122.42]} zoom={5} className="map-container">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {route.length > 0 && (
            <>
              <Marker position={route[0]}>
                <Popup>Start</Popup>
              </Marker>
              <Marker position={route[route.length - 1]}>
                <Popup>End</Popup>
              </Marker>
              <Polyline positions={route} color="blue" weight={5} />
              {fuelStops.map((coord, idx) => (
                <Marker key={`fuel-${idx}`} position={coord}>
                  <Popup>Fuel Stop</Popup>
                </Marker>
              ))}
              {restStops.map((coord, idx) => (
                <Marker key={`rest-${idx}`} position={coord}>
                  <Popup>Rest Stop</Popup>
                </Marker>
              ))}
            </>
          )}
        </MapContainer>
      </div>

      <div className="log-section">
        <h3 className="section-title">ELD Log Sheets (Daily)</h3>
        {Object.entries(groupedLogs).map(([day, logs]) => (
          <div key={day} className="daily-log">
            <h4>Day {day}</h4>
            <div className="log-table-wrapper">
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Hour</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, index) => (
                    <tr key={index} className={log.status === "Driving" ? "driving-row" : log.status === "Resting" ? "resting-row" : "pickup-dropoff-row"}>
                      <td>{log.hour}</td>
                      <td>{log.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TripForm;



