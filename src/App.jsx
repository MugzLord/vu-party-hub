import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays, LogOut, ChevronLeft, ChevronRight, 
  Shield, Calendar, BookOpen, Trash2, Edit, Clock, User, Archive, Users, Eye, EyeOff
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
  const [currentUser, setCurrentUser] = useState(() => { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; });
  const [view, setView] = useState('Guide'); 
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [gateU, setGateU] = useState('');
  const [gateP, setGateP] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [formData, setFormData] = useState({ theme: '', hostName: '', coHost: '', date: '', startTime: '6:00 PM', performers: 'VUI' });

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
    const unsubscribe = onSnapshot(collection(db, getPath('parties')), 
      (s) => setParties(s.docs.map(d => ({id: d.id, ...d.data()}))),
      (e) => console.error("Firestore permission error", e)
    );
    return () => unsubscribe();
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

  const filteredParties = useMemo(() => {
    if (!selectedDay) return [];
    return parties.filter(p => new Date(p.date).toDateString() === selectedDay.toDateString());
  }, [parties, selectedDay]);

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

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-200 font-sans text-base">
      <header className="bg-[#111827] border-b border-white/5 p-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2"><div className="w-10 h-10 bg-indigo-600/10 rounded-lg flex items-center justify-center border border-indigo-500/30"><CalendarDays size={22} className="text-indigo-500"/></div><h1 className="font-black text-white text-lg">VU Party Hub</h1></div>
        {currentUser ? (
            <button onClick={()=>{setCurrentUser(null); localStorage.removeItem(SESSION_KEY);}} className="text-xs font-black uppercase text-rose-500"><LogOut size={16}/></button>
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
        {view === 'Monthly' && (
           <div className="space-y-6">
            <div className="flex justify-between items-center bg-[#111827] p-4 rounded-xl border border-white/5">
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}><ChevronLeft size={20}/></button>
                <span className="font-black text-white uppercase tracking-widest">{currentMonth.toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}</span>
                <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}><ChevronRight size={20}/></button>
            </div>
            <div className="grid grid-cols-7 gap-1">
                {['S','M','T','W','T','F','S'].map(d=><div key={d} className="text-center text-[10px] font-black text-slate-500">{d}</div>)}
                {calendarDays.map((d, i) => (
                    <button key={i} onClick={() => d && setSelectedDay(d)} className={`aspect-square flex items-center justify-center text-xs font-bold rounded-lg ${!d ? 'bg-transparent' : selectedDay?.toDateString() === d.toDateString() ? 'bg-indigo-600' : 'bg-[#111827] hover:bg-white/5'}`}>
                        {d?.getDate()}
                    </button>
                ))}
            </div>
            {selectedDay && (
                <div className="space-y-4">
                    <h3 className="font-black text-white uppercase text-sm border-l-4 border-indigo-500 pl-3">Events for {formatDate(selectedDay)}</h3>
                    {filteredParties.length > 0 ? filteredParties.map(p => <EventCard key={p.id} p={p}/>) : <p className="text-sm text-slate-500">No events found.</p>}
                </div>
            )}
           </div>
        )}
      </main>
    </div>
  );
}

function EventCard({ p }) {
    return (
        <div className="bg-[#111827] border border-white/5 p-5 rounded-2xl">
            <div className="font-black text-white text-lg mb-2">{p.theme}</div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-400 font-bold">
                <div className="flex items-center gap-1.5"><Clock size={14}/> {p.startTime} <span className="opacity-60 text-[10px]">(PT)</span></div>
                <div className="flex items-center gap-1.5"><User size={14}/> Host: {p.hostName}</div>
                <div className="flex items-center gap-1.5 text-indigo-400"><Users size={14}/> {p.performers}</div>
            </div>
        </div>
    )
}
