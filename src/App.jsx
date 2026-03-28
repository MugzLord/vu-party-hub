import React, { useState, useEffect } from 'react';
import { 
  Calendar, Plus, PartyPopper, X, ChevronLeft, ChevronRight, 
  CalendarDays, Edit2, Trash2, Shield, LogOut, List as ListIcon, LayoutGrid, CheckCircle, Clock3, Eye, EyeOff, Crown, FileText, Sparkles, Loader2, Send, BellRing, UserPlus, Users, Zap, Globe, Link as LinkIcon, User, ExternalLink
} from 'lucide-react';

// --- FIREBASE INTEGRATION ---
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

let firebaseConfig;
if (typeof __firebase_config !== 'undefined') {
  firebaseConfig = JSON.parse(__firebase_config);
} else {
  firebaseConfig = {
    apiKey: "AIzaSyAtGcRwrCZQH73iq181OvrF9arPIRDyeOU",
    authDomain: "vu-party-hub-c5e3a.firebaseapp.com",
    projectId: "vu-party-hub-c5e3a",
    storageBucket: "vu-party-hub-c5e3a.firebasestorage.app",
    messagingSenderId: "540765762393",
    appId: "1:540765762393:web:528879d53849dc58b35248"
  };
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const getPath = (colName) => {
  if (typeof __app_id !== 'undefined') return `artifacts/${__app_id}/public/data/${colName}`;
  return colName; 
};

// --- Static Config ---
const SESSION_KEY = 'vu_party_hub_v161_production';
const GOOGLE_FORM_LINK = 'https://docs.google.com/forms/d/e/1FAIpQLSctHRAv0mdyL8_gwnB0AIOvVDWtZzwA5UYYo_h_rZ48LBnkNQ/viewform'; 

const DAY_STYLES = [
  { name: 'Sun', border: 'border-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-400' },
  { name: 'Mon', border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  { name: 'Tue', border: 'border-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
  { name: 'Wed', border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  { name: 'Thu', border: 'border-sky-500', bg: 'bg-sky-500/10', text: 'text-sky-400' },
  { name: 'Fri', border: 'border-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
  { name: 'Sat', border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400' },
];

const timeToMins = (t) => { if(!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minsToTime = (m) => { const h = Math.floor(m / 60) % 24; const min = m % 60; return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`; };
const format12h = (t) => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const am = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${am}`; };

const getCurrentPT = () => {
  const ptDate = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
  return { 
    dateStr: `${ptDate.getFullYear()}-${String(ptDate.getMonth()+1).padStart(2,'0')}-${String(ptDate.getDate()).padStart(2,'0')}`, 
    mins: ptDate.getHours() * 60 + ptDate.getMinutes() 
  };
};

const TimelineIcon = ({ size = 24, className = "" }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5v14h18"/><path d="M9 9v10"/><path d="M15 13v6"/><path d="M21 15v4"/>
  </svg>
);

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [parties, setParties] = useState([]);
  const [actionLogs, setActionLogs] = useState([]);
  const [dbLoaded, setDbLoaded] = useState(false);

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const userRole = currentUser?.role || null;

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {}
    };
    initAuth();
    const unsubAuth = onAuthStateChanged(auth, setAuthUser);
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!authUser) return;

    const partiesCol = collection(db, getPath('parties'));
    const accountsCol = collection(db, getPath('accounts'));
    const logsCol = collection(db, getPath('actionLogs'));

    const unsubP = onSnapshot(partiesCol, (s) => setParties(s.docs.map(d => d.data())), () => {});
    
    const unsubA = onSnapshot(accountsCol, (s) => {
      const data = s.docs.map(d => d.data());
      if (data.length === 0 && !s.metadata.fromCache) {
        const defaults = [
          { id: '1', username: 'Mike', role: 'owner', passcode: 'owner123' },
          { id: '2', username: 'Ash', role: 'staff', passcode: 'ash123' }
        ];
        defaults.forEach(a => setDoc(doc(db, getPath('accounts'), a.id), a));
      }
      setAccounts(data);
      setDbLoaded(true);
    }, () => {});

    const unsubL = onSnapshot(logsCol, (s) => setActionLogs(s.docs.map(d => d.data()).sort((a,b) => b.id - a.id)), () => {});
    
    return () => { unsubP(); unsubA(); unsubL(); };
  }, [authUser]);

  const [view, setView] = useState('Guide'); 
  const [baseDate, setBaseDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ hostName: '', coHosts: '', theme: '', date: '', startTime: '', duration: 2, description: '', roomLink: '', isPublic: false, publicPushMode: 'auto' });
  
  const [gateMode, setGateMode] = useState('login');
  const [gateU, setGateU] = useState('');
  const [gateP, setGateP] = useState('');
  const [gateError, setGateError] = useState('');
  
  const [eyeLogin, setEyeLogin] = useState(false);
  const [eyeRegP, setEyeRegP] = useState(false);
  const [eyeRegC, setEyeRegC] = useState(false);
  
  const [regData, setRegData] = useState({ u: '', p: '', c: '', program: 'VUI' });
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showDash, setShowDash] = useState(false);
  const [dashTab, setDashTab] = useState('logs');
  const [showLoginSummary, setShowLoginSummary] = useState(false);
  const [formError, setFormError] = useState('');
  const [staffForm, setStaffForm] = useState({ u: '', r: 'admin', p: '' });
  const [staffSuccess, setStaffSuccess] = useState('');

  const logAction = async (msg, u = currentUser) => {
    if (!u || !authUser) return;
    const id = Date.now().toString();
    try {
      await setDoc(doc(db, getPath('actionLogs'), id), { id: Date.now(), time: new Date().toLocaleTimeString(), action: msg, username: u.username, role: u.role });
    } catch (e) {}
  };

  const getStatus = (pt) => {
    if (pt.status === 'pending') return 'pending';
    const ptM = getCurrentPT();
    const s = timeToMins(pt.startTime); const e = s + (pt.duration * 60);
    if (pt.date < ptM.dateStr) return 'ended';
    if (pt.date > ptM.dateStr) return 'upcoming';
    return (ptM.mins >= s && ptM.mins < e) ? 'live' : (ptM.mins < s ? 'upcoming' : 'ended');
  };

  const ds_is_future = (p) => {
    const ptM = getCurrentPT();
    if (p.date > ptM.dateStr) return true;
    if (p.date === ptM.dateStr && (timeToMins(p.startTime) + (p.duration*60)) > ptM.mins) return true;
    return false;
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const u = gateU.trim().toLowerCase();
    const p = gateP.trim();

    if ((u === 'mike' && p === 'owner123') || (u === 'ash' && p === 'ash123')) {
      const f = u === 'mike' ? { id: '1', username: 'Mike', role: 'owner' } : { id: '2', username: 'Ash', role: 'staff' };
      setCurrentUser(f); localStorage.setItem(SESSION_KEY, JSON.stringify(f)); setShowLoginSummary(true); return;
    }

    const match = accounts.find(a => a.username.toLowerCase() === u && a.passcode === p);
    if (match) {
      setCurrentUser(match); localStorage.setItem(SESSION_KEY, JSON.stringify(match));
      if (['owner','admin','staff'].includes(match.role)) setShowLoginSummary(true);
    } else { setGateError("Invalid credentials."); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setGateError("");
    if (regData.p !== regData.c) return setGateError("Passwords mismatch.");
    if (accounts.some(a => a.username.toLowerCase() === regData.u.trim().toLowerCase())) return setGateError("Username taken.");
    
    const n = { id: Date.now().toString(), username: regData.u.trim(), role: 'host', program: regData.program, passcode: regData.p };
    
    setCurrentUser(n); 
    localStorage.setItem(SESSION_KEY, JSON.stringify(n));
    
    try {
      await setDoc(doc(db, getPath('accounts'), n.id), n);
      logAction("Profile Created", n);
    } catch (err) {}
  };

  const handleLogout = () => { 
    setCurrentUser(null); 
    localStorage.removeItem(SESSION_KEY); 
  };

  const handleAi = async (type) => {
    setIsAiLoading(true);
    try {
      const apiKey = ""; 
      const prompt = type === 'theme' ? "Catchy 3-word party theme for influencers. No quotes." : `Hype description for "${formData.theme}". 2 sentences. No hashtags.`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      const txt = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/"/g, '') || "";
      if (type === 'theme') setFormData(p => ({ ...p, theme: txt }));
      else setFormData(p => ({ ...p, description: txt }));
    } catch (e) {}
    setIsAiLoading(false);
  };

  const saveEvent = async (e) => {
    e.preventDefault(); setFormError("");
    if (!currentUser || !authUser) return;
    const id = editingId || Date.now().toString();
    const isStaff = ['owner', 'admin', 'staff'].includes(userRole);
    const start = timeToMins(formData.startTime);
    const end = start + (formData.duration * 60);
    
    const clash = parties.find(p => p.id !== id && p.date === formData.date && start < (timeToMins(p.startTime) + p.duration * 60) && end > timeToMins(p.startTime));
    if (clash) return setFormError(`Schedule Clash: ${clash.theme}`);

    const isAuto = formData.isPublic && formData.publicPushMode === 'auto';
    const data = { 
      ...formData, 
      id, 
      status: isStaff ? (editingId ? formData.status : 'approved') : 'pending', 
      pushedToPublic: isStaff ? (editingId ? formData.pushedToPublic : isAuto) : false, 
      hostId: editingId ? formData.hostId : currentUser.id, 
      hostName: isStaff ? (formData.hostName || currentUser.username) : `${currentUser.username} (${currentUser.program})` 
    };

    try {
      await setDoc(doc(db, getPath('parties'), id), data);
      setShowForm(false); setEditingId(null);
      logAction(editingId ? `Edited ${formData.theme}` : `Created ${formData.theme}`);
    } catch (err) {
      setFormError("Sync failed. Check connection.");
    }
  };

  const handleApprove = async (p) => {
    const isAuto = p.isPublic && p.publicPushMode === 'auto';
    const updatedData = { 
      ...p, 
      status: 'approved',
      pushedToPublic: isAuto ? true : (p.pushedToPublic || false)
    };
    await setDoc(doc(db, getPath('parties'), p.id), updatedData);
    logAction(`Approved: ${p.theme}`);
  };

  const handleManualPush = async (p) => {
    const updatedData = { ...p, pushedToPublic: true };
    await setDoc(doc(db, getPath('parties'), p.id), updatedData);
    logAction(`Public Sync: ${p.theme}`);
  };

  const handleSignalReady = async (p) => {
    await setDoc(doc(db, getPath('parties'), p.id), { ...p, publicPushMode: 'ready' });
    logAction(`Host READY: ${p.theme}`);
  };

  const renderPublicGuide = () => {
    const publicParties = parties
      .filter(p => p.pushedToPublic && ds_is_future(p))
      .sort((a,b) => new Date(a.date) - new Date(b.date) || timeToMins(a.startTime) - timeToMins(b.startTime));

    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border-2 border-emerald-500/30 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between shadow-lg gap-4">
          <div>
            <h2 className="text-sm font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2"><Globe size={16}/> Community Guide</h2>
            <p className="text-[10px] text-emerald-500/70 font-bold uppercase mt-1">Official IMVU Public Schedule</p>
          </div>
          <div className="flex items-center gap-3">
            <a href={GOOGLE_FORM_LINK} target="_blank" rel="noreferrer" className="bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-emerald-500/50 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-md">
              <ExternalLink size={12}/> Submit Event
            </a>
            <div className="bg-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-black shadow-inner">
              {publicParties.length} Live
            </div>
          </div>
        </div>
        
        {publicParties.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
             <Globe size={48} className="text-emerald-500/20 mb-4"/>
             <h2 className="text-lg font-black text-slate-400 uppercase tracking-widest">No Events Listed</h2>
             <p className="text-xs text-slate-500 font-bold mt-2">Check back later for official community parties.</p>
           </div>
        ) : (
          publicParties.map(p => (
            <div key={p.id} className="bg-slate-900 border-2 border-slate-800 hover:border-emerald-500/40 transition-all rounded-2xl p-5 shadow-xl relative overflow-hidden group">
               <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"></div>
               <div className="flex justify-between items-start mb-3 pl-2">
                 <div>
                   <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tighter leading-none">{p.theme}</h3>
                   <p className="text-xs text-slate-400 font-bold uppercase mt-1.5 flex items-center gap-1.5">
                     <User size={12} className="text-indigo-400 shrink-0"/> 
                     <span className="truncate">{p.hostName}{p.coHosts ? ` + ${p.coHosts}` : ''}</span>
                   </p>
                 </div>
                 <div className="text-right shrink-0 ml-4">
                   <div className="text-xs font-black text-emerald-400 uppercase bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">{p.date.split('-').reverse().slice(0,2).join('/')}</div>
                   <div className="text-[10px] font-bold text-slate-300 mt-1.5 bg-slate-950 px-2 py-1 rounded-md border border-slate-800 inline-block shadow-inner">{format12h(p.startTime)} PT</div>
                 </div>
               </div>
               {p.description && <p className="text-xs text-slate-300 mt-4 pl-2 leading-relaxed opacity-90 border-l-2 border-slate-700 ml-1 pl-3">{p.description}</p>}
               <div className="mt-5 pl-2">
                 {p.roomLink ? (
                   <a href={p.roomLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white w-full sm:w-auto px-6 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95">
                     <LinkIcon size={14}/> Enter Room Link
                   </a>
                 ) : (
                   <span className="inline-flex items-center justify-center gap-2 bg-slate-800 text-slate-500 w-full sm:w-auto px-6 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest cursor-not-allowed">
                     <LinkIcon size={14}/> Link Pending
                   </span>
                 )}
               </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderTimeline = (days) => {
    const dates = Array.from({length: days}).map((_, i) => { 
      const d = new Date(baseDate); 
      d.setDate(d.getDate()+i); 
      return d.toISOString().split('T')[0]; 
    });

    return (
      <div className="space-y-6 md:space-y-8">
        {dates.map(ds => {
          const style = DAY_STYLES[new Date(ds + 'T00:00:00').getDay()];
          const daily = parties.filter(p => p.date === ds).sort((a,b) => timeToMins(a.startTime) - timeToMins(b.startTime));
          const blocks = []; let curM = 8 * 60;
          
          daily.forEach(p => { 
            const s = timeToMins(p.startTime); 
            if (s > curM + 29) blocks.push({ type: 'gap', s: curM, e: s }); 
            blocks.push({ type: 'party', data: p }); 
            curM = Math.max(curM, s + (p.duration * 60)); 
          });
          if (curM < 1439) blocks.push({ type: 'gap', s: curM, e: 1439 });

          return (
            <div key={ds} className="relative pl-6 md:pl-8 text-left">
              <div className={`absolute left-1 md:left-2 top-2 bottom-0 w-1 ${style.bg} rounded-full`}></div>
              <h3 className={`text-xs md:text-sm font-black uppercase tracking-widest mb-3 ${style.text}`}>
                {new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric' })}
              </h3>
              <div className="space-y-3">
                {blocks.map((b, i) => {
                  if (b.type === 'gap') {
                    return (
                      <div 
                        key={`gap-${ds}-${i}`} 
                        onClick={() => { 
                          setEditingId(null); 
                          setFormData({...formData, date: ds, startTime: minsToTime(b.s), hostName: userRole==='host'?`${currentUser?.username || ''} (${currentUser?.program || ''})` : '', coHosts: '', description: '', roomLink: '', isPublic: false, publicPushMode: 'auto'}); 
                          setShowForm(true); 
                        }} 
                        className="p-3 md:p-4 border-2 border-dashed border-slate-700 rounded-xl opacity-50 hover:opacity-100 flex justify-between items-center text-xs font-bold text-slate-400 cursor-pointer transition-all"
                      >
                        <span>{format12h(minsToTime(b.s))} - {format12h(minsToTime(b.e))} OPEN</span>
                        <Plus size={14}/>
                      </div>
                    );
                  } else {
                    return (
                      <div key={b.data.id} className={`p-4 md:p-5 bg-slate-900 border-l-4 rounded-xl shadow-lg relative group ${getStatus(b.data)==='live'?'border-rose-500 shadow-rose-500/10':'border-slate-700'}`}>
                        <div className="flex justify-between items-start mb-2">
                           <span className={`text-xs font-black px-2 py-1 rounded bg-slate-950 border border-slate-800 ${style.text}`}>
                             {format12h(b.data.startTime)}
                           </span>
                           <div className="flex gap-2">
                             {['owner','admin','staff'].includes(userRole) && b.data.status === 'pending' && (
                               <button onClick={()=>handleApprove(b.data)} className="p-2 text-emerald-400 bg-slate-950 rounded-lg hover:scale-105 transition-all shadow"><CheckCircle size={16}/></button>
                             )}
                             {['owner','admin','staff'].includes(userRole) && b.data.status === 'approved' && b.data.isPublic && !b.data.pushedToPublic && (
                               <button onClick={()=>handleManualPush(b.data)} className={`p-2 rounded-lg hover:scale-105 transition-all shadow ${b.data.publicPushMode==='ready'?'text-amber-400 bg-amber-500/10 animate-pulse':'text-blue-400 bg-slate-950'}`}><Send size={16}/></button>
                             )}
                             {(userRole==='owner' || b.data.hostId === currentUser?.id) && (
                               <button onClick={()=>{setEditingId(b.data.id); setFormData(b.data); setShowForm(true);}} className="p-2 text-indigo-400 bg-slate-950 rounded-lg hover:scale-105 transition-all shadow"><Edit2 size={16}/></button>
                             )}
                           </div>
                        </div>
                        <h4 className="text-base md:text-lg font-black text-white uppercase tracking-tight leading-tight">{b.data.theme}</h4>
                        <p className="text-xs text-slate-400 font-bold uppercase mt-1 truncate">{b.data.hostName}{b.data.coHosts ? ` + ${b.data.coHosts}` : ''}</p>
                        
                        <div className="mt-3 flex flex-wrap gap-2">
                           {b.data.status === 'pending' && (
                             <span className="text-[10px] font-black bg-amber-500/10 text-amber-500 px-2 py-1 rounded border border-amber-500/20 uppercase tracking-widest">
                               Pending Review
                             </span>
                           )}
                           {b.data.isPublic && (
                             <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black px-2 py-1 rounded uppercase border tracking-widest ${b.data.pushedToPublic ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                                  {b.data.pushedToPublic ? 'Public ✓' : 'Public (Hold)'}
                                </span>
                                {!b.data.pushedToPublic && b.data.hostId === currentUser?.id && b.data.publicPushMode === 'manual' && (
                                   <button onClick={(e) => { e.stopPropagation(); handleSignalReady(b.data); }} className="bg-slate-800 text-amber-400 text-[10px] px-2 py-1 rounded border border-slate-700 font-black uppercase hover:bg-slate-700 transition-all flex items-center gap-1.5 shadow-md">
                                     <BellRing size={12}/> Signal Ready
                                   </button>
                                )}
                             </div>
                           )}
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-left">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative animate-in fade-in zoom-in duration-300">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500"></div>
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl"><PartyPopper className="text-white w-8 h-8" /></div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase leading-none">VU Party Hub</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-black mt-2">Influencer & Storyteller Schedule</p>
          </div>
          <div className="flex border-b border-slate-800 px-6">
            <button onClick={()=>setGateMode('login')} className={`flex-1 pb-3 text-sm font-black uppercase transition-all ${gateMode==='login'?'border-b-2 border-indigo-500 text-indigo-400':'text-slate-600'}`}>Sign In</button>
            <button onClick={()=>setGateMode('register')} className={`flex-1 pb-3 text-sm font-black uppercase transition-all ${gateMode==='register'?'border-b-2 border-purple-500 text-purple-400':'text-slate-600'}`}>Register</button>
          </div>
          <div className="p-8">
            {gateError && <div className="bg-rose-500/10 text-rose-400 p-3 rounded-lg text-xs font-bold mb-4 border border-rose-500/20">{gateError}</div>}
            {gateMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <input required value={gateU} onChange={e=>setGateU(e.target.value)} placeholder="Username" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner"/>
                <div className="relative">
                  <input required type={eyeLogin?"text":"password"} value={gateP} onChange={e=>setGateP(e.target.value)} placeholder="Passcode" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner"/>
                  <button type="button" onClick={()=>setEyeLogin(!eyeLogin)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">{eyeLogin?<EyeOff size={18}/>:<Eye size={18}/>}</button>
                </div>
                <button type="submit" disabled={!dbLoaded} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-xl text-sm active:scale-95 transition-all">{dbLoaded ? 'Enter HUB' : 'Connecting...'}</button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4 text-left">
                <input required value={regData.u} onChange={e=>setRegData({...regData, u: e.target.value})} placeholder="IMVU Name" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white outline-none font-bold shadow-inner"/>
                <select value={regData.program} onChange={e=>setRegData({...regData, program: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white outline-none font-black uppercase tracking-widest shadow-inner"><option value="VUI">Influencer (VUI)</option><option value="VUS">Storyteller (VUS)</option></select>
                <div className="relative">
                  <input required type={eyeRegP?"text":"password"} value={regData.p} onChange={e=>setRegData({...regData, p: e.target.value})} placeholder="New Passcode" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white outline-none font-bold shadow-inner"/>
                  <button type="button" onClick={()=>setEyeRegP(!eyeRegP)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">{eyeRegP?<EyeOff size={18}/>:<Eye size={18}/>}</button>
                </div>
                <div className="relative">
                  <input required type={eyeRegC?"text":"password"} value={regData.c} onChange={e=>setRegData({...regData, c: e.target.value})} placeholder="Confirm Code" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white outline-none font-bold shadow-inner"/>
                  <button type="button" onClick={()=>setEyeRegC(!eyeRegC)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">{eyeRegC?<EyeOff size={18}/>:<Eye size={18}/>}</button>
                </div>
                <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-xl text-sm active:scale-95 transition-all">Create Profile</button>
              </form>
            )}
            <div className="mt-6 pt-6 border-t border-slate-800 text-center">
               <a href={GOOGLE_FORM_LINK} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 text-[11px] font-black text-slate-500 hover:text-indigo-400 uppercase tracking-widest transition-colors">
                   <ExternalLink size={14} /> Party Schedule Form
               </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans overflow-x-hidden">
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-[100] shadow-xl text-left">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 shrink-0"><PartyPopper size={20} className="text-indigo-500" /><h1 className="text-base md:text-lg font-black tracking-tighter uppercase text-white">VU HUB</h1></div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2 font-black uppercase text-[10px] text-indigo-300 shadow-inner">
               {currentUser?.role === 'owner' ? <Crown size={12} className="text-yellow-400"/> : <Shield size={12}/>}
               <span className="hidden sm:inline">{currentUser?.username}</span>
               <button onClick={handleLogout} className="text-rose-500/50 hover:text-rose-400 ml-1 transition-colors"><LogOut size={14}/></button>
            </div>
            {userRole==='owner' && <button onClick={()=>setShowDash(true)} className="p-2 bg-slate-800 rounded-lg text-indigo-400 hover:text-white transition-all shadow" title="Master Console"><FileText size={18}/></button>}
            <a href={GOOGLE_FORM_LINK} target="_blank" rel="noreferrer" className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all shadow hidden sm:block" title="Google Form">
               <ExternalLink size={18}/>
            </a>
            <button onClick={()=>{setEditingId(null); setFormData({ hostName: userRole==='host'?`${currentUser?.username} (${currentUser?.program})` : '', coHosts: '', theme: '', date: new Date().toISOString().split('T')[0], startTime: '20:00', duration: 2, description: '', roomLink: '', isPublic: false, publicPushMode: 'auto' }); setShowForm(true);}} className="bg-indigo-600 px-4 py-2 rounded-lg text-white font-black uppercase text-xs flex items-center gap-2 active:scale-90 transition-all shadow-lg"><Plus size={16}/><span className="hidden sm:inline">Schedule</span></button>
          </div>
        </div>
        <div className="flex border-t border-slate-800/50 bg-slate-950/20 overflow-x-auto px-3 py-2 gap-2 scrollbar-hide text-left">
           <button onClick={()=>setView('Guide')} className={`flex-1 min-w-[80px] py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${view==='Guide'?'bg-emerald-600 text-white shadow-md':'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}><Globe size={12} className="inline mr-1"/> Guide</button>
           <button onClick={()=>setView('List')} className={`flex-1 min-w-[80px] py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${view==='List'?'bg-indigo-500 text-white shadow-md':'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}><ListIcon size={12} className="inline mr-1"/> List</button>
           <button onClick={()=>setView('Monthly')} className={`flex-1 min-w-[80px] py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${view==='Monthly'?'bg-indigo-500 text-white shadow-md':'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}><LayoutGrid size={12} className="inline mr-1"/> Monthly</button>
           <button onClick={()=>setView('Weekly')} className={`flex-1 min-w-[80px] py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${view==='Weekly'?'bg-indigo-500 text-white shadow-md':'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}><TimelineIcon size={12} className="inline mr-1"/> Weekly</button>
           <button onClick={()=>setView('Daily')} className={`flex-1 min-w-[80px] py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${view==='Daily'?'bg-indigo-500 text-white shadow-md':'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}><CalendarDays size={12} className="inline mr-1"/> Daily</button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-6 pb-24 text-left">
        {view !== 'Guide' && (
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-3 rounded-2xl mb-6 shadow-md relative group text-left">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500/30"></div>
            <button onClick={()=>{const d=new Date(baseDate); d.setDate(d.getDate()-(view==='Weekly'?7:1)); setBaseDate(d);}} className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all"><ChevronLeft size={20}/></button>
            <div className="text-center font-black uppercase tracking-widest text-xs md:text-sm text-white flex items-center gap-2"><Calendar size={16} className="text-indigo-500" />{view==='Monthly' ? baseDate.toLocaleDateString('en-US', {month:'long', year:'numeric'}) : baseDate.toLocaleDateString('en-US', {month:'short', day:'numeric', weekday:'short'})}</div>
            <button onClick={()=>{const d=new Date(baseDate); d.setDate(d.getDate()+(view==='Weekly'?7:1)); setBaseDate(d);}} className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all"><ChevronRight size={20}/></button>
          </div>
        )}

        {view === 'Guide' ? renderPublicGuide() : view === 'Weekly' || view === 'Daily' ? renderTimeline(view==='Weekly'?7:1) : view === 'List' ? (
           <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg text-left">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                   <thead className="bg-slate-950 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-500">
                     <tr>
                       <th className="p-4 text-left">Date</th>
                       <th className="p-4 text-left">Theme / Vibe</th>
                       <th className="p-4 text-left">Host Name</th>
                       <th className="p-4 text-right">Approval</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800/50">
                      {parties
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .map((p) => {
                          const isPast = !ds_is_future(p);
                          return (
                            <tr key={p.id} className={`hover:bg-slate-800/30 transition-all text-left ${isPast ? 'opacity-40 grayscale' : ''}`}>
                               <td className="p-4 text-sm font-bold text-slate-400 uppercase tracking-tighter">
                                 {p.date.split('-').slice(1).join('/')}
                               </td>
                               <td className="p-4 text-sm font-black text-white uppercase tracking-tight">
                                 {p.theme}
                                 {isPast && <span className="ml-2 inline-block text-[9px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded shadow-inner tracking-widest border border-slate-700">ENDED</span>}
                               </td>
                               <td className="p-4 text-xs font-bold text-indigo-400 uppercase tracking-widest">
                                 {p.hostName}{p.coHosts ? ` + ${p.coHosts}` : ''}
                               </td>
                               <td className="p-4 text-right flex justify-end items-center gap-2">
                                  {p.status === 'pending' && <span className="text-[9px] font-black bg-amber-500/10 text-amber-500 px-2 py-1 rounded uppercase border border-amber-500/20">Pending</span>}
                                  {p.isPublic && <span className={`text-[9px] font-black px-2 py-1 rounded uppercase border ${p.pushedToPublic ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{p.pushedToPublic ? 'Pub ✓' : 'Hold'}</span>}
                                  
                                  {/* Action Buttons for Staff/Admin */}
                                  {['owner','admin','staff'].includes(userRole) && p.status === 'pending' && !isPast ? (
                                    <button onClick={()=>handleApprove(p)} className="text-emerald-500 ml-2 hover:scale-110 transition-all shadow"><CheckCircle size={18}/></button>
                                  ) : (
                                    <CheckCircle size={18} className={`ml-2 ${p.status==='approved'?'text-emerald-900/50':'text-slate-800'}`}/>
                                  )}
                                  
                                  {/* Send Button for List View */}
                                  {['owner','admin','staff'].includes(userRole) && p.status === 'approved' && p.isPublic && !p.pushedToPublic && !isPast && (
                                    <button onClick={()=>handleManualPush(p)} className={`ml-1 p-1.5 rounded-lg hover:scale-110 transition-all shadow ${p.publicPushMode==='ready'?'text-amber-400 bg-amber-500/10 animate-pulse':'text-blue-400 bg-slate-950'}`}><Send size={16}/></button>
                                  )}
                               </td>
                            </tr>
                          );
                        })}
                   </tbody>
                </table>
              </div>
           </div>
         ) : (
           <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 md:p-6 shadow-2xl grid grid-cols-7 gap-2 animate-in fade-in zoom-in-95 duration-500 text-left">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => <div key={`day-label-${i}`} className="text-center text-[10px] md:text-xs font-black text-slate-600 uppercase mb-2">{d}</div>)}
              {Array.from({length: new Date(baseDate.getFullYear(), baseDate.getMonth(), 1).getDay()}).map((_,i)=><div key={`grid-empty-${i}`} className="aspect-square bg-slate-950/20 rounded-xl"></div>)}
              {Array.from({ length: new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                 const dayNum = i + 1;
                 const ds = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                 const has = parties.some(p => p.date === ds);
                 const isToday = new Date().toISOString().split('T')[0] === ds;
                 return (
                   <div 
                     key={`grid-day-${ds}`} 
                     onClick={() => { setBaseDate(new Date(`${ds}T12:00:00`)); setView('Daily'); }} 
                     className={`aspect-square border rounded-xl flex items-center justify-center relative transition-all cursor-pointer ${isToday?'border-indigo-500 bg-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.2)]':'border-slate-800 hover:bg-slate-700'}`}
                   >
                     <span className={`text-xs md:text-sm font-black ${isToday?'text-indigo-400':'text-slate-400'}`}>{dayNum}</span>
                     {has ? <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,1)]"></div> : null}
                   </div>
                 );
              })}
           </div>
         )}
      </main>

      {/* FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[200] p-4 overflow-y-auto scrollbar-hide text-left">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg mx-auto my-6 relative shadow-2xl p-6 md:p-8">
             <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 rounded-xl"><Plus size={20} className="text-indigo-400"/></div>
                  <h2 className="text-base font-black text-white uppercase tracking-widest">{editingId?'Edit':'Schedule'} Registry</h2>
                </div>
                <button onClick={()=>setShowForm(false)} className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all"><X size={20}/></button>
             </div>
             
             <form onSubmit={saveEvent} className="space-y-5 text-left block">
                {formError && <div className="bg-rose-500/10 text-rose-400 p-3 rounded-lg text-[10px] font-black uppercase border border-rose-500/20">{formError}</div>}
                
                {/* Host & Co-Host Name Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                  <div className="space-y-1.5 block">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 block text-left">Main Host</label>
                    {userRole === 'host' ? (
                      <div className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl p-4 text-sm text-slate-400 font-bold shadow-inner cursor-not-allowed truncate">
                        {formData.hostName || `${currentUser?.username} (${currentUser?.program})`}
                      </div>
                    ) : (
                      <input required value={formData.hostName} onChange={e=>setFormData({...formData, hostName: e.target.value})} placeholder="e.g. Mike (VUI)" className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner"/>
                    )}
                  </div>
                  <div className="space-y-1.5 block">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 block text-left">Co-Host(s) <span className="opacity-50 lowercase">(Optional)</span></label>
                    <input value={formData.coHosts || ''} onChange={e=>setFormData({...formData, coHosts: e.target.value})} placeholder="co-hosts (Optional)" className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner"/>
                  </div>
                </div>

                <div className="space-y-1.5 block">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Theme / Vibe</label>
                    <button type="button" onClick={()=>handleAi('theme')} className="text-[10px] font-black text-indigo-400 flex items-center gap-1.5 uppercase hover:text-white transition-colors bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">
                      {isAiLoading?<Loader2 size={12} className="animate-spin"/>:<Sparkles size={12}/>} AI
                    </button>
                  </div>
                  <input required value={formData.theme} onChange={e=>setFormData({...formData, theme: e.target.value})} placeholder="Neon Gala" className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner"/>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Date</label>
                    <input type="date" required value={formData.date} onChange={e=>setFormData({...formData, date: e.target.value})} className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl p-4 text-sm text-white outline-none focus:border-indigo-500 shadow-inner"/>
                  </div>
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Time (PT)</label>
                    <input type="time" required value={formData.startTime} onChange={e=>setFormData({...formData, startTime: e.target.value})} className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl p-4 text-sm text-white outline-none focus:border-indigo-500 shadow-inner"/>
                  </div>
                </div>

                <div className="space-y-1.5 block">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Room Link <span className="opacity-50 lowercase">(Optional)</span></label>
                  <input value={formData.roomLink} onChange={e=>setFormData({...formData, roomLink: e.target.value})} placeholder="https://imvu.com/... (or to follow)" className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl p-4 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner"/>
                </div>
                
                <div className="space-y-1.5 block">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Description</label>
                    <button type="button" onClick={()=>handleAi('desc')} className="text-[10px] font-black text-purple-400 flex items-center gap-1.5 hover:text-white uppercase tracking-widest transition-colors bg-purple-500/10 px-2 py-1 rounded-md border border-purple-500/20">
                      <Zap size={12}/> Hype It
                    </button>
                  </div>
                  <textarea value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value})} rows="3" className="w-full bg-slate-950 border-2 border-slate-800 rounded-xl p-4 text-sm text-white outline-none resize-none font-medium leading-relaxed shadow-inner" placeholder="Tell everyone the vibe..."/>
                </div>

                <div className="bg-emerald-950/20 border-2 border-emerald-500/10 p-5 rounded-2xl space-y-4 text-left block shadow-inner">
                  <label className="flex items-start gap-3 cursor-pointer text-left">
                    <input type="checkbox" checked={formData.isPublic} onChange={e=>setFormData({...formData, isPublic: e.target.checked})} className="mt-1 w-5 h-5 rounded text-emerald-600 bg-slate-950 border-slate-800 focus:ring-0"/> 
                    <div>
                      <span className="text-sm font-black uppercase text-emerald-400 tracking-tighter">Community Sync</span>
                      <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">Push to official Guide on approval.</p>
                    </div>
                  </label>
                  
                  {formData.isPublic && (
                    <div className="pl-8 pt-3 border-t border-emerald-500/10 flex flex-col gap-3 text-left block animate-in slide-in-from-top-2 duration-300">
                      <label className="text-[10px] font-black text-emerald-500/50 uppercase tracking-widest block">Publishing Mode</label>
                      <div className="flex gap-6">
                        <label className="text-[11px] font-black uppercase text-slate-300 flex items-center gap-2 cursor-pointer">
                          <input type="radio" checked={formData.publicPushMode==='auto'} onChange={()=>setFormData({...formData, publicPushMode:'auto'})} className="w-4 h-4 text-emerald-600 bg-slate-950 border-slate-800 focus:ring-0"/> 
                          Immediate
                        </label>
                        <label className="text-[11px] font-black uppercase text-slate-300 flex items-center gap-2 cursor-pointer">
                          <input type="radio" checked={formData.publicPushMode==='manual'} onChange={()=>setFormData({...formData, publicPushMode:'manual'})} className="w-4 h-4 text-emerald-600 bg-slate-950 border-slate-800 focus:ring-0"/> 
                          Hold for Signal
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-xl">Confirm Registry</button>
             </form>
          </div>
        </div>
      )}

      {/* MASTER CONSOLE */}
      {showDash && userRole === 'owner' && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[150] p-4 flex items-center justify-center text-left">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl h-[90vh] flex flex-col relative overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)] animate-in slide-in-from-bottom-10 duration-500 text-left">
             <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50 shrink-0 text-left">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-yellow-500/10 rounded-lg"><Crown size={24} className="text-yellow-500"/></div>
                 <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter">Master Console</h2>
               </div>
               <button onClick={()=>setShowDash(false)} className="p-2 bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-all"><X size={24}/></button>
             </div>
             
             <div className="flex border-b border-slate-800 bg-slate-950/50 px-8 shrink-0 gap-6 overflow-x-auto scrollbar-hide">
               <button onClick={() => setDashTab('logs')} className={`py-4 text-xs font-black uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${dashTab === 'logs' ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-slate-600 hover:text-slate-400'}`}>System Logs</button>
               <button onClick={() => setDashTab('accounts')} className={`py-4 text-xs font-black uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${dashTab === 'accounts' ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-slate-600 hover:text-slate-400'}`}>Accounts</button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-hide bg-slate-950/20 text-left">
                {dashTab === 'logs' ? (
                  <div className="space-y-3 text-left">
                     {actionLogs.map(l => (
                       <div key={l.id} className="p-4 bg-slate-900 border-2 border-slate-800 rounded-2xl flex items-start gap-4 transition-all hover:border-slate-700 shadow-md text-left">
                         <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest pt-1 whitespace-nowrap">{l.time}</div>
                         <div className="text-left">
                           <p className="text-white text-sm md:text-base font-black tracking-tight mb-1 uppercase">{l.action}</p>
                           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">User: {l.username} ({l.role})</p>
                         </div>
                       </div>
                     ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-left">
                     <div className="text-left space-y-4">
                        <h3 className="text-sm font-black text-white uppercase flex items-center gap-2 tracking-tighter"><UserPlus size={18} className="text-yellow-500"/> Assign Account</h3>
                        <form onSubmit={async (e) => { 
                          e.preventDefault(); 
                          const id = Date.now().toString(); 
                          const n = { id, username: staffForm.u.trim(), role: staffForm.r, passcode: staffForm.p }; 
                          await setDoc(doc(db, getPath('accounts'), id), n); 
                          setStaffForm({u:'', r:'admin', p:''}); 
                          setStaffSuccess('Profile Activated!'); 
                          setTimeout(()=>setStaffSuccess(''), 5000); 
                        }} className="space-y-3 bg-slate-900 border-2 border-slate-800 p-5 rounded-2xl shadow-xl text-left block">
                           {staffSuccess && <div className="bg-emerald-500/10 text-emerald-400 p-3 rounded-lg text-xs font-black uppercase border border-emerald-500/20 tracking-widest">{staffSuccess}</div>}
                           <input required value={staffForm.u} onChange={e=>setStaffForm({...staffForm, u: e.target.value})} placeholder="IMVU Name" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-yellow-500 outline-none font-bold shadow-inner"/>
                           <select value={staffForm.r} onChange={e=>setStaffForm({...staffForm, r: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-white outline-none font-black uppercase tracking-widest"><option value="admin">Administrator</option><option value="staff">Staff Profile</option><option value="host">Host (Manual)</option></select>
                           <input required value={staffForm.p} onChange={e=>setStaffForm({...staffForm, p: e.target.value})} placeholder="Secret Code" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white focus:border-yellow-500 outline-none font-bold shadow-inner"/>
                           <button type="submit" className="w-full bg-yellow-500 text-slate-950 py-4 rounded-xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-lg">Confirm Activation</button>
                        </form>
                     </div>
                     <div className="space-y-3 text-left">
                        <h3 className="text-sm font-black text-white uppercase flex items-center gap-2 tracking-tighter"><Users size={18} className="text-indigo-400"/> Current Profiles</h3>
                        {accounts.map(a => (
                          <div key={`acc-${a.id}`} className="p-4 bg-slate-900 border-2 border-slate-800 rounded-2xl flex items-center justify-between text-left shadow-md">
                            <div className="flex items-center gap-4">
                              <div className="p-2 bg-slate-950 rounded-lg border border-slate-800"><Shield size={16} className={a.role==='owner'?'text-yellow-500':'text-indigo-400'}/></div>
                              <div>
                                <p className="text-sm font-black text-white uppercase tracking-tight">{a.username}</p>
                                <p className="text-[10px] font-bold text-slate-500 uppercase mt-1 tracking-widest">{a.role}</p>
                              </div>
                            </div>
                            {a.role !== 'owner' && <button onClick={()=>deleteDoc(doc(db, getPath('accounts'), a.id))} className="p-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition-all"><Trash2 size={16}/></button>}
                          </div>
                        ))}
                     </div>
                  </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* LOGIN SUMMARY */}
      {showLoginSummary && currentUser && (['owner', 'admin', 'staff'].includes(userRole)) && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[300] flex items-center justify-center p-6 animate-in fade-in duration-500 text-left">
           <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl w-full max-w-sm shadow-[0_0_100px_rgba(0,0,0,1)] relative overflow-hidden text-center p-8 text-left">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
              <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/20">
                {currentUser?.role === 'owner' ? <Crown className="w-10 h-10 text-yellow-400" /> : <Shield className="w-10 h-10 text-indigo-400" />}
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-white mb-2 tracking-tighter uppercase leading-none text-center">Welcome, {currentUser?.username}!</h2>
              
              <div className="space-y-3 my-8 text-left block">
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg"><Clock3 size={18} className="text-amber-400" /></div>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">Pending Review</span>
                  </div>
                  <span className="text-2xl font-black text-amber-400">{parties.filter(p => p.status === 'pending').length}</span>
                </div>
                
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg"><Send size={18} className="text-blue-400" /></div>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">Ready to Push</span>
                  </div>
                  <span className="text-2xl font-black text-blue-400">{parties.filter(p => p.status === 'approved' && p.isPublic && !p.pushedToPublic && p.publicPushMode === 'ready').length}</span>
                </div>
              </div>
              
              <button onClick={() => setShowLoginSummary(false)} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-5 rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all text-sm shadow-2xl">Enter Hub Dashboard</button>
           </div>
        </div>
      )}
    </div>
  );
}
