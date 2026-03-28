import React, { useState, useEffect } from 'react';
import { 
  Calendar, Plus, PartyPopper, X, ChevronLeft, ChevronRight, 
  CalendarDays, Edit2, Trash2, Shield, LogOut, List as ListIcon, LayoutGrid, CheckCircle, Clock3, Eye, EyeOff, Crown, FileText, Sparkles, Loader2, Send, BellRing, UserPlus, Users, Zap, Globe, Link as LinkIcon, User, ExternalLink, Key, RefreshCcw
} from 'lucide-react';

// --- FIREBASE INTEGRATION ---
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

// Safe environment variable access for Vercel & Canvas Compiler
const getViteEnv = (key) => {
  try {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
    return env[key] || null;
  } catch (e) { return null; }
};

let firebaseConfig;
if (typeof __firebase_config !== 'undefined' && __firebase_config) {
  firebaseConfig = JSON.parse(__firebase_config);
} else {
  firebaseConfig = {
    apiKey: getViteEnv('VITE_FIREBASE_API_KEY'),
    authDomain: getViteEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: getViteEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getViteEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getViteEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getViteEnv('VITE_FIREBASE_APP_ID')
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
const SESSION_KEY = 'vu_party_hub_v330_compact_pro';
const GOOGLE_FORM_LINK = 'https://docs.google.com/forms/d/e/1FAIpQLSctHRAv0mdyL8_gwnB0AIOvVDWtZzwA5UYYo_h_rZ48LBnkNQ/viewform'; 

const DAY_STYLES = [
  { name: 'Sun', border: 'border-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-500' },
  { name: 'Mon', border: 'border-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  { name: 'Tue', border: 'border-yellow-500', bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
  { name: 'Wed', border: 'border-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  { name: 'Thu', border: 'border-sky-500', bg: 'bg-sky-500/10', text: 'text-sky-500' },
  { name: 'Fri', border: 'border-indigo-500', bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
  { name: 'Sat', border: 'border-fuchsia-500', bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-500' },
];

const timeToMins = (t) => { if(!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const format12h = (t) => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const am = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${am}`; };
const getCurrentPT = () => {
  const ptDate = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
  return { 
    dateStr: `${ptDate.getFullYear()}-${String(ptDate.getMonth()+1).padStart(2,'0')}-${String(ptDate.getDate()).padStart(2,'0')}`, 
    mins: ptDate.getHours() * 60 + ptDate.getMinutes() 
  };
};

const ds_is_future = (p) => {
  const ptM = getCurrentPT();
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
  
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const userRole = currentUser?.role || null;
  const isStaff = ['owner', 'admin', 'staff'].includes(userRole);

  const [view, setView] = useState('List'); 
  const [showAuthGate, setShowAuthGate] = useState(!currentUser);
  const [gateMode, setGateMode] = useState('login');
  const [eyeLogin, setEyeLogin] = useState(false);
  const [gateU, setGateU] = useState('');
  const [gateP, setGateP] = useState('');
  const [gateError, setGateError] = useState('');
  const [regData, setRegData] = useState({ u: '', p: '', c: '', program: 'VUI' });
  
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ hostName: '', theme: '', date: '', startTime: '20:00', duration: 2, description: '', roomLink: '', isPublic: true, publicPushMode: 'auto' });
  
  const [baseDate, setBaseDate] = useState(new Date());
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showPasscodeForm, setShowPasscodeForm] = useState(false);
  const [passcodeData, setPasscodeData] = useState({ current: '', new: '', confirm: '' });
  const [showDash, setShowDash] = useState(false);
  const [dashTab, setDashTab] = useState('logs');
  const [staffForm, setStaffForm] = useState({ u: '', r: 'staff', p: '' });
  const [staffSuccess, setStaffSuccess] = useState('');

  // Automatic sort logic for parties
  const sortedParties = [...parties].sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    return a.startTime.localeCompare(b.startTime);
  });

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
    onSnapshot(collection(db, getPath('parties')), (s) => setParties(s.docs.map(d => d.data())), () => {});
    onSnapshot(collection(db, getPath('accounts')), (s) => {
      setAccounts(s.docs.map(d => d.data()));
      setDbLoaded(true);
    }, () => {});
    onSnapshot(collection(db, getPath('actionLogs')), (s) => {
      setActionLogs(s.docs.map(d => d.data()).sort((a,b) => b.id - a.id));
    }, () => {});
  }, [authUser]);

  const logAction = async (msg, u = currentUser) => {
    if (!u || !authUser) return;
    const id = Date.now().toString();
    await setDoc(doc(db, getPath('actionLogs'), id), { 
      id: Date.now(), 
      time: new Date().toLocaleTimeString(), 
      action: msg, 
      username: u.username, 
      role: u.role 
    });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const u = gateU.trim().toLowerCase();
    const p = gateP.trim();
    const match = accounts.find(a => a.username.toLowerCase() === u && a.passcode === p);
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
    const id = editingId || Date.now().toString();
    const data = { 
      ...formData, 
      id, 
      status: isStaff ? 'approved' : 'pending', 
      pushedToPublic: isStaff ? (formData.isPublic && formData.publicPushMode === 'auto') : false, 
      hostId: editingId ? formData.hostId : currentUser.id,
      hostName: editingId ? formData.hostName : (currentUser.role === 'host' ? `${currentUser.username} (${currentUser.program})` : formData.hostName)
    };
    await setDoc(doc(db, getPath('parties'), id), data);
    setShowForm(false); setEditingId(null);
    logAction(editingId ? `Edited ${formData.theme}` : `Submitted ${formData.theme}`);
  };

  const handleUnpublish = (p) => { setDoc(doc(db, getPath('parties'), p.id), { ...p, pushedToPublic: false }); logAction(`Unpublished ${p.theme}`); };
  const handleApprove = (p) => { setDoc(doc(db, getPath('parties'), p.id), { ...p, status: 'approved', pushedToPublic: p.publicPushMode === 'auto' }); logAction(`Approved ${p.theme}`); };
  const handleManualPush = (p) => { setDoc(doc(db, getPath('parties'), p.id), { ...p, pushedToPublic: true }); logAction(`Published ${p.theme}`); };
  const handleSignalReady = (p) => { setDoc(doc(db, getPath('parties'), p.id), { ...p, publicPushMode: 'ready' }); logAction(`Host Signal Ready: ${p.theme}`); };
  const confirmDelete = async () => { if (deleteConfirm) { await deleteDoc(doc(db, getPath('parties'), deleteConfirm.id)); logAction(`Deleted ${deleteConfirm.theme}`); setDeleteConfirm(null); } };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    const id = Date.now().toString();
    const n = { id, username: staffForm.u.trim(), role: staffForm.r, passcode: staffForm.p };
    await setDoc(doc(db, getPath('accounts'), id), n);
    setStaffForm({u:'', r:'staff', p:''});
    setStaffSuccess(`Account Activated!`);
    setTimeout(()=>setStaffSuccess(''), 3000);
  };

  const handleResetPassword = async (acc) => {
    const newPass = prompt(`New code for ${acc.username}:`);
    if (newPass) {
      await setDoc(doc(db, getPath('accounts'), acc.id), { ...acc, passcode: newPass.trim() }, { merge: true });
      alert("Reset successful.");
    }
  };

  if (showAuthGate || !currentUser) {
    return (
      <div className="min-h-screen bg-[#0a0f1d] flex items-center justify-center p-4 font-sans text-left text-slate-200">
        <div className="w-full max-w-md">
          <div className="text-center mb-10"><h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">VU Party Hub</h1><p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-2">Influencer & Storyteller Schedule</p></div>
          <div className="bg-[#111827] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex border-b border-white/5"><button onClick={()=>setGateMode('login')} className={`flex-1 py-5 text-[11px] font-black uppercase tracking-widest transition-all ${gateMode==='login'?'text-indigo-400 border-b-2 border-indigo-500 bg-white/5':'text-slate-600 hover:text-slate-400'}`}>Sign In</button><button onClick={()=>setGateMode('register')} className={`flex-1 py-5 text-[11px] font-black uppercase tracking-widest transition-all ${gateMode==='register'?'text-indigo-400 border-b-2 border-indigo-500 bg-white/5':'text-slate-600 hover:text-slate-400'}`}>Register</button></div>
            <div className="p-8 pt-10">
              {gateError && <div className="bg-red-500/10 text-red-400 p-3 rounded-xl text-[10px] font-bold uppercase mb-4 border border-red-500/20">{gateError}</div>}
              <form onSubmit={gateMode === 'login' ? handleLogin : handleRegister} className="space-y-6">
                <div className="space-y-1.5 text-left"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Username</label><input required value={gateMode === 'login' ? gateU : regData.u} onChange={e=> gateMode === 'login' ? setGateU(e.target.value) : setRegData({...regData, u: e.target.value})} placeholder="Username" className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner placeholder:text-slate-800"/></div>
                {gateMode === 'register' && (<div className="space-y-1.5 text-left"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Program</label><select value={regData.program} onChange={e=>setRegData({...regData, program: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-sm text-white outline-none font-black uppercase tracking-widest shadow-inner appearance-none cursor-pointer"><option value="VUI">Influencer (VUI)</option><option value="VUS">Storyteller (VUS)</option></select></div>)}
                <div className="space-y-1.5 relative text-left"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Passcode</label><input required type={eyeLogin?"text":"password"} value={gateMode === 'login' ? gateP : regData.p} onChange={e=> gateMode === 'login' ? setGateP(e.target.value) : setRegData({...regData, p: e.target.value})} placeholder="Passcode" className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner placeholder:text-slate-800"/><button type="button" onClick={()=>setEyeLogin(!eyeLogin)} className="absolute right-5 top-[42px] text-slate-600 hover:text-white transition-colors">{eyeLogin?<EyeOff size={20}/>:<Eye size={20}/>}</button></div>
                {gateMode === 'register' && (<div className="space-y-1.5 text-left"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Confirm</label><input required type="password" value={regData.c} onChange={e=>setRegData({...regData, c: e.target.value})} placeholder="Confirm Passcode" className="w-full bg-black/40 border border-white/10 rounded-2xl p-5 text-sm text-white focus:border-indigo-500 outline-none font-bold shadow-inner"/></div>)}
                <button type="submit" disabled={!dbLoaded} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 mt-4 text-[11px]">ENTER HUB</button>
              </form>
              <div className="mt-8 pt-6 border-t border-white/5 text-center"><a href={GOOGLE_FORM_LINK} target="_blank" className="text-[10px] font-black text-slate-600 hover:text-indigo-400 uppercase tracking-widest transition-colors flex items-center justify-center gap-2"><ExternalLink size={14}/> Party Request Form</a></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-200 flex flex-col font-sans overflow-x-hidden text-left">
      <header className="bg-[#111827] border-b border-white/5 p-3 sticky top-0 z-[100] flex justify-between items-center shadow-xl">
        <div className="flex items-center gap-2 shrink-0"><div className="w-8 h-8 bg-indigo-600/10 rounded-lg flex items-center justify-center border border-indigo-500/30"><CalendarDays size={18} className="text-indigo-500" /></div><h1 className="font-black uppercase tracking-tighter text-base hidden sm:block text-left">VU HUB</h1></div>
        <div className="flex gap-2 items-center text-left"><div className="bg-[#1f2937] px-4 py-1.5 rounded-full flex items-center gap-2 font-black uppercase text-[9px] text-indigo-400 border border-white/5 shadow-inner text-left">{currentUser.role === 'owner' ? <Crown size={12} className="text-yellow-500"/> : <Shield size={12}/>}{currentUser.username}<button onClick={() => setShowPasscodeForm(true)} title="Change Passcode" className="ml-1 opacity-40 hover:opacity-100 transition-opacity"><Key size={14}/></button></div>{currentUser.role === 'owner' && (<button onClick={()=>{setDashTab('logs'); setShowDash(true);}} className="p-1.5 bg-[#1f2937] rounded-lg text-slate-400 hover:text-white border border-white/5 shadow"><FileText size={16}/></button>)}<a href={GOOGLE_FORM_LINK} target="_blank" className="p-1.5 bg-[#1f2937] rounded-lg text-slate-400 hover:text-white border border-white/5 shadow"><ExternalLink size={16}/></a><button onClick={()=>{setEditingId(null); setShowForm(true);}} className="bg-indigo-600 px-4 py-1.5 rounded-xl text-white font-black uppercase text-[9px] shadow-lg active:scale-90 transition-all">+ Schedule</button><button onClick={()=>{setCurrentUser(null); localStorage.removeItem(SESSION_KEY); setShowAuthGate(true);}} className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"><LogOut size={16}/></button></div>
      </header>

      <div className="bg-[#111827]/50 border-b border-white/5 flex overflow-x-auto gap-1 p-2 scrollbar-hide">
         {['Guide', 'List', 'Pending', 'Monthly', 'Weekly', 'Daily'].map(t => {
            if (t === 'Pending' && !isStaff) return null;
            return (
              <button key={t} onClick={()=>setView(t)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 ${view===t ? (t === 'Guide' ? 'bg-emerald-600 text-white shadow-md' : 'bg-indigo-600 text-white shadow-md') : 'bg-[#1f2937] text-slate-500 hover:text-slate-300'}`}>
                {t === 'Guide' && <Globe size={12}/>}{t === 'List' && <ListIcon size={12}/>}{t === 'Pending' && <Clock3 size={12}/>}{t === 'Monthly' && <LayoutGrid size={12}/>}{t === 'Weekly' && <CalendarDays size={12}/>}{t === 'Daily' && <Clock3 size={12}/>}{t === 'Pending' ? `Pending (${parties.filter(p=>p.status==='pending').length})` : t}
              </button>
            );
         })}
      </div>

      <main className="flex-1 p-2 sm:p-4 max-w-6xl mx-auto w-full text-left">
        {(view === 'List' || view === 'Pending') && (
          <div className="bg-[#111827] border border-white/5 rounded-2xl overflow-hidden shadow-2xl text-left">
            <div className="overflow-x-auto text-left"><table className="w-full text-left border-collapse"><thead className="bg-[#0f172a] border-b border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Theme</th><th className="p-3 text-left">Host</th><th className="p-3 text-right">Approval</th></tr></thead>
                <tbody className="divide-y divide-white/5 text-[11px] text-left">
                  {sortedParties.filter(p => view === 'Pending' ? p.status === 'pending' : true).map(p => (
                    <tr key={p.id} className="hover:bg-white/5 transition-all text-left">
                      <td className="p-3 text-slate-400 font-bold uppercase">{p.date.split('-').slice(1).reverse().join('/')}</td>
                      <td className="p-3 text-white font-black uppercase">{p.theme}</td>
                      <td className="p-3 text-indigo-400 font-bold uppercase">{p.hostName}</td>
                      <td className="p-3 text-right flex justify-end gap-2 items-center text-left">
                          {p.status === 'pending' ? (
                            isStaff ? (
                              <button onClick={()=>handleApprove(p)} className="p-1.5 text-emerald-400 bg-emerald-500/10 rounded-lg border border-emerald-500/20 hover:scale-105 transition-all"><CheckCircle size={16}/></button>
                            ) : (<div className="flex items-center gap-1 text-amber-500 bg-amber-500/5 border border-amber-500/20 px-2 py-1 rounded-lg"><Clock3 size={12}/> <span className="text-[8px] font-black uppercase tracking-widest">Pending</span></div>)
                          ) : (
                            isStaff ? (
                               p.pushedToPublic ? <button onClick={()=>handleUnpublish(p)} title="Unpublish" className="p-1.5 text-rose-400 bg-rose-500/10 rounded-lg hover:scale-105 transition-all"><EyeOff size={16}/></button> :
                               (p.publicPushMode === 'ready' || p.publicPushMode === 'auto') ? <button onClick={()=>handleManualPush(p)} title="Publish" className="p-1.5 text-indigo-400 bg-indigo-500/10 rounded-lg hover:scale-105 transition-all"><Send size={16}/></button> :
                               <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest px-2 py-1 bg-white/5 rounded border border-white/5">Hold</div>
                            ) : (
                               !p.pushedToPublic && p.publicPushMode === 'manual' && (<button onClick={() => handleSignalReady(p)} className="flex items-center gap-1 text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded hover:bg-amber-400/20 transition-all"><BellRing size={12}/> <span className="text-[8px] font-black uppercase tracking-widest">Signal Ready</span></button>)
                            )
                          )}
                          <button onClick={()=>{setEditingId(p.id); setFormData(p); setShowForm(true);}} className="p-1.5 text-slate-400 hover:text-white transition-all"><Edit2 size={14}/></button>
                          {['owner','admin'].includes(userRole) && <button onClick={()=>setDeleteConfirm(p)} className="p-1.5 text-rose-500/60 hover:text-rose-500 transition-all"><Trash2 size={14}/></button>}
                      </td></tr>))}
                  {parties.filter(p => view === 'Pending' ? p.status === 'pending' : true).length === 0 && (
                    <tr><td colSpan="4" className="p-10 text-center text-slate-700 font-black uppercase text-[9px] tracking-widest opacity-30">No activities found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {view === 'Guide' && (
           <div className="space-y-4 text-left">
              <div className="bg-[#0f2e26]/30 border border-emerald-500/20 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl text-left">
                 <div className="flex gap-4 items-center">
                   <Globe size={20} className="text-emerald-500"/>
                   <div className="text-left"><h2 className="text-lg font-black text-emerald-400 uppercase tracking-tight leading-none">Hub Guide Preview</h2><p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1.5 leading-none">What the public sees on the Official tab</p></div>
                 </div>
                 <div className="bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-2xl text-[9px] font-black uppercase border border-emerald-500/20">{parties.filter(p => p.pushedToPublic && ds_is_future(p)).length} Live</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedParties.filter(p => p.pushedToPublic && ds_is_future(p)).map(p => (
                  <div key={p.id} className="bg-[#111827] border border-white/5 p-4 rounded-2xl relative overflow-hidden group text-left">
                     <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 shadow-[0_0_10px_emerald]"></div>
                     <h3 className="text-base font-black text-white uppercase mb-0.5">{p.theme}</h3>
                     <p className="text-[9px] font-bold text-indigo-400 uppercase mb-3">{p.hostName}</p>
                     <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-500">
                        <span>{p.date.split('-').reverse().slice(0,2).join('/')}</span>
                        <span>{format12h(p.startTime)} PT</span>
                     </div>
                  </div>
                ))}
              </div>
           </div>
        )}

        {(view === 'Weekly' || view === 'Daily' || view === 'Monthly') && (
           <div className="space-y-6 text-left">
              <div className="bg-[#111827] border border-white/5 rounded-xl p-3 flex items-center justify-between shadow-xl">
                 <button onClick={()=>{const d=new Date(baseDate); d.setDate(d.getDate()-(view==='Weekly'?7:1)); setBaseDate(d);}} className="p-1.5 bg-[#1f2937] rounded-lg text-slate-500 hover:text-white transition-all"><ChevronLeft size={18}/></button>
                 <div className="flex items-center gap-2 font-black text-white uppercase tracking-widest text-xs text-center"><Calendar size={14} className="text-indigo-500"/> {baseDate.toLocaleDateString('en-US', {month: 'long', year: 'numeric'})}</div>
                 <button onClick={()=>{const d=new Date(baseDate); d.setDate(d.getDate()+(view==='Weekly'?7:1)); setBaseDate(d);}} className="p-1.5 bg-[#1f2937] rounded-lg text-slate-500 hover:text-white transition-all"><ChevronRight size={18}/></button>
              </div>
              {view === 'Monthly' ? (
                <div className="grid grid-cols-7 gap-2 text-left">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="text-center text-[9px] font-black text-slate-600 uppercase mb-2">{d}</div>)}
                  {Array.from({length: new Date(baseDate.getFullYear(), baseDate.getMonth(), 1).getDay()}).map((_,i)=><div key={i} className="aspect-square bg-black/10 rounded-xl"></div>)}
                  {Array.from({length: new Date(baseDate.getFullYear(), baseDate.getMonth()+1, 0).getDate()}).map((_,i)=>{
                     const ds = `${baseDate.getFullYear()}-${String(baseDate.getMonth()+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
                     const has = parties.some(p => p.date === ds);
                     return (
                       <div key={i} 
                         onClick={() => { setBaseDate(new Date(ds + 'T12:00:00')); setView('Daily'); }}
                         className={`aspect-square border border-white/5 rounded-xl flex items-center justify-center hover:bg-white/5 cursor-pointer text-left relative active:scale-95 transition-all`}>
                         <span className="text-xs font-bold text-slate-500">{i+1}</span>
                         {has && <div className="absolute bottom-1 w-1 h-1 bg-indigo-500 rounded-full shadow-[0_0_3px_indigo]"></div>}
                       </div>
                     );
                  })}
                </div>
              ) : (
                <div className="space-y-8 text-left">
                   {Array.from({length: view === 'Weekly' ? 7 : 1}).map((_,i) => {
                    const d = new Date(baseDate); d.setDate(d.getDate()+i);
                    const ds = d.toISOString().split('T')[0];
                    const daily = sortedParties.filter(p => p.date === ds);
                    const style = DAY_STYLES[d.getDay()];
                    return (
                      <div key={i} className="relative pl-6 text-left">
                         <div className={`absolute left-1.5 top-1.5 bottom-0 w-0.5 ${style.border} bg-current opacity-20 rounded-full`}></div>
                         <h3 className={`text-base font-black uppercase tracking-tighter mb-3 ${style.text}`}>{d.getDate()} {d.toLocaleDateString('en-US', {weekday:'long'}).toUpperCase()}</h3>
                         <div className="space-y-2 text-left">
                           {daily.map(p => (
                             <div key={p.id} className="p-3 bg-[#111827] border border-white/5 rounded-xl flex justify-between items-center group text-left">
                                <div className="text-left"><h4 className="text-sm font-black text-white uppercase text-left">{p.theme}</h4><p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5 text-left">{format12h(p.startTime)} PT — {p.hostName}</p></div>
                                <div className="flex gap-2">
                                  <button onClick={()=>{setEditingId(p.id); setFormData(p); setShowForm(true);}} className="p-1.5 text-indigo-400 bg-white/5 rounded-lg"><Edit2 size={12}/></button>
                                  {isStaff && <button onClick={()=>setDeleteConfirm(p)} className="p-1.5 text-rose-500/60 bg-white/5 rounded-lg"><Trash2 size={12}/></button>}
                                </div>
                             </div>
                           ))}
                           <div onClick={()=>{setEditingId(null); setFormData({...formData, date: ds}); setShowForm(true);}} className="p-3 bg-black/20 border border-white/5 rounded-xl border-dashed flex justify-between items-center group cursor-pointer hover:bg-white/5 transition-all text-left"><span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">8:00 AM - 11:59 PM OPEN</span><Plus size={14} className="text-slate-800 group-hover:text-white transition-all"/></div>
                         </div>
                      </div>
                    );
                  })}
                </div>
              )}
           </div>
        )}
      </main>

      {/* SYSTEM CONSOLE MODAL */}
      {showDash && currentUser.role === 'owner' && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 overflow-y-auto scrollbar-hide text-left"><div className="bg-[#111827] border border-white/5 rounded-3xl w-full max-w-3xl h-[75vh] flex flex-col relative shadow-[0_0_100px_black] animate-in zoom-in-95 text-left"><div className="p-6 pb-0 flex justify-between items-start text-left"><div><h2 className="text-xl font-black text-white uppercase tracking-tighter mb-4 leading-none text-left">MASTER CONSOLE</h2><div className="flex gap-6 border-b border-white/5 text-left"><button onClick={()=>setDashTab('logs')} className={`pb-3 text-[9px] font-black uppercase tracking-widest transition-all ${dashTab==='logs'?'text-indigo-400 border-b-2 border-indigo-500':'text-slate-600'}`}>SYSTEM LOGS</button><button onClick={()=>setDashTab('accounts')} className={`pb-3 text-[9px] font-black uppercase tracking-widest transition-all ${dashTab==='accounts'?'text-indigo-400 border-b-2 border-indigo-500':'text-slate-600'}`}>PROFILES</button></div></div><button onClick={()=>setShowDash(false)} className="p-1.5 bg-[#1f2937] rounded-lg text-slate-500 hover:text-white transition-all"><X size={20}/></button></div><div className="flex-1 overflow-y-auto p-6 pt-4 text-left">{dashTab === 'logs' ? (<div className="space-y-2 text-left">{actionLogs.map(l => (<div key={l.id} className="p-3 bg-black/20 border border-white/5 rounded-xl flex items-center gap-4 hover:bg-black/30 transition-all text-left text-left"><span className="text-[8px] font-black text-indigo-500 uppercase whitespace-nowrap opacity-60 font-mono text-left">{l.time}</span><span className="text-xs font-black text-white uppercase tracking-tight flex-1 text-left text-left">{l.action}</span><div className="text-[8px] font-bold text-slate-600 uppercase bg-[#1f2937] px-2 py-1 rounded shadow-inner text-left">{l.username}</div></div>))}</div>) : (<div className="space-y-8 text-left text-left"><div className="bg-indigo-600/5 border border-indigo-500/20 p-5 rounded-2xl text-left text-left text-left"><h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2 text-left text-left text-left"><UserPlus size={12}/> ACTIVATE PROFILE</h3>{staffSuccess && <div className="bg-emerald-500/10 text-emerald-400 p-2 rounded-lg text-[8px] font-bold uppercase mb-3 border border-emerald-500/20">{staffSuccess}</div>}<form onSubmit={handleCreateAccount} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left text-left"><input required value={staffForm.u} onChange={e=>setStaffForm({...staffForm, u: e.target.value})} placeholder="IMVU Name" className="bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] text-white outline-none font-bold shadow-inner"/><select value={staffForm.r} onChange={e=>setStaffForm({...staffForm, r: e.target.value})} className="bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] text-white outline-none font-black uppercase tracking-widest cursor-pointer appearance-none"><option value="admin">Administrator</option><option value="staff">Staff Profile</option><option value="host">Host (Manual)</option></select><input required value={staffForm.p} onChange={e=>setStaffForm({...staffForm, p: e.target.value})} placeholder="Secret Passcode" className="bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] text-white outline-none font-bold shadow-inner"/><button type="submit" className="bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-indigo-500 transition-all shadow-lg active:scale-95">ACTIVATE ACCOUNT</button></form></div><div className="space-y-3 text-left text-left"><h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 text-left text-left text-left"><Users size={12}/> EXISTING PROFILES</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left text-left">{accounts.map(a => (<div key={a.id} className="p-3 bg-black/20 border border-white/5 rounded-xl flex items-center justify-between group text-left text-left"><div className="flex items-center gap-3 text-left">{a.role === 'owner' ? <Crown className="text-yellow-500" size={14}/> : <Shield className="text-indigo-500" size={14}/>}<div className="text-left text-left text-left"><p className="text-xs font-black text-white uppercase text-left">{a.username}</p><p className="text-[7px] font-bold text-slate-600 uppercase tracking-widest text-left">{a.role}</p></div></div><div className="flex gap-1.5 text-left"><button onClick={()=>handleResetPassword(a)} title="Reset Password" className="p-1.5 text-indigo-400/40 hover:text-indigo-400 bg-white/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"><RefreshCcw size={12}/></button>{a.role !== 'owner' && (<button onClick={()=>deleteDoc(doc(db, getPath('accounts'), a.id))} className="p-1.5 text-rose-500/40 hover:text-rose-500 bg-rose-500/5 rounded-lg transition-all"><Trash2 size={12}/></button>)}</div></div>))}</div></div></div>)}</div></div></div>
      )}

      {/* NEW REGISTRY MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 overflow-y-auto scrollbar-hide text-left text-left"><div className="bg-[#111827] border border-white/5 rounded-3xl w-full max-w-sm p-6 relative my-auto shadow-2xl text-left text-left"><button onClick={()=>setShowForm(false)} className="absolute top-5 right-5 text-slate-500 hover:text-white transition-all text-left"><X size={20}/></button><h2 className="text-xl font-black text-white uppercase tracking-tighter mb-6 leading-none text-left text-left">NEW REGISTRY</h2><form onSubmit={saveEvent} className="space-y-4 text-left text-left"><div className="grid grid-cols-2 gap-3 text-left text-left"><div className="space-y-1 text-left text-left"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block text-left">HOST</label><input required value={formData.hostName} onChange={e=>setFormData({...formData, hostName: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-indigo-500 font-bold shadow-inner text-xs text-left"/></div><div className="space-y-1 text-left text-left"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block text-left">CO-HOST</label><input value={formData.coHosts || ''} onChange={e=>setFormData({...formData, coHosts: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-indigo-500 font-bold shadow-inner text-xs text-left"/></div></div><div className="space-y-1 text-left text-left"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block text-left">THEME TITLE</label><input required value={formData.theme} onChange={e=>setFormData({...formData, theme: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-indigo-500 font-bold shadow-inner text-xs text-left"/></div>
                 <div className="space-y-1 text-left text-left"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block text-left">ROOM LINK</label><input value={formData.roomLink} onChange={e=>setFormData({...formData, roomLink: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-indigo-500 font-bold shadow-inner text-xs text-left" placeholder="https://imvu.com/..."/></div>
                 <div className="grid grid-cols-3 gap-2 text-left text-left">
                   <div className="space-y-1 text-left text-left col-span-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block text-left">DATE</label><input type="date" required value={formData.date} onChange={e=>setFormData({...formData, date: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-indigo-500 font-bold shadow-inner text-[10px] cursor-pointer text-left"/></div>
                   <div className="space-y-1 text-left text-left col-span-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block text-left">TIME</label><input type="time" required value={formData.startTime} onChange={e=>setFormData({...formData, startTime: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-indigo-500 font-bold shadow-inner text-[10px] cursor-pointer text-left"/></div>
                   <div className="space-y-1 text-left text-left col-span-1"><label className="text-[9px] font-black text-slate-500 uppercase ml-1 block text-left">HRS</label><input type="number" step="0.5" required value={formData.duration} onChange={e=>setFormData({...formData, duration: Number(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-indigo-500 font-bold shadow-inner text-[10px] text-left"/></div>
                 </div>
                 <div className="bg-[#13231f] border border-emerald-500/10 p-4 rounded-2xl space-y-4 shadow-inner text-left text-left text-left text-left"><label className="flex items-start gap-4 cursor-pointer text-left text-left text-left text-left"><input type="checkbox" checked={formData.isPublic} onChange={e=>setFormData({...formData, isPublic: e.target.checked})} className="mt-1 w-5 h-5 rounded text-indigo-600 bg-black border-white/10 focus:ring-0 shadow-inner text-left"/><div className="text-left text-left text-left text-left"><span className="text-xs font-black uppercase text-emerald-400 tracking-tight leading-none block text-left">COMMUNITY SYNC</span><p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1 leading-none text-left">Show in Official Calendar</p></div></label>
                    {formData.isPublic && (<div className="pl-9 pt-3 border-t border-white/5 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-300 text-left text-left text-left text-left"><div className="flex gap-6 text-left text-white text-[9px] font-black uppercase text-left text-left text-left"><label className="flex items-center gap-2 cursor-pointer text-left text-left text-left"><input type="radio" checked={formData.publicPushMode==='auto'} onChange={()=>setFormData({...formData, publicPushMode:'auto'})} className="w-3.5 h-3.5 text-indigo-600 bg-black border-white/10 focus:ring-0 shadow-inner cursor-pointer appearance-none border border-white/20 checked:bg-indigo-600 rounded-full text-left"/> IMMEDIATE</label><label className="flex items-center gap-2 cursor-pointer text-left text-left text-left"><input type="radio" checked={formData.publicPushMode==='manual'} onChange={()=>setFormData({...formData, publicPushMode:'manual'})} className="w-3.5 h-3.5 text-indigo-600 bg-black border-white/10 focus:ring-0 shadow-inner cursor-pointer appearance-none border border-white/20 checked:bg-indigo-600 rounded-full text-left"/> HOLD</label></div></div>)}</div><button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-xl active:scale-95 text-[10px] text-left text-center">SUBMIT PARTY</button></form></div></div>
      )}

      {/* DELETE CONFIRM */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[300] flex items-center justify-center p-4 text-left text-left text-left"><div className="bg-[#111827] border border-rose-500/20 rounded-2xl w-full max-w-sm p-6 text-center animate-in zoom-in-95 shadow-2xl text-left text-left text-left text-center text-center"><Trash2 className="mx-auto text-rose-500 mb-3 text-left text-center" size={32}/><h2 className="text-lg font-black text-white uppercase tracking-tight mb-1 leading-none text-center text-center">Delete Party?</h2><p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-6 leading-relaxed text-center text-left text-center text-center">"{deleteConfirm.theme}" removed forever.</p><div className="flex gap-4 text-left text-center"><button onClick={()=>setDeleteConfirm(null)} className="flex-1 py-3 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest text-left text-center">Cancel</button><button onClick={confirmDelete} className="flex-1 py-3 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-rose-900/20 transition-all text-left text-center">Delete</button></div></div></div>
      )}
    </div>
  );
}
