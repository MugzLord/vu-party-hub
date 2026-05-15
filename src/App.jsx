import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Plus, PartyPopper, X, ChevronLeft, ChevronRight, 
  CalendarDays, Edit2, Trash2, Shield, LogOut, List as ListIcon, LayoutGrid, CheckCircle, Clock3, Eye, EyeOff, Crown, FileText, Sparkles, Loader2, Send, BellRing, UserPlus, Users, Zap, Globe, Link as LinkIcon, User, ExternalLink, Key, RefreshCcw, Library
} from 'lucide-react';

// --- FIREBASE INTEGRATION ---
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

// Safe environment variable access
const getViteEnv = (key) => {
  try {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
    return env[key] || null;
  } catch (e) { return null; }
};

// --- CONFIG RESTORATION ---
const getSafeConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config && __firebase_config !== "undefined") {
    return JSON.parse(__firebase_config);
  }
  return {
    apiKey: getViteEnv('VITE_FIREBASE_API_KEY'),
    authDomain: getViteEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: getViteEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getViteEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getViteEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getViteEnv('VITE_FIREBASE_APP_ID')
  };
};

const firebaseConfig = getSafeConfig();
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// --- PATH RESTORATION ---
const getPath = (colName) => {
  if (typeof __app_id !== 'undefined') return `artifacts/${__app_id}/public/data/${colName}`;
  return colName; 
};

const SESSION_KEY = 'vu_party_hub_v350_pro_final';
const GOOGLE_FORM_LINK = 'https://docs.google.com/forms/d/e/1FAIpQLSctHRAv0mdyL8_gwnB0AIOvVDWtZzwA5UYYo_h_rZ48LBnkNQ/viewform'; 
const RAILWAY_GUIDE_URL = 'https://imvu-calendar.up.railway.app/';

const DAY_STYLES = [
  { name: 'Sun', border: 'border-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-500' },
  { name: 'Mon', border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-500' },
  { name: 'Tue', border: 'border-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-500' },
  { name: 'Wed', border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  { name: 'Thu', border: 'border-sky-500', bg: 'bg-sky-500/10', text: 'text-sky-500' },
  { name: 'Fri', border: 'border-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
  { name: 'Sat', border: 'border-fuchsia-500', bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-500' },
];

// Utility functions with NaN protection
const timeToMins = (t) => { 
  if(!t || typeof t !== 'string' || !t.includes(':')) return 0; 
  const [h, m] = t.split(':').map(Number); 
  return isNaN(h) || isNaN(m) ? 0 : h * 60 + m; 
};

const format12h = (t) => { 
  if (!t || typeof t !== 'string' || !t.includes(':')) return '--:--'; 
  let [h, m] = t.split(':').map(Number); 
  if (isNaN(h) || isNaN(m)) return '--:--';
  const am = h >= 12 ? 'PM' : 'AM'; 
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${am}`; 
};

const getEndTime = (startTime, duration) => {
  if (!startTime || isNaN(duration)) return '';
  const parts = startTime.split(':');
  if (parts.length < 2) return '';
  const [h, m] = parts.map(Number);
  if (isNaN(h) || isNaN(m)) return '';
  let totalMins = h * 60 + m + (duration * 60);
  let endH = Math.floor(totalMins / 60) % 24;
  let endM = totalMins % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
};

const getCurrentPT = () => {
  try {
    const ptDate = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
    return { 
      dateStr: `${ptDate.getFullYear()}-${String(ptDate.getMonth()+1).padStart(2,'0')}-${String(ptDate.getDate()).padStart(2,'0')}`, 
      mins: ptDate.getHours() * 60 + ptDate.getMinutes() 
    };
  } catch (e) {
    const d = new Date();
    return { dateStr: d.toISOString().split('T')[0], mins: d.getHours() * 60 + d.getMinutes() };
  }
};

const ds_is_future = (p) => {
  const ptM = getCurrentPT();
  if (!p || !p.date || !p.startTime) return false;
  if (p.date > ptM.dateStr) return true;
  if (p.date === ptM.dateStr && (timeToMins(p.startTime) + (p.duration || 2)*60) > ptM.mins) return true;
  return false;
};

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [parties, setParties] = useState([]);
  const [actionLogs, setActionLogs] = useState([]);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [formError, setFormError] = useState('');
  
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const isStaff = ['owner', 'admin', 'staff'].includes(currentUser?.role);
  const userRole = currentUser?.role || null;

  const [view, setView] = useState('List'); 
  const [showAuthGate, setShowAuthGate] = useState(!currentUser);
  const [gateMode, setGateMode] = useState('login');
  const [gateU, setGateU] = useState('');
  const [gateP, setGateP] = useState('');
  const [gateError, setGateError] = useState('');
  const [regData, setRegData] = useState({ u: '', p: '', c: '', program: 'VUI' });
  const [eyeLogin, setEyeLogin] = useState(false);
  const [eyeRegConfirm, setEyeRegConfirm] = useState(false);
  
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ hostName: '', coHosts: '', theme: '', date: '', startTime: '20:00', duration: 2, description: '', roomLink: '', isPublic: true, publicPushMode: 'auto' });

  const [baseDate, setBaseDate] = useState(new Date());
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showPasscodeForm, setShowPasscodeForm] = useState(false);
  const [passcodeData, setPasscodeData] = useState({ current: '', new: '', confirm: '' });
  const [showDash, setShowDash] = useState(false);
  const [dashTab, setDashTab] = useState('logs');
  const [staffForm, setStaffForm] = useState({ u: '', r: 'staff', p: '' });
  const [staffSuccess, setStaffSuccess] = useState('');

  const [eyeCurrent, setEyeCurrent] = useState(false);
  const [eyeNew, setEyeNew] = useState(false);
  const [eyeConfirm, setEyeConfirm] = useState(false);
  const [eyeStaff, setEyeStaff] = useState(false);

  // Grouping Logic
  const sortedParties = useMemo(() => {
    return [...parties].sort((a, b) => {
      const dateComp = (a.date || '').localeCompare(b.date || '');
      if (dateComp !== 0) return dateComp;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  }, [parties]);

  const { activeParties, archivedPartiesByMonth } = useMemo(() => {
    const active = [];
    const archived = {};

    sortedParties.forEach(p => {
      if (ds_is_future(p)) {
        active.push(p);
      } else if (p.date) {
        try {
          const d = new Date(p.date + 'T12:00:00');
          const monthYear = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          if (!archived[monthYear]) archived[monthYear] = [];
          archived[monthYear].push(p);
        } catch (e) {
          if (!archived["Other"]) archived["Other"] = [];
          archived["Other"].push(p);
        }
      }
    });

    return { activeParties: active, archivedPartiesByMonth: archived };
  }, [sortedParties]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else { await signInAnonymously(auth); }
      } catch (err) {}
    };
    initAuth();
    return onAuthStateChanged(auth, setAuthUser);
  }, []);

  useEffect(() => {
    if (!authUser) return;
    onSnapshot(collection(db, getPath('parties')), (s) => setParties(s.docs.map(d => d.data())), (e) => console.error(e));
    onSnapshot(collection(db, getPath('accounts')), (s) => {
      setAccounts(s.docs.map(d => d.data()));
      setDbLoaded(true);
    }, (e) => console.error(e));
    onSnapshot(collection(db, getPath('actionLogs')), (s) => {
      setActionLogs(s.docs.map(d => d.data()).sort((a,b) => b.id - a.id));
    }, (e) => console.error(e));
  }, [authUser]);

  const logAction = async (msg, u = currentUser, sub = '', apprv = '') => {
    if (!u || !authUser) return;
    const id = Date.now().toString();
    await setDoc(doc(db, getPath('actionLogs'), id), { 
      id: Date.now(), 
      time: new Date().toLocaleTimeString(), 
      action: msg, 
      username: u.username, 
      role: u.role,
      submittedBy: sub,
      approvedBy: apprv
    });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const u = gateU.trim().toLowerCase();
    const p = gateP.trim();
    const match = accounts.find(a => (a.username || '').toLowerCase() === u && a.passcode === p);
    if (match) {
      setCurrentUser(match); localStorage.setItem(SESSION_KEY, JSON.stringify(match)); setShowAuthGate(false);
      logAction("Logged In");
    } else if ((u === 'mike' && p === 'owner123')) {
      const f = { id: '1', username: 'Mike', role: 'owner', passcode: 'owner123' };
      setCurrentUser(f); localStorage.setItem(SESSION_KEY, JSON.stringify(f)); setShowAuthGate(false);
    } else { setGateError("Invalid credentials."); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (regData.p !== regData.c) return setGateError("Passwords mismatch.");
    const n = { id: Date.now().toString(), username: regData.u.trim(), role: 'host', program: regData.program, passcode: regData.p };
    setCurrentUser(n); localStorage.setItem(SESSION_KEY, JSON.stringify(n));
    await setDoc(doc(db, getPath('accounts'), n.id), n);
    setShowAuthGate(false);
    logAction("Account Registered");
  };

  const saveEvent = async (e) => {
    e.preventDefault();
    if (isSaving) return; 
    setFormError('');
    const newStart = timeToMins(formData.startTime);
    const newEnd = newStart + (formData.duration * 60);
    const clash = parties.find(p => {
      if (p.date !== formData.date || p.id === editingId) return false;
      const existingStart = timeToMins(p.startTime);
      const existingEnd = existingStart + (p.duration || 2) * 60;
      return newStart < existingEnd && newEnd > existingStart;
    });
    if (clash) {
      setFormError(`Clash detected! "${clash.theme}" is running from ${format12h(clash.startTime)} to ${format12h(getEndTime(clash.startTime, clash.duration || 2))}.`);
      return;
    }
    setIsSaving(true);
    const id = editingId || Date.now().toString();
    const subBy = editingId ? (formData.submittedBy || currentUser.username) : currentUser.username;
    const data = { 
      ...formData, 
      id, 
      status: isStaff ? 'approved' : 'pending', 
      pushedToPublic: isStaff ? (formData.isPublic && formData.publicPushMode === 'auto') : false, 
      hostId: editingId ? (formData.hostId || currentUser.id) : currentUser.id,
      hostName: editingId ? formData.hostName : (currentUser.role === 'host' ? `${currentUser.username} (${currentUser.program})` : formData.hostName),
      submittedBy: subBy,
      approvedBy: isStaff ? currentUser.username : (editingId ? formData.approvedBy : '')
    };
    try {
      await setDoc(doc(db, getPath('parties'), id), data);
      await logAction(editingId ? `Edited ${formData.theme}` : `Submitted ${formData.theme}`, currentUser, subBy, data.approvedBy);
      setShowForm(false); 
      setEditingId(null);
    } catch (err) { console.error("Save error:", err); } finally { setIsSaving(false); }
  };

  const handleUnpublish = (p) => { setDoc(doc(db, getPath('parties'), p.id), { ...p, pushedToPublic: false }); logAction(`Unpublished ${p.theme}`, currentUser, p.submittedBy, p.approvedBy); };
  const handleApprove = (p) => { 
    const updated = { ...p, status: 'approved', pushedToPublic: p.publicPushMode === 'auto', approvedBy: currentUser.username };
    setDoc(doc(db, getPath('parties'), p.id), updated); 
    logAction(`Approved ${p.theme}`, currentUser, p.submittedBy, currentUser.username); 
  };
  const handleManualPush = (p) => { setDoc(doc(db, getPath('parties'), p.id), { ...p, pushedToPublic: true }); logAction(`Published ${p.theme}`, currentUser, p.submittedBy, p.approvedBy); };
  const handleSignalReady = (p) => { setDoc(doc(db, getPath('parties'), p.id), { ...p, publicPushMode: 'ready' }); logAction(`Host Signal Ready: ${p.theme}`, currentUser, p.submittedBy, p.approvedBy); };
  const confirmDelete = async () => { if (deleteConfirm) { await deleteDoc(doc(db, getPath('parties'), deleteConfirm.id)); logAction(`Deleted ${deleteConfirm.theme}`, currentUser, deleteConfirm.submittedBy, deleteConfirm.approvedBy); setDeleteConfirm(null); } };

  if (showAuthGate || !currentUser) {
    return (
      <div className="min-h-screen bg-[#0a0f1d] flex items-center justify-center p-4 font-sans text-left text-slate-200">
        <div className="w-full max-w-md text-left">
          <div className="text-center mb-10"><h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">VU Party Hub</h1><p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-2">Influencer & Storyteller Schedule</p></div>
          <div className="bg-[#111827] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex border-b border-white/5"><button onClick={()=>setGateMode('login')} className={`flex-1 py-5 text-[11px] font-black uppercase tracking-widest transition-all ${gateMode==='login'?'text-indigo-400 border-b-2 border-indigo-500 bg-white/5':'text-slate-600 hover:text-slate-400'}`}>Sign In</button><button onClick={()=>setGateMode('register')} className={`flex-1 py-5 text-[11px] font-black uppercase tracking-widest transition-all ${gateMode==='register'?'text-indigo-400 border-b-2 border-indigo-500 bg-white/5':'text-slate-600 hover:text-slate-400'}`}>Register</button></div>
            <div className="p-8 pt-10 text-left">
              {gateError && <div className="bg-red-500/10 text-red-400 p-3 rounded-xl text-[10px] font-bold uppercase mb-4 border border-red-500/20">{gateError}</div>}
              <form onSubmit={gateMode === 'login' ? handleLogin : handleRegister} className="space-y-6">
                <div className="space-y-1.5 text-left"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Username</label><input required value={gateMode === 'login' ? gateU : regData.u} onChange={e=> gateMode === 'login' ? setGateU(e.target.value) : setRegData({...regData, u: e.target.value})} placeholder="Username" className="w-full bg-black/40 border border-white/10 rounded-xl p-5 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner placeholder:text-slate-800"/></div>
                {gateMode === 'register' && (
                  <div className="space-y-1.5 text-left"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Program</label><select value={regData.program} onChange={e=>setRegData({...regData, program: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-5 text-sm text-white outline-none font-black uppercase tracking-widest shadow-inner cursor-pointer appearance-none"><option value="VUI">Influencer (VUI)</option><option value="VUS">Storyteller (VUS)</option></select></div>
                )}
                <div className="space-y-1.5 relative text-left"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Passcode</label><input required type={eyeLogin ? "text" : "password"} value={gateMode === 'login' ? gateP : regData.p} onChange={e=> gateMode === 'login' ? setGateP(e.target.value) : setRegData({...regData, p: e.target.value})} placeholder="Passcode" className="w-full bg-black/40 border border-white/10 rounded-xl p-5 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner placeholder:text-slate-800"/><button type="button" onClick={()=>setEyeLogin(!eyeLogin)} className="absolute right-5 top-[42px] text-slate-600 hover:text-white transition-colors">{eyeLogin ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div>
                {gateMode === 'register' && (
                  <div className="space-y-1.5 relative text-left"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Confirm</label><input required type={eyeRegConfirm ? "text" : "password"} value={regData.c} onChange={e=>setRegData({...regData, c: e.target.value})} placeholder="Confirm Passcode" className="w-full bg-black/40 border border-white/10 rounded-xl p-5 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner placeholder:text-slate-800"/><button type="button" onClick={()=>setEyeRegConfirm(!eyeRegConfirm)} className="absolute right-5 top-[42px] text-slate-600 hover:text-white transition-colors">{eyeRegConfirm ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div>
                )}
                <button type="submit" disabled={!dbLoaded} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 mt-4 text-[11px]">ENTER HUB</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-200 flex flex-col font-sans overflow-x-hidden text-left">
      <header className="bg-[#111827] border-b border-white/5 p-3 sticky top-0 z-[100] flex justify-between items-center shadow-xl">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-indigo-600/10 rounded-lg flex items-center justify-center border border-indigo-500/30"><CalendarDays size={18} className="text-indigo-500" /></div>
          <h1 className="font-black uppercase tracking-tighter text-base hidden sm:block">VU HUB</h1>
        </div>
        <div className="flex gap-2 items-center">
          <div className="bg-[#1f2937] px-4 py-1.5 rounded-full flex items-center gap-2 font-black uppercase text-[9px] text-indigo-400 border border-white/5 shadow-inner">
            {currentUser.role === 'owner' ? <Crown size={12} className="text-yellow-500"/> : <Shield size={12}/>}{currentUser.username}
            <button onClick={() => setShowPasscodeForm(true)} title="Change Passcode" className="ml-1 opacity-40 hover:opacity-100 transition-opacity"><Key size={14}/></button>
          </div>
          {currentUser.role === 'owner' && (
            <button onClick={()=>{setDashTab('logs'); setShowDash(true);}} className="p-1.5 bg-[#1f2937] rounded-lg text-slate-400 hover:text-white border border-white/5 shadow"><FileText size={16}/></button>
          )}
          <button onClick={()=>{setEditingId(null); setFormError(''); setFormData({hostName: currentUser.role === 'host' ? `${currentUser.username} (${currentUser.program})` : '', coHosts: '', theme: '', date: '', startTime: '20:00', duration: 2, description: '', roomLink: '', isPublic: true, publicPushMode: 'auto'}); setShowForm(true);}} className="bg-indigo-600 px-4 py-1.5 rounded-xl text-white font-black uppercase text-[9px] shadow-lg active:scale-90 transition-all">+ Schedule</button>
          <button onClick={()=>{setCurrentUser(null); localStorage.removeItem(SESSION_KEY); setShowAuthGate(true);}} className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"><LogOut size={16}/></button>
        </div>
      </header>

      <div className="bg-[#111827]/50 border-b border-white/5 flex overflow-x-auto gap-1 p-2 scrollbar-hide">
         {['Guide', 'List', 'Pending', 'Archive', 'Monthly', 'Weekly', 'Daily'].map(t => {
            if (t === 'Pending' && !isStaff) return null;
            return (
              <button key={t} onClick={()=>setView(t)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 ${view===t ? 'bg-indigo-600 text-white shadow-md' : 'bg-[#1f2937] text-slate-500 hover:text-slate-300'}`}>
                {t === 'Archive' ? <Library size={12}/> : (t === 'Guide' ? <Globe size={12}/> : (t === 'List' ? <ListIcon size={12}/> : (t === 'Pending' ? <Clock3 size={12}/> : <CalendarDays size={12}/>)))}
                {t === 'Pending' ? `Pending (${parties.filter(p=>p.status==='pending').length})` : t}
              </button>
            );
         })}
      </div>

      <main className="flex-1 p-2 sm:p-4 max-w-6xl mx-auto w-full text-left">
        {(view === 'List' || view === 'Pending') && (
          <div className="bg-[#111827] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#0f172a] border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Time</th>
                    <th className="p-3 text-left">Theme</th>
                    <th className="p-3 text-left">Host</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-[11px]">
                  {(view === 'Pending' ? parties.filter(p => p.status === 'pending') : activeParties).map(p => (
                    <tr key={p.id} className="hover:bg-white/5 transition-all">
                      <td className="p-3 text-slate-400 font-bold uppercase">{p.date.split('-').slice(1).reverse().join('/')}</td>
                      <td className="p-3 text-slate-400 font-bold uppercase whitespace-nowrap">{format12h(p.startTime)} - {format12h(getEndTime(p.startTime, p.duration || 2))}</td>
                      <td className="p-3 text-white font-black uppercase">{p.theme}</td>
                      <td className="p-3 text-indigo-400 font-bold uppercase whitespace-nowrap">{p.coHosts ? `${p.hostName} + ${p.coHosts}` : p.hostName}</td>
                      <td className="p-3 text-right flex justify-end gap-2 items-center">
                          {p.status === 'pending' ? (
                            isStaff ? (
                               <button onClick={()=>handleApprove(p)} className="p-1.5 text-emerald-400 bg-emerald-500/10 rounded-lg border border-emerald-500/20 hover:scale-105 transition-all"><CheckCircle size={16}/></button>
                            ) : (
                               <div className="flex items-center gap-1 text-amber-500 bg-amber-500/5 px-2 py-1 rounded border border-amber-500/20"><Clock3 size={12}/> <span className="text-[8px] font-black uppercase">Pending</span></div>
                            )
                          ) : (
                            isStaff ? (
                               p.pushedToPublic ? <button onClick={()=>handleUnpublish(p)} title="Unpublish" className="p-1.5 text-rose-400 bg-rose-500/10 rounded-lg hover:scale-105 transition-all"><EyeOff size={16}/></button> :
                               (p.publicPushMode === 'ready' || p.publicPushMode === 'auto') ? <button onClick={()=>handleManualPush(p)} title="Publish" className="p-1.5 text-indigo-400 bg-indigo-500/10 rounded-lg hover:scale-105 transition-all"><Send size={16}/></button> :
                               <div className="text-[8px] font-black text-slate-600 px-2 py-1 bg-white/5 rounded border border-white/5 whitespace-nowrap">On Hold</div>
                            ) : (
                               (!p.pushedToPublic && p.publicPushMode === 'manual' && p.hostId === currentUser.id) ? (
                                 <button onClick={() => handleSignalReady(p)} className="flex items-center gap-1 text-amber-400 bg-amber-400/10 px-2 py-1 rounded border border-amber-400/20 hover:bg-amber-400/20 transition-all text-left">
                                   <BellRing size={12}/> <span className="text-[8px] font-black uppercase">Signal Ready</span>
                                 </button>
                               ) : p.pushedToPublic ? (
                                 <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20"><CheckCircle size={12}/> <span className="text-[8px] font-black uppercase">Published</span></div>
                               ) : (
                                 <div className="flex items-center gap-1 text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20"><CheckCircle size={12}/> <span className="text-[8px] font-black uppercase">Approved</span></div>
                               )
                            )
                          )}
                          {isStaff && <button onClick={()=>{setEditingId(p.id); setFormData(p); setShowForm(true);}} className="p-1.5 text-slate-400 hover:text-white transition-all text-left"><Edit2 size={14}/></button>}
                          {isStaff && <button onClick={()=>setDeleteConfirm(p)} className="p-1.5 text-rose-500/60 hover:text-rose-500 transition-all text-left"><Trash2 size={14}/></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'Archive' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {Object.keys(archivedPartiesByMonth).length === 0 ? (
               <div className="text-center py-20 bg-[#111827] rounded-3xl border border-white/5"><Clock3 size={40} className="mx-auto text-slate-800 mb-4" /><p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">No Archived Parties</p></div>
            ) : (
              Object.keys(archivedPartiesByMonth).sort((a,b) => new Date(b) - new Date(a)).map(month => (
                <div key={month} className="space-y-2">
                  <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-2 flex items-center gap-2"><span className="w-8 h-[1px] bg-indigo-500/30"></span> {month}</h3>
                  <div className="bg-[#111827]/60 border border-white/5 rounded-2xl overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
                    <table className="w-full text-left text-[10px]">
                      <tbody className="divide-y divide-white/5">
                        {archivedPartiesByMonth[month].slice().reverse().map(p => (
                          <tr key={p.id} className="hover:bg-white/5 transition-all">
                            <td className="p-3 text-slate-500 w-20 font-bold uppercase">{p.date.split('-').reverse().slice(0,2).join('/')}</td>
                            <td className="p-3 text-white font-bold uppercase">{p.theme}</td>
                            <td className="p-3 text-slate-400 font-bold uppercase truncate max-w-[150px]">{p.hostName}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {view === 'Guide' && (
          <div className="space-y-4">
            <a href={RAILWAY_GUIDE_URL} target="_blank" className="block bg-[#0f2e26]/30 border border-emerald-500/20 p-6 rounded-3xl flex items-center justify-between hover:bg-[#0f2e26]/50 transition-all cursor-pointer group shadow-xl">
               <div className="flex gap-4 items-center">
                 <Globe size={20} className="text-emerald-500 group-hover:scale-110 transition-transform"/>
                 <div>
                   <h2 className="text-lg font-black text-emerald-400 uppercase tracking-tight leading-none flex items-center gap-2">Hub Guide Preview <ExternalLink size={14} className="opacity-40"/></h2>
                   <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1.5">What the public sees on the Community Calendar</p>
                 </div>
               </div>
               <div className="bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-2xl text-[9px] font-black uppercase border border-emerald-500/20">{activeParties.filter(p => p.pushedToPublic).length} Live</div>
            </a>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              {activeParties.filter(p => p.pushedToPublic).map(p => (
                <div key={p.id} className="bg-[#111827] border border-white/5 p-4 rounded-2xl relative overflow-hidden group text-left">
                   <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 shadow-[0_0_10px_emerald]"></div>
                   <h3 className="text-base font-black text-white uppercase mb-0.5">{p.theme}</h3>
                   <p className="text-[9px] font-bold text-indigo-400 uppercase mb-1">{p.hostName}</p>
                   <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-500"><span>{p.date.split('-').reverse().slice(0,2).join('/')}</span><span>{format12h(p.startTime)} PT</span></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(view === 'Monthly' || view === 'Weekly' || view === 'Daily') && (
          <div className="space-y-6">
            <div className="bg-[#111827] border border-white/5 rounded-xl p-3 flex items-center justify-between shadow-xl">
               <button onClick={()=>{const d=new Date(baseDate); d.setDate(d.getDate()-(view==='Weekly'?7:1)); setBaseDate(d);}} className="p-1.5 bg-[#1f2937] rounded-lg text-slate-500 hover:text-white transition-all text-left"><ChevronLeft size={18}/></button>
               <div className="flex items-center gap-2 font-black text-white uppercase tracking-widest text-xs text-center"><Calendar size={14} className="text-indigo-500"/> {baseDate.toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}</div>
               <button onClick={()=>{const d=new Date(baseDate); d.setDate(d.getDate()+(view==='Weekly'?7:1)); setBaseDate(d);}} className="p-1.5 bg-[#1f2937] rounded-lg text-slate-500 hover:text-white transition-all text-left"><ChevronRight size={18}/></button>
            </div>
            {view === 'Monthly' ? (
              <div className="grid grid-cols-7 gap-2">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="text-center text-[9px] font-black text-slate-600 uppercase mb-2">{d}</div>)}
                {Array.from({length: new Date(baseDate.getFullYear(), baseDate.getMonth(), 1).getDay()}).map((_,i)=><div key={i} className="aspect-square bg-black/10 rounded-xl"></div>)}
                {Array.from({length: new Date(baseDate.getFullYear(), baseDate.getMonth()+1, 0).getDate()}).map((_,i)=>{
                   const ds = `${baseDate.getFullYear()}-${String(baseDate.getMonth()+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
                   const has = parties.some(p => p.date === ds);
                   return (
                     <div key={i} onClick={() => { setBaseDate(new Date(ds + 'T12:00:00')); setView('Daily'); }} className="aspect-square border border-white/5 rounded-xl flex items-center justify-center hover:bg-white/5 cursor-pointer relative transition-all active:scale-95">
                       <span className="text-xs font-bold text-slate-500">{i+1}</span>
                       {has && <div className="absolute bottom-1 w-1 h-1 bg-indigo-500 rounded-full shadow-[0_0_3px_indigo]"></div>}
                     </div>
                   );
                })}
              </div>
            ) : (
              <div className="space-y-8">
                 {Array.from({length: view === 'Weekly' ? 7 : 1}).map((_,i) => {
                  const d = new Date(baseDate); d.setDate(d.getDate()+i);
                  const ds = d.toISOString().split('T')[0];
                  const daily = activeParties.filter(p => p.date === ds);
                  const style = DAY_STYLES[d.getDay()];
                  return (
                    <div key={i} className="relative pl-6">
                       <div className={`absolute left-1.5 top-1.5 bottom-0 w-0.5 ${style.border} bg-current opacity-20 rounded-full`}></div>
                       <h3 className={`text-base font-black uppercase tracking-tighter mb-3 ${style.text}`}>{d.getDate()} {d.toLocaleDateString('en-US', {weekday:'long'}).toUpperCase()}</h3>
                       <div className="space-y-2">
                         {daily.map(p => (
                           <div key={p.id} className="p-3 bg-[#111827] border border-white/5 rounded-xl flex justify-between items-center group">
                              <div>
                                <h4 className="text-sm font-black text-white uppercase">{p.theme}</h4>
                                <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">{format12h(p.startTime)} - {format12h(getEndTime(p.startTime, p.duration || 2))} PT — {p.hostName}</p>
                              </div>
                              <div className="flex gap-2">
                                {isStaff && <button onClick={()=>{setEditingId(p.id); setFormData(p); setShowForm(true);}} className="p-1.5 text-indigo-400 bg-white/5 rounded-lg hover:scale-110 transition-all"><Edit2 size={12}/></button>}
                              </div>
                           </div>
                         ))}
                         <div onClick={()=>{setEditingId(null); setFormData({hostName: currentUser.role === 'host' ? `${currentUser.username} (${currentUser.program})` : '', coHosts: '', theme: '', date: ds, startTime: '20:00', duration: 2, description: '', roomLink: '', isPublic: true, publicPushMode: 'auto'}); setShowForm(true);}} className="p-3 bg-black/20 border border-white/5 border-dashed rounded-xl flex justify-between items-center group cursor-pointer hover:bg-white/5 transition-all"><span className="text-[9px] font-black text-slate-600 uppercase">ADD TO {d.toLocaleDateString('en-US', {weekday:'short'}).toUpperCase()}</span><Plus size={14} className="text-slate-800 group-hover:text-white transition-all"/></div>
                       </div>
                    </div>
                  );
                 })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODALS */}
      {showForm && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 overflow-y-auto scrollbar-hide text-left">
          <div className="bg-[#111827] border border-white/5 rounded-3xl w-full max-w-sm p-6 relative my-auto shadow-2xl">
            <button onClick={()=>setShowForm(false)} className="absolute top-5 right-5 text-slate-500 hover:text-white transition-all"><X size={20}/></button>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-6 leading-none">{editingId ? 'EDIT REGISTRY' : 'NEW REGISTRY'}</h2>
            {formError && <div className="bg-rose-500/10 text-rose-400 p-3 rounded-xl text-[10px] font-bold uppercase mb-4 border border-rose-500/20">{formError}</div>}
            <form onSubmit={saveEvent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block">HOST</label><input required value={formData.hostName} onChange={e=>setFormData({...formData, hostName: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-indigo-500 shadow-inner"/></div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block">CO-HOST</label><input value={formData.coHosts || ''} onChange={e=>setFormData({...formData, coHosts: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-indigo-500 shadow-inner"/></div>
              </div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block">THEME TITLE</label><input required value={formData.theme} onChange={e=>setFormData({...formData, theme: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-indigo-500 shadow-inner"/></div>
              <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block">ROOM LINK</label><input value={formData.roomLink || ''} onChange={e=>setFormData({...formData, roomLink: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-bold text-xs outline-none focus:border-indigo-500 shadow-inner" placeholder="https://imvu.com/..."/></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block">DATE</label><input type="date" required value={formData.date} onChange={e=>setFormData({...formData, date: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-[10px] outline-none shadow-inner"/></div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block">TIME</label><input type="time" required value={formData.startTime} onChange={e=>setFormData({...formData, startTime: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-[10px] outline-none shadow-inner"/></div>
                <div className="space-y-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block">HRS</label><input type="number" step="0.5" required value={formData.duration} onChange={e=>setFormData({...formData, duration: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-[10px] outline-none shadow-inner"/></div>
              </div>

              {/* COMMUNITY SYNC SECTION */}
              <div className="bg-[#13231f] border border-emerald-500/10 p-4 rounded-2xl space-y-4 shadow-inner">
                <label className="flex items-start gap-4 cursor-pointer">
                  <input type="checkbox" checked={formData.isPublic} onChange={e=>setFormData({...formData, isPublic: e.target.checked})} className="mt-1 w-5 h-5 rounded text-indigo-600 bg-black border-white/10 focus:ring-0 shadow-inner"/>
                  <div className="text-left">
                    <span className="text-xs font-black uppercase text-emerald-400 tracking-tight leading-none block">COMMUNITY SYNC</span>
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">Show in Community Calendar</p>
                  </div>
                </label>
                {formData.isPublic && (
                  <div className="pl-9 pt-3 border-t border-white/5 flex flex-col gap-3 animate-in slide-in-from-top-2">
                    <div className="flex flex-col gap-2.5">
                      <label className="flex items-center gap-2.5 cursor-pointer text-[9px] font-black uppercase text-white">
                        <input type="radio" checked={formData.publicPushMode==='auto'} onChange={()=>setFormData({...formData, publicPushMode:'auto'})} className="w-3.5 h-3.5 text-indigo-600 bg-black border-white/20 focus:ring-0 appearance-none rounded-full border checked:bg-indigo-600"/> AUTO-POST (public upon approval)
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer text-[9px] font-black uppercase text-white">
                        <input type="radio" checked={formData.publicPushMode==='manual'} onChange={()=>setFormData({...formData, publicPushMode:'manual'})} className="w-3.5 h-3.5 text-emerald-600 bg-black border-white/20 focus:ring-0 appearance-none rounded-full border checked:bg-emerald-600"/> HOLD (Wait for signal)
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" disabled={isSaving} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-black uppercase text-[10px] shadow-xl active:scale-95 transition-all text-center">
                {isSaving ? "SAVING..." : (editingId ? "UPDATE PARTY" : "SUBMIT PARTY")}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/90 z-[300] flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-rose-500/20 p-8 rounded-3xl max-w-xs w-full text-center shadow-2xl">
            <Trash2 className="text-rose-500 mx-auto mb-6" size={30} /><h2 className="text-lg font-black text-white uppercase mb-2">Delete Party?</h2>
            <div className="flex gap-3"><button onClick={() => setDeleteConfirm(null)} className="flex-1 py-4 bg-[#1f2937] text-slate-400 rounded-xl font-black uppercase text-[10px] text-center">Cancel</button><button onClick={confirmDelete} className="flex-1 py-4 bg-rose-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all text-center">Delete</button></div>
          </div>
        </div>
      )}

      {showPasscodeForm && (
        <div className="fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-white/5 rounded-3xl w-full max-w-sm p-8 relative shadow-2xl">
            <button onClick={() => setShowPasscodeForm(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-all"><X size={20}/></button>
            <h2 className="text-xl font-black text-white uppercase mb-8">Security Settings</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (passcodeData.current !== currentUser.passcode) return alert("Current code incorrect.");
              if (passcodeData.new !== passcodeData.confirm) return alert("Codes mismatch.");
              await setDoc(doc(db, getPath('accounts'), currentUser.id), { ...currentUser, passcode: passcodeData.new }, { merge: true });
              logAction("Changed Passcode"); setShowPasscodeForm(false);
            }} className="space-y-5">
              <div className="space-y-1.5 relative"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Current Code</label>
                <input required type={eyeCurrent ? "text" : "password"} value={passcodeData.current} onChange={e=>setPasscodeData({...passcodeData, current: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-5 text-sm text-white outline-none font-bold shadow-inner"/>
                <button type="button" onClick={()=>setEyeCurrent(!eyeCurrent)} className="absolute right-5 top-[42px] text-slate-600 hover:text-white transition-all">{eyeCurrent?<EyeOff size={18}/>:<Eye size={18}/>}</button>
              </div>
              <div className="space-y-1.5 relative"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">New Code</label>
                <input required type={eyeNew ? "text" : "password"} value={passcodeData.new} onChange={e=>setPasscodeData({...passcodeData, new: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-5 text-sm text-white outline-none font-bold shadow-inner"/>
                <button type="button" onClick={()=>setEyeNew(!eyeNew)} className="absolute right-5 top-[42px] text-slate-600 hover:text-white transition-all">{eyeNew?<EyeOff size={18}/>:<Eye size={18}/>}</button>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase text-[11px] shadow-xl active:scale-95 transition-all mt-4 text-center">Update Security</button>
            </form>
          </div>
        </div>
      )}

      {showDash && (
        <div className="fixed inset-0 bg-[#0a0f1d] z-[250] flex flex-col p-4 sm:p-8">
          <header className="flex justify-between items-center mb-10 max-w-6xl mx-auto w-full"><h2 className="text-3xl font-black text-white uppercase tracking-tighter">Console</h2><button onClick={() => setShowDash(false)} className="p-3 bg-white/5 rounded-2xl text-slate-500 hover:text-white transition-all"><X size={24}/></button></header>
          <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col lg:flex-row gap-8 overflow-hidden">
            <nav className="flex lg:flex-col gap-2 shrink-0">
               <button onClick={()=>setDashTab('logs')} className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all text-left ${dashTab==='logs'?'bg-indigo-600 text-white shadow-xl':'bg-white/5 text-slate-500 hover:text-slate-300'}`}><FileText size={18} className="mr-3 inline"/> Activity</button>
               <button onClick={()=>setDashTab('accounts')} className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all text-left ${dashTab==='accounts'?'bg-indigo-600 text-white shadow-xl':'bg-white/5 text-slate-500 hover:text-slate-300'}`}><Shield size={18} className="mr-3 inline"/> Access Control</button>
            </nav>
            <div className="flex-1 bg-[#111827] border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
               {dashTab === 'logs' ? (
                 <div className="flex-1 overflow-y-auto p-2 scrollbar-hide text-left">
                    <table className="w-full border-collapse text-left">
                       <thead className="bg-[#0f172a] border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500 sticky top-0 z-10 text-left">
                          <tr className="text-left">
                             <th className="p-4 text-left">Time</th>
                             <th className="p-4 text-left">User</th>
                             <th className="p-4 text-left">Event</th>
                             <th className="p-4 text-left">Submitted By</th>
                             <th className="p-4 text-left">Approved By</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-white/5 text-left">
                          {actionLogs.map(l => (
                            <tr key={l.id} className="text-[10px] hover:bg-white/5 text-left">
                               <td className="p-4 font-bold text-slate-500">{l.time}</td>
                               <td className="p-4 font-black uppercase text-indigo-400">{l.username}</td>
                               <td className="p-4 font-black uppercase text-white tracking-tight">{l.action}</td>
                               <td className="p-4 font-black uppercase text-slate-400">{l.submittedBy || '---'}</td>
                               <td className="p-4 font-black uppercase text-emerald-500/70">{l.approvedBy || '---'}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
               ) : (
                 <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                       <div className="space-y-6">
                         <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2"><UserPlus size={18} className="text-indigo-500"/> Provision Account</h3>
                         <form onSubmit={async (e) => { e.preventDefault(); const id = Date.now().toString(); const n = { id, username: staffForm.u.trim(), role: staffForm.r, passcode: staffForm.p }; await setDoc(doc(db, getPath('accounts'), id), n); setStaffForm({u:'', r:'staff', p:''}); setStaffSuccess(`Active!`); setTimeout(()=>setStaffSuccess(''), 3000); }} className="space-y-4">
                           <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block">Username</label><input required value={staffForm.u} onChange={e=>setStaffForm({...staffForm, u: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white font-bold outline-none shadow-inner"/></div>
                           <div className="space-y-1.5"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block">Role</label><select value={staffForm.r} onChange={e=>setStaffForm({...staffForm, r: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white font-black uppercase outline-none shadow-inner"><option value="staff">Staff</option><option value="admin">Admin</option><option value="host">Host</option></select></div>
                           <div className="space-y-1.5 relative"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block">Passcode</label><input required type={eyeStaff ? "text" : "password"} value={staffForm.p} onChange={e=>setStaffForm({...staffForm, p: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white font-bold outline-none shadow-inner"/><button type="button" onClick={()=>setEyeStaff(!eyeStaff)} className="absolute right-4 top-[38px] text-slate-600 hover:text-white transition-all">{eyeStaff?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
                           <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all text-center">Activate Access</button>
                           {staffSuccess && <div className="text-emerald-400 font-black text-[9px] text-center mt-2 animate-pulse">{staffSuccess}</div>}
                         </form>
                       </div>
                       <div className="space-y-6">
                         <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2"><Users size={18} className="text-indigo-500"/> Registered Hub Access</h3>
                         <div className="space-y-3">{accounts.map(acc => (<div key={acc.id} className="p-4 bg-black/40 border border-white/5 rounded-2xl flex justify-between items-center group"><div><div className="text-[11px] font-black text-white uppercase">{acc.username}</div><div className="text-[8px] font-black text-indigo-500 uppercase">{acc.role}</div></div><div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all"><button onClick={()=>handleResetPassword(acc)} title="Reset Passcode" className="p-2 bg-white/5 text-slate-400 hover:text-indigo-400 rounded-lg"><RefreshCcw size={12}/></button><button onClick={async ()=>{ if(confirm(`Revoke access for ${acc.username}?`)) { await deleteDoc(doc(db, getPath('accounts'), acc.id)); logAction(`Revoked Access: ${acc.username}`); }}} className="p-2 bg-white/5 text-rose-500/60 hover:text-rose-500 rounded-lg"><Trash2 size={12}/></button></div></div>))}</div>
                       </div>
                    </div>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
