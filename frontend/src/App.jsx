import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { LayoutDashboard, Users, MessageSquare, Database, Settings, UploadCloud, Plus, Loader2, Download, Send } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import html2canvas from 'html2canvas';
import './index.css';

const SOCKET_SERVER_URL = "http://localhost:4000";

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899'];

function App() {
  const [hasJoined, setHasJoined] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    document.body.className = theme === 'light' ? 'light-theme' : '';
  }, [theme]);
  const [usernameInput, setUsernameInput] = useState("");
  const [myUsername, setMyUsername] = useState("");
  const [myColor, setMyColor] = useState(COLORS[0]);

  const [roomId, setRoomId] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let room = urlParams.get('room');
    if (!room) {
      room = Math.random().toString(36).substring(2, 8);
      window.history.replaceState(null, '', `?room=${room}`);
    }
    return room;
  });
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [tabs, setTabs] = useState(() => {
    const saved = sessionStorage.getItem('nexus_tabs');
    return saved ? JSON.parse(saved) : [{ id: 1, name: 'Workspace 1', charts: [] }];
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    const saved = sessionStorage.getItem('nexus_active_tab');
    return saved ? JSON.parse(saved) : 1;
  });
  const activeTabRef = React.useRef(1);

  useEffect(() => {
    sessionStorage.setItem('nexus_tabs', JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    sessionStorage.setItem('nexus_active_tab', JSON.stringify(activeTabId));
  }, [activeTabId]);
  const [connectedUsers, setConnectedUsers] = useState(1);
  const [query, setQuery] = useState('');
  const [otherCursors, setOtherCursors] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [availableDatasets, setAvailableDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState(null);
  const fileInputRef = React.useRef(null);
  const messagesEndRef = React.useRef(null);
  const exportRef = React.useRef(null);

  const handleExport = async () => {
    if (!exportRef.current) return;
    try {
      const bgColor = theme === 'dark' ? '#050505' : '#f8fafc';
      const canvas = await html2canvas(exportRef.current, { backgroundColor: bgColor, scale: 2 });
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `nexus_export_${new Date().getTime()}.png`;
      a.click();
    } catch (e) {
      console.error("Export failed", e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    activeTabRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      const savedUser = sessionStorage.getItem('nexus_username');
      if (savedUser) {
        setMyUsername(savedUser);
        setMyColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
        newSocket.emit('join_workspace', { username: savedUser, roomId });
        setHasJoined(true);
      }
    });
    newSocket.on('disconnect', () => setIsConnected(false));

    newSocket.on('chat_history', (history) => {
      setMessages(history); // Load entire persistent history
    });

    newSocket.on('new_message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    newSocket.on('user_joined', (data) => {
      setMessages(prev => [...prev, { system: true, text: `${data.username} joined the workspace.` }]);
      setConnectedUsers(prev => prev + 1);
    });

    newSocket.on('user_left', (data) => {
      setConnectedUsers(prev => Math.max(1, prev - 1));
      setOtherCursors(prev => {
        const newCursors = { ...prev };
        delete newCursors[data.id];
        return newCursors;
      });
    });

    newSocket.on('data_uploaded', (data) => {
      setMessages(prev => [...prev, { system: true, text: `Data uploaded: ${data.originalName}` }]);
    });

    newSocket.on('dataset_changed', (data) => {
      setActiveDataset(data);
    });

    newSocket.on('available_datasets', (datasets) => {
      setAvailableDatasets(datasets);
    });

    newSocket.on('ai_typing', (data) => {
      setIsAiTyping(data.status);
    });

    newSocket.on('chart_generated', (data) => {
      setTabs(prevTabs => prevTabs.map(tab =>
        tab.id === activeTabRef.current
          ? { ...tab, charts: [data, ...tab.charts] }
          : tab
      ));
      setMessages(prev => [...prev, { system: true, text: `AI generated chart for: "${data.title}"` }]);
    });

    // Listen for other people moving their mice
    newSocket.on('cursor_moved', (data) => {
      setOtherCursors(prev => ({
        ...prev,
        [data.id]: { x: data.x, y: data.y, username: data.username, color: COLORS[parseInt(data.username.split('_')[1] || 0) % COLORS.length] }
      }));
    });

    return () => newSocket.close();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setMessages(prev => [...prev, { system: true, text: `Uploading ${file.name}...` }]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('room_id', roomId);

    try {
      await fetch(`${SOCKET_SERVER_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      // The socket event 'data_uploaded' will confirm success to all clients
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { system: true, text: "Upload failed." }]);
    } finally {
      setIsUploading(false);
      e.target.value = null; // reset input
    }
  };

  const handleJoin = (e) => {
    e.preventDefault();
    const user = usernameInput.trim();
    if (!user || !socket) return;
    setMyUsername(user);
    setMyColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
    socket.emit('join_workspace', { username: user, roomId });
    setHasJoined(true);
    sessionStorage.setItem('nexus_username', user);
  };

  // Track MY mouse movements and send them to the server
  const handleMouseMove = (e) => {
    if (socket && hasJoined) {
      socket.emit('cursor_move', {
        username: myUsername,
        x: e.clientX,
        y: e.clientY
      });
    }
  };

  const handleQuerySubmit = (e) => {
    e.preventDefault();
    if (!query.trim() || !socket) return;

    // Add our message optimisticly
    setMessages(prev => [...prev, { user: myUsername, text: query }]);

    // Send to AI (via backend)
    socket.emit('ai_query', { username: myUsername, query });
    setQuery('');
  };

  const currentPrimary = theme === 'dark' ? '#06b6d4' : '#0ea5e9';
  const currentTextMuted = theme === 'dark' ? '#94a3b8' : '#475569';
  const currentTextMain = theme === 'dark' ? '#f8fafc' : '#0f172a';
  const currentSurface2 = theme === 'dark' ? '#1e1e2d' : '#ffffff';

  return (
    <div className="app-container" onMouseMove={handleMouseMove}>

      {!hasJoined && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel animate-fade-in" style={{ padding: '3rem', width: '400px', textAlign: 'center' }}>
            <Database size={48} color="var(--primary-glow)" style={{ marginBottom: '1rem' }} />
            <h2 style={{ marginBottom: '0.5rem', fontSize: '1.8rem' }}>Join Workspace</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Secure Room <b>{roomId}</b> is active.</p>
            <form onSubmit={handleJoin}>
              <input type="text" className="input" placeholder="Enter your full name" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} style={{ width: '100%', marginBottom: '1rem', padding: '1rem', fontSize: '1.1rem', textAlign: 'center' }} autoFocus />
              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', justifyContent: 'center' }}>Enter Collaboration Space</button>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', zIndex: 90000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel animate-fade-in" style={{ padding: '2.5rem', width: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Settings size={24} color="var(--primary-glow)" /> Workspace Settings</h2>
              <button onClick={() => setShowSettings(false)} className="btn" style={{ padding: '0.25rem 0.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem' }}>✕</button>
            </div>

            <div style={{ marginBottom: '1.5rem', background: 'var(--surface-2)', padding: '1rem', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Active Profile</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Username: <b style={{ color: 'white' }}>{myUsername}</b></p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Cursor Color Allocation:</span>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: myColor, border: '2px solid white' }}></div>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem', background: 'var(--surface-2)', padding: '1rem', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Theme Preferences</h3>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button onClick={() => setTheme('dark')} className="btn" style={{ flex: 1, borderColor: theme === 'dark' ? 'var(--primary-glow)' : 'transparent', color: theme === 'dark' ? 'var(--primary-glow)' : 'var(--text-main)' }}>Neon Core</button>
                <button onClick={() => setTheme('light')} className="btn" style={{ flex: 1, borderColor: theme === 'light' ? 'var(--primary-glow)' : 'transparent', color: theme === 'light' ? 'var(--primary-glow)' : 'var(--text-main)' }}>Light Mode</button>
              </div>
            </div>

            <button onClick={() => {
              setMessages([{ system: true, text: "Local browser cache cleared." }]);
              setShowSettings(false);
            }} className="btn" style={{ width: '100%', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--destructive)', border: '1px solid var(--destructive)', marginTop: '0.5rem' }}>
              Clear Local Chat Memory
            </button>
          </div>
        </div>
      )}

      {/* Remote Cursors Overlay */}
      {Object.entries(otherCursors).map(([id, cursor]) => (
        <div key={id} style={{
          position: 'absolute',
          left: cursor.x,
          top: cursor.y,
          pointerEvents: 'none',
          zIndex: 9999,
          transform: 'translate(-50%, -50%)',
          transition: 'left 0.05s linear, top 0.05s linear' // small transition for smoothness
        }}>
          {/* Custom SVG Mouse Cursor */}
          <svg width="24" height="36" viewBox="0 0 24 36" fill="none" style={{ transform: 'rotate(-15deg)', filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.3))' }}>
            <path d="M5.65376 2.15376C5.40555 1.65735 4.67498 1.63845 4.40058 2.12111L0.264267 9.39414C-0.0382283 9.9262 0.35402 10.5794 0.963212 10.5574L9.04948 10.2647C9.64817 10.243 10.0558 9.60533 9.77665 9.04691L5.65376 2.15376Z" fill={cursor.color} />
          </svg>
          <div style={{
            background: cursor.color,
            color: '#fff',
            padding: '4px 8px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 'bold',
            position: 'absolute',
            top: '20px',
            left: '10px',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
          }}>
            {cursor.username}
          </div>
        </div>
      ))}

      {/* Top Reconnection Banner */}
      {!isConnected && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'var(--destructive)', color: 'white', textAlign: 'center', padding: '0.5rem', zIndex: 10000, fontSize: '0.9rem', fontWeight: 'bold' }}>
          Connection lost. Attempting to reconnect to workspace...
        </div>
      )}

      {/* Sidebar Panel */}
      <aside className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: 'var(--primary-glow)', padding: '0.5rem', borderRadius: '8px' }}>
            <Database size={24} color="white" />
          </div>
          <h2 style={{ fontSize: '1.25rem', letterSpacing: '0.5px' }}>Nexus Data</h2>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button className="btn" style={{ justifyContent: 'flex-start', background: 'var(--surface-2)' }}> <LayoutDashboard size={18} /> Workspace </button>
          <button className="btn" onClick={() => alert(`There are currently ${connectedUsers} people collaborating in Room ${roomId}.`)} style={{ justifyContent: 'flex-start', background: 'transparent' }}> <Users size={18} /> Team ({connectedUsers}) </button>
          <button className="btn" onClick={() => {
            navigator.clipboard.writeText(window.location.href);
            alert("Invite link copied to clipboard! Send this unique URL to anyone to join this secure workspace securely.");
          }} style={{ justifyContent: 'flex-start', background: 'transparent', color: 'var(--primary-glow)' }}> <Users size={18} color="var(--primary-glow)" /> Share Invite Link </button>
          <button className="btn" onClick={() => setShowSettings(true)} style={{ justifyContent: 'flex-start', background: 'transparent' }}> <Settings size={18} /> Settings </button>
        </nav>

        {/* Available Datasets List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto' }}>
          <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Available Datasets</h3>
          {availableDatasets.map((ds) => (
            <button
              key={ds.id}
              onClick={() => socket && socket.emit('switch_dataset', ds.id)}
              className="btn"
              style={{
                justifyContent: 'flex-start',
                background: activeDataset?.id === ds.id ? 'var(--surface-2)' : 'transparent',
                borderLeft: activeDataset?.id === ds.id ? '3px solid var(--primary-glow)' : '3px solid transparent',
                borderRadius: '0 8px 8px 0',
                paddingLeft: '1rem',
                fontSize: '0.85rem'
              }}
            >
              <Database size={14} color={activeDataset?.id === ds.id ? 'var(--primary-glow)' : 'var(--text-muted)'} />
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{ds.filename}</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: '1rem' }}>
          <input
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileUpload}
          />
          <button
            className="btn btn-primary"
            style={{ width: '100%', opacity: isUploading ? 0.7 : 1 }}
            onClick={() => fileInputRef.current.click()}
            disabled={isUploading}
          >
            <UploadCloud size={18} /> {isUploading ? 'Uploading...' : 'Upload CSV'}
          </button>
        </div>
      </aside>

      {/* Main Canvas Area */}
      <main ref={exportRef} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', marginBottom: '0.25rem' }}>{activeDataset ? activeDataset.originalName : 'Sales Analysis Project'}</h1>
            <p style={{ color: 'var(--text-muted)' }}>{activeDataset ? `${activeDataset.rowCount} rows ready for analysis` : 'Real-time collaborative analytics.'}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn" onClick={handleExport} style={{ background: 'var(--surface-2)' }}>
              <Download size={18} color="var(--primary-glow)" /> Export PNG
            </button>
            <button className="btn" onClick={() => {
              const newId = Date.now();
              setTabs([...tabs, { id: newId, name: `Workspace ${tabs.length + 1}`, charts: [] }]);
              setActiveTabId(newId);
            }}><Plus size={18} /> New Tab</button>
          </div>
        </header>

        {/* Tabs Row */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                padding: '0.4rem 0.8rem',
                background: activeTabId === tab.id ? 'var(--surface-2)' : 'transparent',
                border: activeTabId === tab.id ? '1px solid var(--glass-border)' : '1px solid transparent',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem'
              }}
            >
              {tab.name}
              {tabs.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    const newTabs = tabs.filter(t => t.id !== tab.id);
                    setTabs(newTabs);
                    if (activeTabId === tab.id) setActiveTabId(newTabs[newTabs.length - 1].id);
                  }}
                  style={{ cursor: 'pointer', color: 'var(--destructive)', fontWeight: 'bold', marginLeft: '4px', fontSize: '1rem', lineHeight: 1 }}
                >
                  ×
                </span>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {tabs.find(t => t.id === activeTabId)?.charts.length === 0 ? (
            <div style={{ flex: 1, textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
              <div style={{ background: 'var(--surface-2)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                <Database size={32} />
              </div>
              <h3>No data visualizations yet</h3>
              <p>Ask the AI a question in the chat panel to generate a live chart.</p>
            </div>
          ) : (
            tabs.find(t => t.id === activeTabId)?.charts.map((chart, idx) => (
              <div key={idx} className="stat-card animate-fade-in" style={{ flex: '1 1 100%', minWidth: '280px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                  <h4 style={{ color: 'var(--accent-glow)' }}>{chart.title}</h4>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--surface-1)', padding: '0.25rem 0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                      By {chart.generatedBy}
                    </span>
                    <button
                      onClick={() => {
                        const csvContent = "data:text/csv;charset=utf-8,Name,Value\\n" + chart.data.map(e => `"${e.name}",${e.value}`).join("\\n");
                        const encodedUri = encodeURI(csvContent);
                        const link = document.createElement("a");
                        link.setAttribute("href", encodedUri);
                        link.setAttribute("download", `nexus_aggregated_${Date.now()}.csv`);
                        document.body.appendChild(link);
                        link.click();
                      }}
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--glass-border)', color: 'var(--primary-glow)', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <Download size={12} /> CSV
                    </button>
                  </div>
                </div>

                {/* Recharts Visualization */}
                <div style={{ height: '300px', width: '100%', marginTop: '1rem' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    {chart.type === 'line' ? (
                      <LineChart data={chart.data} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                        <XAxis dataKey="name" stroke={currentTextMuted} tick={{ fill: currentTextMuted, fontSize: 12 }} angle={-25} textAnchor="end" height={50} />
                        <YAxis stroke={currentTextMuted} tick={{ fill: currentTextMuted, fontSize: 12 }} />
                        <Tooltip contentStyle={{ backgroundColor: currentSurface2, border: '1px solid rgba(128,128,128,0.2)', borderRadius: '8px', color: currentTextMain }} />
                        <Line type="monotone" dataKey="value" stroke={currentPrimary} strokeWidth={3} dot={{ r: 4, fill: currentPrimary }} />
                      </LineChart>
                    ) : chart.type === 'pie' ? (
                      <PieChart margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                        <Pie data={chart.data} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({ name }) => name} labelLine={false}>
                          {chart.data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: currentSurface2, border: '1px solid rgba(128,128,128,0.2)', borderRadius: '8px', color: currentTextMain }} />
                      </PieChart>
                    ) : (
                      <BarChart data={chart.data} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                        <XAxis dataKey="name" stroke={currentTextMuted} tick={{ fill: currentTextMuted, fontSize: 12 }} angle={-25} textAnchor="end" height={50} />
                        <YAxis stroke={currentTextMuted} tick={{ fill: currentTextMuted, fontSize: 12 }} />
                        <Tooltip contentStyle={{ backgroundColor: currentSurface2, border: '1px solid rgba(128,128,128,0.2)', borderRadius: '8px', color: currentTextMain }} cursor={{ fill: 'rgba(128,128,128,0.1)' }} />
                        <Bar dataKey="value" fill={currentPrimary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* AI Chat Panel */}
      <aside className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquare size={20} color="var(--primary-glow)" />
          <h3 style={{ margin: 0 }}>Data Assistant</h3>
        </div>

        <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ alignSelf: 'flex-start', background: 'var(--surface-2)', padding: '0.75rem 1rem', borderRadius: '12px 12px 12px 0', maxWidth: '85%' }}>
            <p style={{ fontSize: '0.9rem' }}>Hi! I'm your AI data assistant. Ask me anything about your uploaded datasets.</p>
          </div>

          {messages.map((msg, idx) => (
            msg.system || msg.user === 'System' ? (
              <div key={idx} style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
                {msg.text}
              </div>
            ) : (
              <div key={idx} className="animate-fade-in" style={{ alignSelf: msg.user === 'You' ? 'flex-end' : 'flex-start', background: msg.user === 'You' ? 'var(--primary)' : 'var(--surface-2)', padding: '0.75rem 1rem', borderRadius: msg.user === 'You' ? '12px 12px 0 12px' : '12px 12px 12px 0', maxWidth: '85%' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>{msg.user}</span>
                <p style={{ fontSize: '0.9rem' }}>{msg.text}</p>
              </div>
            )
          ))}
          {isAiTyping && (
            <div className="animate-fade-in" style={{ alignSelf: 'flex-start', background: 'var(--surface-2)', padding: '0.75rem 1rem', borderRadius: '12px 12px 12px 0', maxWidth: '85%', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Loader2 size={16} className="animate-spin" color="var(--primary-glow)" />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>AI is calculating...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '1.25rem', borderTop: '1px solid var(--glass-border)' }}>
          <form onSubmit={handleQuerySubmit} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="input"
              placeholder="E.g., Show sales by region"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem' }}>
              <Send size={18} />
            </button>
          </form>
        </div>
      </aside>

    </div>
  );
}

export default App;
