import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays, LogOut, ChevronLeft, ChevronRight, 
  Shield, Calendar, BookOpen, Trash2, Edit, Clock, User, Users, X, Save, Settings, Eye, EyeOff, Archive
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

const getViteEnv = (key) => { try { const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}; return env[key] || null; } catch (e) { return null; } };
const getSafeConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config && __firebase_config !== "undefined") return JSON.parse(__firebase_config);
  return { apiKey: getViteEnv('VITE_FIREBASE_API_KEY'), authDomain: getViteEnv('VITE_FIREBASE_AUTH_DOMAIN'), projectId: getViteEnv('VITE_FIREBASE_PROJECT_ID'), storageBucket: getViteEnv('VITE_FIREBASE_STORAGE_BUCKET'), messagingSenderId: getViteEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'), appId: getViteEnv('VITE_FIREBASE_APP_ID') };
};

const app = getApps().length === 0 ? initializeApp(getSafeConfig()) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const getPath = (colName) => typeof __app_id !== 'undefined' ? `artifacts/${__app_id}/public/data/${colName}` : colName;
const SESSION_KEY = 'vu_party_hub_v350_pro_final';

const TIME_OPTIONS = [
  "12:00 AM", "1:00 AM", "2:00 AM", "3:00 AM", "4:00 AM", "5:00 AM",
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", 
  "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM", "11:00 PM"
];

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}`;
};

export default function App() {
  const [parties, setParties] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; });
  const [view, setView] = useState('Guide'); 
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  
  // Auth & Modals
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // Forms & Inputs
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [formData, setFormData] = useState({ theme: '', hostName: '', coHost: '', date: '', startTime: '6:00 PM', performers: 'VUI' });
  const [gateU, setGateU] = useState('');
  const [gateP, setGateP] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPass, setShowPass] = useState(false);
  
  // Admin Management
  const [newAdminU, setNewAdminU] = useState('');
  const [newAdminP, setNewAdminP] = useState('');
  const [adminMsg, setAdminMsg] = useState('');
  const [newPass, setNewPass] = useState('');
  const [pwdMsg, setPwdMsg] = useState(null);

  useEffect(() => {
    const initAuth = async () => { 
      try { 
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token); 
        else await signInAnonymously(auth); 
      } catch(e) { console.error("Auth error", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => { if (user) setIsAuthReady(true); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    const unsubscribeParties = onSnapshot(collection(db, getPath('parties')), 
      (s) => setParties(s.docs.map(d => ({id: d.id, ...d.data()}))),
      (e) => console.error("Firestore permission error", e)
    );
    const unsubscribeAdmins = onSnapshot(collection(db, getPath('admins')), 
      (s) => setAdmins(s.docs.map(d => ({id: d.id, ...d.data()}))),
      (e) => console.error("Firestore permission error", e)
    );
    return () => { unsubscribeParties(); unsubscribeAdmins(); };
  }, [isAuthReady]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  }, [currentMonth]);

  const hasEvent = (date) => parties.some(p => new Date(p.date).toDateString() === date.toDateString());

  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');
    
    // Hardcoded master owner
    if (gateU.toLowerCase() === 'mike' && gateP === 'Owner123') {
        const user = { id: 'owner', username: 'Mike', role: 'owner' };
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        setShowAuthGate(false);
        setGateU(''); setGateP('');
        return;
    }

    // Check firestore admins
    const foundAdmin = admins.find(a => a.username.toLowerCase() === gateU.toLowerCase() && a.password === gateP);
    if (foundAdmin) {
        const user = { id: foundAdmin.id, username: foundAdmin.username, role: 'admin' };
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        setShowAuthGate(false);
        setGateU(''); setGateP('');
    } else {
        setLoginError('Invalid credentials');
    }
  };

  const handleAddAdmin = async (e) => {
      e.preventDefault();
      if (!newAdminU.trim() || !newAdminP.trim()) return setAdminMsg("Fields cannot be empty.");
      if (newAdminU.toLowerCase() === 'mike') return setAdminMsg("Cannot use 'Mike' as username.");
      if (admins.some(a => a.username.toLowerCase() === newAdminU.toLowerCase())) return setAdminMsg("Username already exists.");
      
      await addDoc(collection(db, getPath('admins')), { username: newAdminU, password: newAdminP, role: 'admin' });
      setNewAdminU(''); setNewAdminP('');
      setAdminMsg("Admin created successfully!");
      setTimeout(() => setAdminMsg(''), 3000);
  };

  const handleDeleteAdmin = async (id) => await deleteDoc(doc(db, getPath('admins'), id));

  const handleChangePassword = async (e) => {
      e.preventDefault();
      if (!newPass.trim()) return setPwdMsg({type: 'error', text: 'Password cannot be empty'});
      if (currentUser.role === 'owner') return setPwdMsg({type: 'error', text: 'Owner password cannot be changed here.'});
      
      try {
          await updateDoc(doc(db, getPath('admins'), currentUser.id), { password: newPass });
          setPwdMsg({type: 'success', text: 'Password updated successfully!'});
          setTimeout(() => {
              setShowProfileModal(false);
              setPwdMsg(null);
              setNewPass('');
          }, 1500);
      } catch(err) {
          setPwdMsg({type: 'error', text: 'Error updating password.'});
      }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, getPath('parties')), { ...formData, status: 'approved' });
    setFormData({ theme: '', hostName: '', coHost: '', date: '', startTime: '6:00 PM', performers: 'VUI' });
  };

  const handleDelete = async (id) => await deleteDoc(doc(db, getPath('parties'), id));
  
  const handleUpdate = async (e) => {
    e.preventDefault();
    await updateDoc(doc(db, getPath('parties'), editModal.id), editModal);
    setEditModal(null);
  };
  
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'owner';
  
  const today = new Date();
  today.setHours(0,0,0,0);
  const upcomingParties = parties.filter(p => new Date(p.date) >= today).sort((a,b)=>new Date(a.date)-new Date(b.date));

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-200 font-sans text-base pb-10">
      <header className="relative z-40 bg-[#111827] border-b border-white/5 p-4 flex justify-between items-center sticky top-0">
        <div className="flex items-center gap-2"><div className="w-10 h-10 bg-indigo-600/10 rounded-lg flex items-center justify-center border border-indigo-500/30"><CalendarDays size={22} className="text-indigo-500"/></div><h1 className="font-black text-white text-lg">VU Party HUB</h1></div>
        {currentUser ? (
            <div className="flex items-center gap-3">
                <button onClick={() => setShowProfileModal(true)} className="flex items-center gap-1.5 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 px-4 py-1.5 rounded-full uppercase font-bold text-indigo-400 transition-colors border border-indigo-500/20">
                    <Settings size={14}/> {currentUser.username}
                </button>
                <button onClick={()=>{setCurrentUser(null); setView('Guide'); localStorage.removeItem(SESSION_KEY);}} className="text-xs font-black uppercase text-rose-500 hover:text-rose-400 p-2"><LogOut size={18}/></button>
            </div>
        ) : <button onClick={() => setShowAuthGate(true)} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 transition-colors px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-slate-300"><Shield size={16}/> Admin</button>}
      </header>

      <div className="flex p-4 gap-2 bg-[#111827]/50 border-b border-white/5 overflow-x-auto relative z-30">
        {['Guide', 'Monthly', isStaff ? 'Manage' : '', currentUser?.role === 'owner' ? 'Staff' : ''].filter(Boolean).map(t => (
            <button key={t} onClick={()=>setView(t)} className={`px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-colors ${view===t ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-[#1f2937] text-slate-400 hover:bg-slate-700'}`}>
                {t === 'Guide' && <BookOpen size={14}/>}{t === 'Monthly' && <Calendar size={14}/>}{t === 'Manage' && <Edit size={14}/>}{t === 'Staff' && <Users size={14}/>}{t}
            </button>
        ))}
      </div>

      <main className="p-4 md:p-6 max-w-4xl mx-auto relative z-10">
        {view === 'Guide' && (
            <div className="space-y-4">
                <h2 className="font-black text-white text-2xl">Welcome to the VU Party Hub</h2>
                <p className="text-slate-400">Use this hub to track party schedules, view the monthly calendar, and manage upcoming events.</p>
                <div className="bg-[#111827] border border-white/5 p-6 rounded-2xl">
                    <h3 className="font-black text-lg mb-4 text-white">Upcoming Events</h3>
                    <div className="space-y-3">
                        {upcomingParties.length > 0 ? upcomingParties.map(p => (
                            <div key={p.id} className="p-4 bg-black/40 rounded-xl flex flex-col md:flex-row md:justify-between md:items-center gap-2 border border-white/5">
                                <span className="font-bold text-white text-[15px]">{p.theme} <span className="text-slate-500 text-xs ml-2 italic font-medium">Host: {p.hostName}</span></span>
                                <div className="flex gap-3 text-indigo-400 font-bold text-sm">
                                    <span>{formatDate(p.date)}</span>
                                    <span>{p.startTime}</span>
                                </div>
                            </div>
                        )) : <div className="text-slate-500 text-sm">No upcoming events scheduled.</div>}
                    </div>
                </div>
            </div>
        )}
        
        {view === 'Monthly' && (
           <div className="space-y-6">
            <div className="flex justify-between items-center bg-[#111827] p-4 rounded-xl border border-white/5">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><ChevronLeft size={20}/></button>
                <span className="font-black text-white uppercase tracking-widest">{currentMonth.toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}</span>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><ChevronRight size={20}/></button>
            </div>
            <div className="grid grid-cols-7 gap-1">
                {['S','M','T','W','T','F','S'].map((d, index) => (
                    <div key={`day-header-${index}`} className="text-center text-[10px] font-black text-slate-500 pb-2">{d}</div>
                ))}
                {calendarDays.map((d, i) => (
                    <button 
                        key={`day-cell-${i}`} 
                        onClick={() => d && setSelectedDay(d)} 
                        disabled={!d} 
                        className={`aspect-square flex flex-col items-center justify-center text-lg font-bold rounded-lg relative transition-colors ${!d ? 'bg-transparent' : selectedDay?.toDateString() === d.toDateString() ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'bg-[#111827] hover:bg-white/5 border border-white/5'}`}
                    >
                        {d?.getDate()}
                        {d && hasEvent(d) && <div className="absolute bottom-2 w-1.5 h-1.5 bg-indigo-400 rounded-full"></div>}
                    </button>
                ))}
            </div>
           </div>
        )}
        
        {view === 'Manage' && isStaff && (
            <div className="space-y-8">
                <form onSubmit={handleAdd} className="bg-[#111827] border border-white/5 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input required placeholder="Event Theme" className="bg-black/40 p-4 rounded-lg border border-white/10 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors text-white" value={formData.theme} onChange={e=>setFormData({...formData, theme: e.target.value})}/>
                    <input required placeholder="Host Name" className="bg-black/40 p-4 rounded-lg border border-white/10 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors text-white" value={formData.hostName} onChange={e=>setFormData({...formData, hostName: e.target.value})}/>
                    <input placeholder="Co-Host Name (Optional)" className="bg-black/40 p-4 rounded-lg border border-white/10 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors text-white" value={formData.coHost} onChange={e=>setFormData({...formData, coHost: e.target.value})}/>
                    <select required className="bg-black/40 p-4 rounded-lg border border-white/10 text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors" value={formData.performers} onChange={e=>setFormData({...formData, performers: e.target.value})}>
                        <option value="VUI">VUI</option>
                        <option value="StoryTeller">StoryTeller</option>
                    </select>
                    <select required className="bg-black/40 p-4 rounded-lg border border-white/10 text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors" value={formData.startTime} onChange={e=>setFormData({...formData, startTime: e.target.value})}>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input required type="date" className="bg-black/40 p-4 rounded-lg border border-white/10 text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors" value={formData.date} onChange={e=>setFormData({...formData, date: e.target.value})}/>
                    <button type="submit" className="bg-indigo-600 rounded-xl font-black p-4 col-span-full hover:bg-indigo-500 transition-colors text-white mt-2 shadow-lg shadow-indigo-600/20">ADD EVENT</button>
                </form>

                <div className="space-y-3">
                    <h3 className="font-black text-lg mb-4 text-white flex items-center gap-2"><Archive size={18}/> Active Events</h3>
                    {parties.map(p => (
                        <div key={p.id} className="bg-[#111827] border border-white/5 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex flex-col gap-1">
                                <span className="font-bold text-white text-[15px]">{p.theme}</span>
                                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400 font-bold mt-1">
                                    <span>{p.date}</span>
                                    <span>{p.startTime}</span>
                                    <span>Host: {p.hostName}{p.coHost ? ` / ${p.coHost}` : ''}</span>
                                    <span className="text-indigo-400">{p.performers}</span>
                                </div>
                            </div>
                            <div className="flex gap-2 w-full md:w-auto justify-end">
                                <button onClick={() => setEditModal(p)} className="p-2.5 bg-black/40 border border-white/5 hover:bg-white/10 rounded-xl text-indigo-400 transition-colors"><Edit size={16}/></button>
                                <button onClick={() => handleDelete(p.id)} className="p-2.5 bg-black/40 border border-white/5 hover:bg-rose-500/20 hover:border-rose-500/30 rounded-xl text-rose-500 transition-colors"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))}
                    {parties.length === 0 && <p className="text-slate-500 text-sm">No events to manage.</p>}
                </div>
            </div>
        )}

        {view === 'Staff' && currentUser?.role === 'owner' && (
            <div className="space-y-8">
                <div className="bg-[#111827] border border-white/5 p-6 rounded-2xl">
                    <h3 className="font-black text-lg text-white mb-4">Create New Admin</h3>
                    <form onSubmit={handleAddAdmin} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input placeholder="Admin Username" value={newAdminU} onChange={e=>setNewAdminU(e.target.value)} className="bg-black/40 p-4 rounded-lg border border-white/10 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
                        <input placeholder="Initial Password" value={newAdminP} onChange={e=>setNewAdminP(e.target.value)} className="bg-black/40 p-4 rounded-lg border border-white/10 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
                        {adminMsg && <div className="col-span-full text-sm font-bold text-emerald-400 mt-1">{adminMsg}</div>}
                        <button type="submit" className="col-span-full bg-indigo-600 rounded-xl font-black p-4 text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20">CREATE ADMIN ACCOUNT</button>
                    </form>
                </div>

                <div className="space-y-3">
                    <h3 className="font-black text-lg text-white mb-4">Current Administrators</h3>
                    {admins.map(a => (
                        <div key={a.id} className="bg-[#111827] border border-white/5 p-5 rounded-2xl flex justify-between items-center">
                            <span className="font-bold text-white flex items-center gap-2"><Shield size={16} className="text-indigo-400"/> {a.username}</span>
                            <button onClick={()=>handleDeleteAdmin(a.id)} className="p-2.5 bg-black/40 border border-white/5 hover:bg-rose-500/20 hover:border-rose-500/30 rounded-xl text-rose-500 transition-colors"><Trash2 size={16}/></button>
                        </div>
                    ))}
                    {admins.length === 0 && <p className="text-slate-500 text-sm">No administrators found.</p>}
                </div>
            </div>
        )}
      </main>

      {/* Monthly Day Modal */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
           <div className="bg-[#111827] p-6 rounded-3xl w-full max-w-lg border border-white/10 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-2 pb-4 border-b border-white/5">
                  <h2 className="font-black text-lg text-white">Events for {selectedDay.toDateString()}</h2>
                  <button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-2 rounded-full"><X size={18}/></button>
              </div>
              {parties.filter(p => new Date(p.date).toDateString() === selectedDay.toDateString()).map(p => <EventCard key={p.id} p={p}/>)}
              {parties.filter(p => new Date(p.date).toDateString() === selectedDay.toDateString()).length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-8">No events scheduled for this date.</p>
              )}
           </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
           <form onSubmit={handleUpdate} className="bg-[#111827] p-6 rounded-3xl w-full max-w-lg border border-white/10 space-y-4">
              <div className="flex justify-between items-center mb-2 pb-4 border-b border-white/5">
                  <h2 className="font-black text-lg text-white flex items-center gap-2"><Edit size={18} className="text-indigo-400"/> Edit Event</h2>
              </div>
              
              <input required placeholder="Event Theme" className="w-full bg-black/40 p-4 rounded-xl border border-white/10 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 text-white transition-colors" value={editModal.theme} onChange={e=>setEditModal({...editModal, theme: e.target.value})}/>
              <input required placeholder="Host Name" className="w-full bg-black/40 p-4 rounded-xl border border-white/10 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 text-white transition-colors" value={editModal.hostName} onChange={e=>setEditModal({...editModal, hostName: e.target.value})}/>
              <input placeholder="Co-Host Name (Optional)" className="w-full bg-black/40 p-4 rounded-xl border border-white/10 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 text-white transition-colors" value={editModal.coHost} onChange={e=>setEditModal({...editModal, coHost: e.target.value})}/>
              
              <select required className="w-full bg-black/40 p-4 rounded-xl border border-white/10 text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors" value={editModal.performers} onChange={e=>setEditModal({...editModal, performers: e.target.value})}>
                <option value="VUI">VUI</option>
                <option value="StoryTeller">StoryTeller</option>
              </select>
              
              <select required className="w-full bg-black/40 p-4 rounded-xl border border-white/10 text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors" value={editModal.startTime} onChange={e=>setEditModal({...editModal, startTime: e.target.value})}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              
              <input required type="date" className="w-full bg-black/40 p-4 rounded-xl border border-white/10 text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors" value={editModal.date} onChange={e=>setEditModal({...editModal, date: e.target.value})}/>
              
              <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setEditModal(null)} className="bg-black/40 border border-white/10 flex-1 p-4 rounded-xl flex items-center justify-center gap-2 font-black text-slate-300 hover:bg-white/5 transition-colors">
                      CANCEL
                  </button>
                  <button type="submit" className="bg-indigo-600 flex-1 p-4 rounded-xl flex items-center justify-center gap-2 font-black text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20">
                      <Save size={18}/> SAVE
                  </button>
              </div>
           </form>
        </div>
      )}

      {/* Auth Gate Modal */}
      {showAuthGate && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
           <div className="bg-[#111827] p-8 rounded-3xl w-full max-w-sm border border-white/10">
              <div className="flex justify-between items-center mb-6">
                  <h2 className="font-black text-xl text-white flex items-center gap-2"><Shield size={20} className="text-indigo-500"/> Admin Login</h2>
                  <button onClick={() => {setShowAuthGate(false); setLoginError('');}} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-2 rounded-full"><X size={16}/></button>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <input placeholder="Username" value={gateU} onChange={e=>setGateU(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-indigo-500 transition-colors"/>
                <div className="relative">
                    <input type={showPass ? "text" : "password"} placeholder="Password" value={gateP} onChange={e=>setGateP(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pr-12 text-white focus:outline-none focus:border-indigo-500 transition-colors"/>
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-4 text-slate-500 hover:text-slate-300 transition-colors">{showPass ? <EyeOff size={20}/> : <Eye size={20}/>}</button>
                </div>
                {loginError && <p className="text-rose-500 text-sm font-bold pt-1">{loginError}</p>}
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 transition-colors py-4 rounded-xl font-black text-white shadow-lg shadow-indigo-600/20 mt-2">Submit</button>
              </form>
           </div>
        </div>
      )}

      {/* Profile Modal (Change Password) */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
           <form onSubmit={handleChangePassword} className="bg-[#111827] p-8 rounded-3xl w-full max-w-sm border border-white/10 space-y-4">
              <div className="flex justify-between items-center mb-4">
                  <h2 className="font-black text-lg text-white">Change Password</h2>
                  <button type="button" onClick={()=>{setShowProfileModal(false); setPwdMsg(null); setNewPass('');}} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-2 rounded-full"><X size={16}/></button>
              </div>
              <p className="text-sm text-slate-400 font-medium mb-4">Update the password for <strong className="text-indigo-400">{currentUser?.username}</strong>.</p>
              
              <input type="text" placeholder="Enter new password" value={newPass} onChange={e=>setNewPass(e.target.value)} className="w-full bg-black/40 p-4 rounded-xl border border-white/10 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors" />
              
              {pwdMsg && <p className={`text-sm font-bold ${pwdMsg.type === 'error' ? 'text-rose-500' : 'text-emerald-500'}`}>{pwdMsg.text}</p>}
              
              <button type="submit" className="bg-indigo-600 w-full p-4 rounded-xl font-black text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20 mt-2">UPDATE PASSWORD</button>
           </form>
        </div>
      )}
    </div>
  );
}

function EventCard({ p }) {
    return (
        <div className="bg-[#0a0f1d] border border-white/5 p-5 rounded-2xl mb-3">
            <div className="font-black text-white text-[15px] mb-2">{p.theme}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400 font-bold">
                <div className="flex items-center gap-1.5"><Clock size={14}/> {p.startTime} <span className="opacity-60 text-[10px]">(PT)</span></div>
                <div className="flex items-center gap-1.5"><User size={14}/> Host: {p.hostName} {p.coHost && <span className="opacity-60">/ {p.coHost}</span>}</div>
                <div className="flex items-center gap-1.5 text-indigo-400"><Users size={14}/> {p.performers}</div>
            </div>
        </div>
    )
}
