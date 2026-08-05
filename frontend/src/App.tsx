import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Activity, CheckCircle, Zap, Server, Sparkles, ActivitySquare, AlertOctagon, Waypoints, Info } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Configure the Base URL for production vs local
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Auto-zooming Map Component
function MapController({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

export interface Ticket {
  ticketId: string;
  dtId: string;
  affectedSpanStart: string;
  affectedSpanEnd: string;
  status: string;
  confidence: string;
  createdAt: string;
  resolvedAt?: string;
  downstreamCount?: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
}

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'open' | 'closed'>('open');

  // Default Bangalore view
  const [mapCenter, setMapCenter] = useState<[number, number]>([12.9716, 77.5946]);
  const [mapZoom, setMapZoom] = useState(13);

  const [logs, setLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ticketsRes, statsRes, logsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/tickets`),
          fetch(`${API_BASE_URL}/api/stats`),
          fetch(`${API_BASE_URL}/api/logs`)
        ]);
        if (ticketsRes.ok) setTickets(await ticketsRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
        if (logsRes.ok) setLogs(await logsRes.json()); 
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setAiBrief(null);
    const midLat = (ticket.startLat + ticket.endLat) / 2;
    const midLon = (ticket.startLon + ticket.endLon) / 2;
    setMapCenter([midLat, midLon]);
    setMapZoom(18); 
  };

  const generateBrief = async (ticket: Ticket) => {
    setIsGenerating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spanStart: ticket.affectedSpanStart,
          spanEnd: ticket.affectedSpanEnd,
          pinCode: '560078',
          confidence: ticket.confidence
        })
      });
      if (response.ok) {
        const data = await response.json();
        setAiBrief(data.brief);
      }
    } catch (error) {
      setAiBrief("Error connecting to AI service.");
    } finally {
      setIsGenerating(false);
    }
  };

  const triggerSimulation = async (command: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      if (!response.ok) throw new Error("Simulation failed");
    } catch (error) {
      console.error("Error triggering simulator:", error);
    }
  };

  const forceAnalyzerSweep = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analyzer/run`, { method: 'POST' });
      if (!response.ok) throw new Error("Analyzer sweep failed");
    } catch (error) {
      console.error("Error triggering analyzer:", error);
    }
  };

  const openTickets = tickets.filter(t => t.status === 'open');
  const closedTickets = tickets.filter(t => t.status === 'closed');
  const displayedTickets = activeTab === 'open' ? openTickets : closedTickets;

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 font-sans overflow-hidden">
      
      {/* HEADER */}
      <header className="bg-slate-900 text-white p-3 flex justify-between items-center z-30 border-b border-slate-700 shadow-lg">
        <div className="flex items-center gap-3 px-2">
          <Activity className="text-cyan-400" size={22} />
          <h1 className="text-lg font-bold tracking-wide">KSPDB Operations</h1>
        </div>
        {/* CLICKABLE TELEMETRY BUTTON */}
        <button 
          onClick={() => setShowLogs(true)}
          className="flex items-center gap-4 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all px-4 py-1.5 rounded-full border border-slate-600 cursor-pointer shadow-sm hover:shadow"
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Live Telemetry Link Active
        </button>
      </header>

      {/* SIMULATOR CONTROL PANEL */}
      <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between z-20 border-b border-slate-700">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
          <Server size={14} className="text-indigo-400"/> Simulator Controls
        </div>
        <div className="flex gap-3">
          <button onClick={forceAnalyzerSweep} className="bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 border border-purple-500/50 px-3 py-1 rounded text-xs font-bold transition-colors">
            🔍 Force Analyzer Sweep
          </button>
          <button onClick={() => triggerSimulation('fault span')} className="bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border border-rose-500/50 px-3 py-1 rounded text-xs font-bold transition-colors">
            ⚡ Inject Span Fault
          </button>
          <button onClick={() => triggerSimulation('fault dt')} className="bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/50 px-3 py-1 rounded text-xs font-bold transition-colors">
            🔌 Inject DT Fault
          </button>
          <button onClick={() => triggerSimulation('repair')} className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 border border-emerald-500/50 px-3 py-1 rounded text-xs font-bold transition-colors">
            ✅ Run Repair Protocol
          </button>
        </div>
      </div>

      {/* METRICS RIBBON */}
      <div className="bg-white border-b border-slate-200 shadow-sm z-20 flex px-4 py-3 gap-4 overflow-x-auto">
        <div className="flex-1 min-w-[150px] bg-slate-50 rounded-lg p-3 border border-slate-100">
          <p className="text-[10px] text-slate-500 font-bold uppercase">Total Infrastructure</p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-xl font-black text-slate-800">{stats?.totalPoles || 0} Poles</span>
            <span className="text-xs text-slate-400">{stats?.totalDts || 0} DTs</span>
          </div>
        </div>
       <div className="flex-1 min-w-[150px] bg-emerald-50/50 rounded-lg p-3 border border-emerald-100">
          <p className="text-[10px] text-emerald-600 font-bold uppercase">Grid Power Status</p>
          <div className="flex items-center gap-2 mt-1">
            <Zap size={18} className="text-emerald-500" />
            <span className="text-xl font-black text-emerald-700">
              {stats?.energizedCount || 0} <span className="text-sm text-emerald-600 font-medium">Sensors Reporting</span>
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-[150px] bg-rose-50/50 rounded-lg p-3 border border-rose-100">
          <p className="text-[10px] text-rose-600 font-bold uppercase">Dead IoT Sensors</p>
          <div className="flex items-center gap-2 mt-1">
            <AlertOctagon size={18} className="text-rose-500" />
            <span className="text-xl font-black text-rose-700">{stats?.deadSensors || 0} Filtered</span>
          </div>
        </div>
        <div className="flex-1 min-w-[150px] bg-blue-50/50 rounded-lg p-3 border border-blue-100">
          <p className="text-[10px] text-blue-600 font-bold uppercase">Data Topology</p>
          <div className="flex items-end justify-between mt-1">
            <span className="text-sm font-bold text-blue-800">{stats?.withParent || 0} Exact</span>
            <span className="text-sm font-bold text-slate-500">{stats?.withoutParent || 0} Inferred</span>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex overflow-hidden relative">
        
        {/* LEFT PANE: TICKETS */}
        <div className="w-[420px] bg-white border-r border-slate-200 flex flex-col shadow-xl z-10">
          
          {/* TICKET LIFECYCLE TABS */}
          <div className="flex px-4 pt-4 gap-6 border-b border-slate-200 bg-slate-50">
            <button 
              onClick={() => setActiveTab('open')}
              className={`pb-3 text-sm font-extrabold flex items-center gap-2 transition-colors ${activeTab === 'open' ? 'text-rose-600 border-b-2 border-rose-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <AlertTriangle size={16} /> Active Faults 
              <span className="bg-rose-100 text-rose-700 py-0.5 px-2 rounded-full text-[10px]">{openTickets.length}</span>
            </button>
            <button 
              onClick={() => setActiveTab('closed')}
              className={`pb-3 text-sm font-extrabold flex items-center gap-2 transition-colors ${activeTab === 'closed' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <CheckCircle size={16} /> Auto-Verified
              <span className="bg-emerald-100 text-emerald-700 py-0.5 px-2 rounded-full text-[10px]">{closedTickets.length}</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {displayedTickets.length === 0 && (
               <div className="text-center p-8 text-slate-400 text-sm font-medium">
                 No {activeTab} tickets to display.
               </div>
            )}
            
            {displayedTickets.map(ticket => {
              const isSelected = selectedTicket?.ticketId === ticket.ticketId;
              const reasoning = ticket.confidence === 'High' ? 'Derived from exact wiring data.' : 'Inferred via spatial minimum spanning tree.';
              
              return (
                <div 
                  key={ticket.ticketId}
                  onClick={() => handleSelectTicket(ticket)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-blue-50/50 border-blue-300 ring-2 ring-blue-500/20 shadow-md' 
                      : 'bg-white border-slate-200 hover:border-blue-200 shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200">
                      DT: {ticket.dtId}
                    </span>
                    
                    {/* CONFIDENCE BADGE & TOOLTIP */}
                    <div className="group relative">
                      <span className={`flex items-center gap-1 cursor-help text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${
                        ticket.confidence === 'High' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {ticket.confidence} Conf. <Info size={12} className="opacity-50" />
                      </span>
                      <div className="absolute right-0 top-full mt-1 hidden w-48 bg-slate-800 text-white text-[10px] leading-relaxed p-2 rounded shadow-lg group-hover:block z-50">
                        {reasoning}
                      </div>
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-slate-800 text-sm mb-2">Span Disconnect Detected</h3>
                  <div className="text-xs text-slate-600 font-medium bg-white p-2 rounded border border-slate-100 flex items-center gap-2">
                    <Waypoints size={14} className="text-indigo-400" />
                    <span>{ticket.affectedSpanStart} ➔ {ticket.affectedSpanEnd}</span>
                  </div>

                  {/* DOWNSTREAM IMPACT & RESOLUTION TIMESTAMP */}
                  <div className="mt-3 flex justify-between items-center">
                     <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <ActivitySquare size={12} /> {ticket.downstreamCount !== undefined ? `${ticket.downstreamCount} Nodes Dark` : 'Calculating Impact...'}
                     </span>
                     {activeTab === 'closed' && ticket.resolvedAt && (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                           <Clock size={12} /> Verified: {new Date(ticket.resolvedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                     )}
                  </div>

                  {isSelected && activeTab === 'open' && (
                    <div className="mt-4 pt-3 border-t border-blue-100">
                      {!aiBrief ? (
                        <button 
                          onClick={(e) => { e.stopPropagation(); generateBrief(ticket); }}
                          disabled={isGenerating}
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        >
                          <Sparkles size={14} className={isGenerating ? "animate-spin" : ""} />
                          {isGenerating ? 'Analyzing...' : 'Draft Dispatch Brief'}
                        </button>
                      ) : (
                        <div className="bg-slate-900 rounded p-3 text-xs text-slate-300 font-mono relative">
                          <p className="text-cyan-400 mb-1 font-bold">SMS OUTPUT:</p>
                          <p className="whitespace-pre-wrap">{aiBrief}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANE: DYNAMIC MAP */}
        <div className="flex-1 relative bg-slate-200">
          <MapContainer center={mapCenter} zoom={mapZoom} className="w-full h-full absolute inset-0" zoomControl={false}>
            <MapController center={mapCenter} zoom={mapZoom} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            
            {/* Draw Red (Open) or Green (Closed) Line for Selected Ticket */}
            {selectedTicket && (
              <>
                <Polyline 
                  positions={[
                    [selectedTicket.startLat, selectedTicket.startLon], 
                    [selectedTicket.endLat, selectedTicket.endLon]
                  ]} 
                  pathOptions={{ color: selectedTicket.status === 'open' ? '#ef4444' : '#10b981', weight: 6, opacity: 0.8 }} 
                />
                <Marker position={[selectedTicket.startLat, selectedTicket.startLon]}>
                  <Popup>Start: {selectedTicket.affectedSpanStart}</Popup>
                </Marker>
                <Marker position={[selectedTicket.endLat, selectedTicket.endLon]}>
                  <Popup>End: {selectedTicket.affectedSpanEnd}</Popup>
                </Marker>
              </>
            )}
          </MapContainer>
        </div>
      </main>

      {/* RAW TELEMETRY LOGS MODAL */}
      {showLogs && (
        <div className="absolute inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="bg-slate-950 px-4 py-3 flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-sm font-bold">
                <Activity size={16} /> RAW INGESTION STREAM
              </div>
              <button 
                onClick={() => setShowLogs(false)}
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-rose-500/20 hover:border-rose-500 rounded p-1 transition-colors"
              >
                Close X
              </button>
            </div>

            {/* Logs Container */}
            <div className="flex-1 overflow-y-auto p-4 bg-black font-mono text-xs space-y-1">
              {logs.length === 0 ? (
                <div className="text-slate-500 text-center mt-10">Awaiting telemetry...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`flex gap-4 px-2 py-1.5 rounded border-l-2 ${log.energized ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-rose-500 text-rose-400 bg-rose-500/5'}`}>
                    <span className="text-slate-500 shrink-0">
                      [{new Date(log.timestamp).toISOString().split('T')[1].replace('Z', '')}]
                    </span>
                    <span className="text-blue-400 shrink-0 w-32">{log.deviceId}</span>
                    <span className="text-slate-300 w-24">EVT: {log.event}</span>
                    <span className="font-bold">PWR: {log.energized ? 'LIVE' : 'DEAD'}</span>
                    <span className="text-slate-600 ml-auto text-[10px]">SEQ:{log.seq}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}