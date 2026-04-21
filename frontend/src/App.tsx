import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import type { NeedEntity, VolunteerProfile } from './types';
import { GoogleMap, useJsApiLoader, Marker, Circle } from '@react-google-maps/api';
import { formatDistanceToNow } from 'date-fns';
import { BoltIcon, ExclamationTriangleIcon, UserGroupIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'; // Updated heroicons import path

const API_BASE = 'http://localhost:3000';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '0.75rem',
};

const center = {
  lat: 19.0760,
  lng: 72.8777
};

export default function App() {
  const [needs, setNeeds] = useState<NeedEntity[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<NeedEntity | null>(null);
  const [dispatchResult, setDispatchResult] = useState<{ volunteer: VolunteerProfile, dispatchMessage: string } | null>(null);
  const [loadingDispatch, setLoadingDispatch] = useState<boolean>(false);

  // Poll data every 3 seconds to simulate live ingestion feed
  useEffect(() => {
    const fetchNeeds = async () => {
      try {
        const response = await axios.get(`${API_BASE}/needs`);
        setNeeds(response.data);
      } catch (error) {
        console.error("Error fetching needs:", error);
      }
    };
    fetchNeeds();
    const interval = setInterval(fetchNeeds, 3000);
    return () => clearInterval(interval);
  }, []);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    // Mock key or empty for demo purposes (API will load with warning, which is fine for local hackathon demo run without key)
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '' 
  });

  const handleDispatch = async (needId: string) => {
    setLoadingDispatch(true);
    setDispatchResult(null);
    try {
      const response = await axios.post(`${API_BASE}/dispatch`, { needId });
      setDispatchResult(response.data);
    } catch (error: any) {
      alert("Dispatch error: " + (error.response?.data?.error || error.message));
    } finally {
      setLoadingDispatch(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-gray-100 flex flex-col font-sans">
      <header className="bg-[#1e1e1e] p-4 flex items-center justify-between border-b border-gray-800 shadow-lg">
        <div className="flex items-center space-x-3">
          <BoltIcon className="h-8 w-8 text-blue-500" />
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            CommunityPulse
          </h1>
        </div>
        <div className="flex space-x-4 text-sm text-gray-400">
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span> Live Sync Enabled</span>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-6 p-6 h-[calc(100vh-73px)]">
        
        {/* PANEL 1: Live Ingestion Feed */}
        <section className="col-span-3 bg-[#1e1e1e] rounded-xl border border-gray-800 overflow-hidden flex flex-col shadow-xl">
          <div className="p-4 border-b border-gray-800 bg-[#252525]">
            <h2 className="text-lg font-semibold flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 mr-2 text-warning" />
              Live Ingestion Feed
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {needs.length === 0 && <p className="text-gray-500 text-sm">No recent distress signals.</p>}
            {needs.map(need => (
              <div 
                key={need.id} 
                className={`p-4 rounded-lg border transition-all cursor-pointer hover:bg-[#2a2a2a] ${selectedNeed?.id === need.id ? 'border-blue-500 bg-[#252535]' : 'border-gray-700 bg-[#252525]'}`}
                onClick={() => { setSelectedNeed(need); setDispatchResult(null); }}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded uppercase tracking-wider ${need.status === 'CRITICAL_VELOCITY' ? 'bg-red-900/50 text-red-400 border border-red-800/50' : 'bg-blue-900/50 text-blue-400 border border-blue-800/50'}`}>
                    {need.status}
                  </span>
                  <span className="text-xs text-gray-500">{formatDistanceToNow(need.reportedAt)} ago</span>
                </div>
                <h3 className="font-semibold text-gray-200 capitalize">{need.crisisType} Crisis</h3>
                <p className="text-sm text-gray-400 mt-1 line-clamp-2">{need.urgencyReasoning}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span><UserGroupIcon className="h-4 w-4 inline mr-1" /> {need.estimatedScale} approx</span>
                  <span>Reports: {need.reportCount}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PANEL 2: 48h Crisis Map */}
        <section className="col-span-6 bg-[#1e1e1e] rounded-xl border border-gray-800 overflow-hidden shadow-xl flex flex-col pt-1">
          <div className="p-4 absolute z-10 w-full pointer-events-none">
            <div className="inline-block bg-[#121212]/80 backdrop-blur-md px-4 py-2 rounded-full border border-gray-700 pointer-events-auto shadow-lg">
              <h2 className="text-sm font-semibold flex items-center">
                 48h Crisis Trajectory Map
              </h2>
            </div>
          </div>
          <div className="flex-1 relative">
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={center}
                zoom={12}
                options={{ styles: darkMapStyle, disableDefaultUI: true, zoomControl: true }}
              >
                {needs.map(need => {
                  const isCritical = need.status === 'CRITICAL_VELOCITY';
                  return (
                    <Circle
                      key={need.id}
                      center={{ lat: need.location.lat, lng: need.location.lng }}
                      radius={isCritical ? 1500 : 800}
                      options={{
                        fillColor: isCritical ? '#ef4444' : '#f59e0b',
                        fillOpacity: Math.min(0.8, need.criticalityScore / 10),
                        strokeColor: isCritical ? '#ef4444' : '#f59e0b',
                        strokeOpacity: 0.8,
                        strokeWeight: 2,
                      }}
                      onClick={() => setSelectedNeed(need)}
                    />
                  );
                })}
              </GoogleMap>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#151515]">
                Map Loading...
              </div>
            )}
          </div>
        </section>

        {/* PANEL 3: Top 5 Dispatch Queue */}
        <section className="col-span-3 bg-[#1e1e1e] rounded-xl border border-gray-800 overflow-hidden flex flex-col shadow-xl">
          <div className="p-4 border-b border-gray-800 bg-[#252525]">
            <h2 className="text-lg font-semibold flex items-center">
              <PaperAirplaneIcon className="h-5 w-5 mr-2 text-indigo-400" />
              Dispatch Central
            </h2>
          </div>
          <div className="flex-1 p-4 overflow-y-auto w-full">
            {!selectedNeed ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center space-y-3">
                <PaperAirplaneIcon className="h-10 w-10 opacity-20" />
                <p>Select a crisis on the left feed<br/>to initiate AI volunteer dispatch.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-[#121212] p-4 rounded-lg border border-gray-800">
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Selected Need</h3>
                  <p className="text-lg text-white mb-1">{selectedNeed.location.name}</p>
                  <p className="text-sm text-gray-300">Type: <span className="capitalize">{selectedNeed.crisisType}</span></p>
                  <p className="text-sm text-gray-400 mt-2">Score: {selectedNeed.criticalityScore.toFixed(2)}</p>
                </div>

                <button 
                  onClick={() => handleDispatch(selectedNeed.id)}
                  disabled={loadingDispatch}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] flex justify-center items-center"
                >
                  {loadingDispatch ? (
                    <span className="flex items-center"><span className="animate-spin h-5 w-5 border-2 border-white rounded-full border-t-transparent mr-2"></span> Finding Best Match...</span>
                  ) : (
                    'Dispatch Volunteer'
                  )}
                </button>

                {dispatchResult && (
                  <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-[#252525] p-4 rounded-lg border border-green-800/30">
                      <h4 className="text-xs text-uppercase text-gray-400 mb-1 tracking-wider uppercase">Assigned To</h4>
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-green-400">{dispatchResult.volunteer.name}</span>
                        <span className="text-xs bg-[#121212] px-2 py-1 rounded text-gray-400">{dispatchResult.volunteer.reliabilityRate * 100}% Rating</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Hours: {dispatchResult.volunteer.hoursLast30Days}/20</p>
                    </div>

                    <div className="bg-[#121212] p-4 rounded-lg border border-gray-800 relative">
                      <h4 className="text-xs text-gray-500 mb-2 absolute -top-3 left-4 bg-[#121212] px-2">Generated WhatsApp Message</h4>
                      <p className="text-sm text-gray-200 mt-3 whitespace-pre-wrap font-mono relative z-10 leading-relaxed">
                        {dispatchResult.dispatchMessage}
                      </p>
                      <button className="mt-4 text-xs text-indigo-400 hover:text-indigo-300 flex items-center" onClick={() => navigator.clipboard.writeText(dispatchResult.dispatchMessage)}>
                        Copy to Clipboard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// Minimal Dark Map Style
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#181818" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "poi.park", elementType: "labels.text.stroke", stylers: [{ color: "#1b1b1b" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#373737" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#4e4e4e" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] }
];
