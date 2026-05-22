import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays, LogOut, ChevronLeft, ChevronRight, 
  Shield, Calendar, BookOpen, Trash2, Edit, Clock, User, Archive, Users, Eye, EyeOff, Save, X
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

export default function App() {
  const [parties, setParties] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; });
  const [view, setView] = useState('Guide'); 
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [gateU, setGateU] = useState('');
  const [gateP, setGateP] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [formData, setFormData] = useState({ theme: '', hostName: '', coHost: '', date: '', startTime: '', performers: 'VUI' });

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
    const handleKeyDown = (e) => { if (e.key === 'Escape') setShowAuthGate(false); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    const unsubscribe = onSnapshot(collection(db, getPath('parties')), 
      (s) => setParties(s.docs.map(d => ({id: d.id, ...d.data()}))),
      (e) => console.error("Firestore permission error", e)
    );
    return () => unsubscribe();
  }, [isAuthReady]);

  const { upcomingGuide, monthlyParties, active, archived } = useMemo(() => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const selMonth = selectedDate.getMonth();
    const selYear = selectedDate.getFullYear();
    
    const uG = [], mP = [], act = [], arc = [];
    parties.forEach(p => {
        const d = new Date(p.date);
        if (d >= todayMidnight) uG.push(p);
        if (d.getMonth() === selMonth && d.getFullYear() === selYear) mP.push(p);
        if (d >= todayMidnight) act.push(p);
        else arc.push(p);
    });
    return { upcomingGuide: uG, monthlyParties: mP, active: act, archived: arc };
  }, [parties, selectedDate]);

  const handleAdd = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, getPath('parties')), { ...formData, status: 'approved' });
    setFormData({ theme: '', hostName: '', coHost: '', date: '', startTime: '', performers: 'VUI' });
  };

  const handleDelete = async (id) => await deleteDoc(doc(db, getPath('parties'), id));
  const handleUpdate = async (id, data) => await updateDoc(doc(db, getPath('parties'), id), data);
  
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-200 font-sans text-base md:text-lg">
      <header className="bg-[#111827] border-b border-white/5 p-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2"><div className="w-10 h-10 bg-indigo-600/10 rounded-lg flex items-center justify-center border border-indigo-500/30"><CalendarDays size={22} className="text-indigo-500"/></div><h1 className="font-black text-white text-lg">VU HUB</h1></div>
        {currentUser ? (
            <div className="flex items-center gap-4">
                <span className="text-xs bg-white/5 px-4 py-1.5 rounded-full uppercase font-bold text-indigo-400">{currentUser.username}</span>
                <button onClick={()=>{setCurrentUser(null); localStorage.removeItem(SESSION_KEY);}} className="text-xs font-black uppercase text-rose-500"><LogOut size={16}/></button>
            </div>
        ) : <button onClick={() => setShowAuthGate(true)} className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl text-xs font-black uppercase"><Shield size={16}/> Admin</button>}
      </header>

      <div className="flex p-4 gap-2 bg-[#111827]/50 border-b border-white/5 overflow-x-auto">
        {['Guide', 'Monthly', isStaff ? 'Manage' : ''].filter(Boolean).map(t => (
            <button key={t} onClick={()=>setView(t)} className={`px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2 ${view===t ? 'bg-indigo-600 text-white' : 'bg-[#1f2937] text-slate-400 hover:bg-slate-700'}`}>
                {t === 'Guide' && <BookOpen size={14}/>}{t === 'Monthly' && <Calendar size={14}/>}{t === 'Manage' && <Edit size={14}/>}{t}
            </button>
        ))}
      </div>

      <main className="p-4 md:p-6 max-w-4xl mx-auto">
        {view === 'Guide' && <div className="space-y-8"><section><h2 className="font-black text-white mb-4 uppercase tracking-wider text-sm">Active & Upcoming</h2>{upcomingGuide.map(p => <EventCard key={p.id} p={p}/>)}</section></div>}
        {view === 'Monthly' && (
           <div className="space-y-4">
            <div className="flex justify-between items-center mb-6 bg-[#111827] p-5 rounded-xl border border-white/5">
                <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}><ChevronLeft size={20}/></button>
                <span className="font-black text-lg">{selectedDate.toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}</span>
                <button onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}><ChevronRight size={20}/></button>
            </div>
            {monthlyParties.map(p => <EventCard key={p.id} p={p}/>)}
           </div>
        )}
        {view === 'Manage' && isStaff && (
            <div className="space-y-8">
                <form onSubmit={handleAdd} className="bg-[#111827] border border-white/10 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input placeholder="Theme" className="bg-black/40 p-4 rounded-lg border border-white/10" onChange={e=>setFormData({...formData, theme: e.target.value})}/>
                    <input placeholder="Host" className="bg-black/40 p-4 rounded-lg border border-white/10" onChange={e=>setFormData({...formData, hostName: e.target.value})}/>
                    <input placeholder="Co-Host" className="bg-black/40 p-4 rounded-lg border border-white/10" onChange={e=>setFormData({...formData, coHost: e.target.value})}/>
                    <select className="bg-black/40 p-4 rounded-lg border border-white/10 col-span-full" onChange={e=>setFormData({...formData, performers: e.target.value})}>
                        <option value="VUI">VUI</option>
                        <option value="StoryTeller">StoryTeller</option>
                    </select>
                    <input type="time" className="bg-black/40 p-4 rounded-lg border border-white/10" onChange={e=>setFormData({...formData, startTime: e.target.value})}/>
                    <input type="date" className="bg-black/40 p-4 rounded-lg border border-white/10" onChange={e=>setFormData({...formData, date: e.target.value})}/>
                    <button className="bg-indigo-600 rounded-lg font-bold p-4 col-span-full">ADD EVENT</button>
                </form>
                <section><h3 className="text-white font-black mb-4 flex items-center gap-2 text-lg"><Edit size={18}/> Active Events</h3>{active.map(p => <ManageEventCard key={p.id} p={p} onDelete={handleDelete} onUpdate={handleUpdate}/>)}</section>
                <section><h3 className="text-slate-500 font-black mb-4 flex items-center gap-2 text-lg"><Archive size={18}/> Archive</h3>{archived.map(p => <ManageEventCard key={p.id} p={p} onDelete={handleDelete} onUpdate={handleUpdate}/>)}</section>
            </div>
        )}
      </main>

      {showAuthGate && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[100]">
           <div className="bg-[#111827] p-8 rounded-3xl w-full max-w-sm border border-white/10">
              <form onSubmit={e => { e.preventDefault(); if (gateU.toLowerCase() === 'admin' && gateP === 'admin123') { setCurrentUser({username: 'Admin', role: 'admin'}); setShowAuthGate(false); } }} className="space-y-4">
                <input placeholder="Username" onChange={e=>setGateU(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-4"/>
                <div className="relative"><input type={showPass ? "text" : "password"} placeholder="Passcode" onChange={e=>setGateP(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pr-12"/><button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-4 text-slate-500">{showPass ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div>
                <button type="submit" className="w-full bg-indigo-600 py-4 rounded-xl font-black">ENTER</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}

function ManageEventCard({ p, onDelete, onUpdate }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editVal, setEditVal] = useState(p.performers || 'VUI');
    return (
        <div className="bg-[#111827] border border-white/5 p-4 rounded-xl mb-3 flex flex-col gap-2">
            <div className="flex justify-between items-center">
                {isEditing ? <select className="bg-black p-2 rounded" value={editVal} onChange={e=>setEditVal(e.target.value)}><option value="VUI">VUI</option><option value="StoryTeller">StoryTeller</option></select> : <span className="font-black text-white">{p.theme}</span>}
                <div className="flex gap-2">
                    {isEditing ? <button onClick={()=>{onUpdate(p.id, {performers: editVal}); setIsEditing(false);}} className="text-emerald-500"><Save size={18}/></button> : <button onClick={()=>setIsEditing(true)} className="text-indigo-500"><Edit size={18}/></button>}
                    <button onClick={()=>onDelete(p.id)} className="text-rose-500"><Trash2 size={18}/></button>
                </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 font-bold">
                <span>{p.date}</span> <span>{p.startTime}</span> <span>Host: {p.hostName} {p.coHost && `& ${p.coHost}`}</span> <span className="text-indigo-400">{isEditing ? editVal : p.performers}</span>
            </div>
        </div>
    );
}

function EventCard({ p }) {
    const isLive = useMemo(() => new Date(p.date).toDateString() === new Date().toDateString(), [p.date]);
    return (
        <div className={`bg-[#111827] border border-white/5 p-5 rounded-2xl mb-4 ${isLive ? 'ring-2 ring-indigo-500/50' : ''}`}>
            <div className="flex justify-between items-start mb-3">
                <div className="font-black text-white text-lg flex items-center gap-2">{p.theme}{isLive && <span className="text-[10px] bg-rose-600 animate-pulse text-white px-2 py-0.5 rounded-full font-black uppercase">Live Now</span>}</div>
                <div className="text-sm text-slate-300 font-bold bg-black/30 px-3 py-1 rounded flex items-center gap-1.5"><Calendar size={14}/> {p.date}</div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                <div className="flex items-center gap-1.5"><User size={14}/> Host: {p.hostName} {p.coHost && `& ${p.coHost}`}</div>
                <div className="flex items-center gap-1.5 font-bold text-indigo-400"><Clock size={14}/> {p.startTime || 'TBD'}</div>
                {p.performers && <div className="flex items-center gap-1.5 font-bold text-emerald-400"><Users size={14}/> {p.performers}</div>}
            </div>
        </div>
    )
}
