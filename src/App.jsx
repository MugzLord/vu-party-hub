import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays, LogOut, ChevronLeft, ChevronRight, 
  Shield, Calendar, BookOpen, Trash2, Edit, Clock, User, Users, X, Save, Settings, Eye, EyeOff, Archive, AlertTriangle, CheckCircle
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

const getPTDateInt = (dateStr) => {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0); 
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  return parseInt(`${year}${month}${day}`, 10);
};

const getViteEnv = (key) => { 
  try { 
    const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}; 
    return env[key] || null; 
  } catch (e) { 
    return null; 
  } 
};

const getSafeConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config && __firebase_config !== "undefined") return JSON.parse(__firebase_config);
  return { 
    apiKey: getViteEnv('VITE_FIREBASE_API_KEY'), 
    authDomain: getViteEnv('VITE_FIREBASE_AUTH_DOMAIN'), 
    projectId: getViteEnv('VITE_FIREBASE_PROJECT_ID'), 
    storageBucket: getViteEnv('VITE_FIREBASE_STORAGE_BUCKET'), 
    messagingSenderId: getViteEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'), 
    appId: getViteEnv('VITE_FIREBASE_APP_ID') 
  };
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

const DURATION_OPTIONS = [
  { label: '1 Hour', hours: 1 },
  { label: '2 Hours', hours: 2 },
  { label: '3 Hours', hours: 3 },
  { label: '4 Hours', hours: 4 }
];

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  return `${parts[1]}-${parts[2]}`;
};

const formatTime = (timeStr) => {
  if (!timeStr) return '';
  if (/(am|pm)/i.test(timeStr)) {
    return timeStr.toUpperCase();
  }
  return timeStr;
};

const parseEventTimestamp = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return 0;
  const [time, modifier] = timeStr.split(' ');
  if (!time || !modifier) return new Date(dateStr).getTime();
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours !== 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;

  const d = new Date(dateStr);
  d.setHours(hours || 0, minutes || 0, 0, 0);
  return d.getTime();
};

const isEventLive = (dateStr, startTimeStr, durationHours = 2) => {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const eventStartTime = parseEventTimestamp(dateStr, startTimeStr);
  const durMs = (durationHours || 2) * 60 * 60 * 1000;
  const endTime = eventStartTime + durMs;

  return new Date(dateStr).toDateString() === now.toDateString() && now.getTime() >= eventStartTime && now.getTime() <= endTime;
};

export default function App() {
  const [parties, setParties] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => { 
    const s = localStorage.getItem(SESSION_KEY); 
    return s ? JSON.parse(s) : null; 
  });
  const [view, setView] = useState('Guide'); 
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [guideTab, setGuideTab] = useState('current');
  const [showAuthGate, setShowAuthGate] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteQueue, setDeleteQueue] = useState(null); 
  const [customAlert, setCustomAlert] = useState(null); 
  const [dismissedNotices, setDismissedNotices] = useState({});

  // Forms & Inputs
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [formData, setFormData] = useState({ theme: '', hostName: '', coHost: '', date: '', startTime: '6:00 PM', duration: 2, performers: 'VU Storytellers' });
  const [gateU, setGateU] = useState('');
  const [gateP, setGateP] = useState('');
  const [gateCP, setGateCP] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const showAlert = (title, message) => {
    setCustomAlert({ title, message });
  };

  const checkEventClash = (proposedEvent, excludeId = null) => {
    const newStart = parseEventTimestamp(proposedEvent.date, proposedEvent.startTime);
    const newDur = proposedEvent.duration || 2;
    const newEnd = newStart + (newDur * 60 * 60 * 1000);

    return parties.some(p => {
      if (excludeId && p.id === excludeId) return false;
      if (p.status !== 'approved') return false; 
      const pStart = parseEventTimestamp(p.date, p.startTime);
      const pDur = p.duration || 2;
      const pEnd = pStart + (pDur * 60 * 60 * 1000);
      return newStart < pEnd && newEnd > pStart;
    });
  };

  const { thisMonthEvents, nextMonthEvents } = useMemo(() => {
    const todayPT = getPTDateInt(new Date().toISOString());
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const currentYear = now.getFullYear();
    const nextMonthIdx = (currentMonthIdx + 1) % 12;
    const nextYear = currentMonthIdx === 11 ? currentYear + 1 : currentYear;
    
    const approvedParties = parties.filter(p => p.status === 'approved' || (currentUser && currentUser.role !== 'host'));

    return {
      thisMonthEvents: approvedParties.filter(p => {
        const [y, m] = p.date ? p.date.split('-').map(Number) : [0, 0];
        return (m - 1) === currentMonthIdx && y === currentYear && getPTDateInt(p.date) >= todayPT;
      }).sort((a, b) => a.date.localeCompare(b.date)),
      
      nextMonthEvents: approvedParties.filter(p => {
        const [y, m] = p.date ? p.date.split('-').map(Number) : [0, 0];
        return (m - 1) === nextMonthIdx && y === nextYear;
      }).sort((a, b) => a.date.localeCompare(b.date))
    };
  }, [parties, currentUser]);
  
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

  const [ptTime, setPtTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      setPtTime(formatter.format(new Date()));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    let isMounted = true;

    const unsubscribeParties = onSnapshot(collection(db, getPath('parties')), 
      (s) => {
        const rawData = s.docs.map(d => ({ id: d.id, ...d.data() }));
        if (isMounted) setParties(rawData);
      },
      (e) => console.error("Firestore error:", e)
    );

    const unsubscribeAdmins = onSnapshot(collection(db, getPath('admins')), 
      (s) => {
        if (isMounted) setAdmins(s.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (e) => console.error("Firestore permission error:", e)
    );

    return () => { 
      isMounted = false;
      unsubscribeParties(); 
      unsubscribeAdmins(); 
    };
  }, [isAuthReady]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
    const days = [];

    for (let i = adjustedFirstDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month, -i), monthType: 'prev' });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), monthType: 'current' });
    }
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ date: new Date(year, month + 1, i), monthType: 'next' });
    }
    return days;
  }, [currentMonth]);

  const hasEvent = (date) => parties.some(p => (p.status === 'approved' || (currentUser && currentUser.role !== 'host')) && new Date(p.date).toDateString() === date.toDateString());

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    
    if (!gateU.trim() || !gateP.trim()) {
      setLoginError('Please enter both username and password.');
      return;
    }

    if (gateU.toLowerCase() === 'mike' && gateP === 'Owner123') {
      const user = { id: 'owner', username: 'Mike', role: 'owner' };
      setCurrentUser(user);
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      setShowAuthGate(false);
      setGateU(''); setGateP(''); setGateCP('');
      return;
    }

    if (isRegistering) {
      if (gateP !== gateCP) {
        setLoginError('Passwords do not match.');
        return;
      }
      if (admins.some(a => a.username.toLowerCase() === gateU.toLowerCase())) {
        setLoginError('Username already exists.');
        return;
      }
      try {
        const docRef = await addDoc(collection(db, getPath('admins')), { 
          username: gateU.trim(), 
          password: gateP, 
          role: 'host', 
          createdAt: new Date().toISOString() 
        });
        const user = { id: docRef.id, username: gateU.trim(), role: 'host' };
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        setShowAuthGate(false);
        setGateU(''); setGateP(''); setGateCP('');
        setIsRegistering(false);
        return;
      } catch (err) {
        setLoginError('Registration failed. Try again.');
        return;
      }
    }

    const foundAdmin = admins.find(a => a.username.toLowerCase() === gateU.trim().toLowerCase() && a.password === gateP);
    if (foundAdmin) {
      const user = { id: foundAdmin.id, username: foundAdmin.username, role: foundAdmin.role || 'host' };
      setCurrentUser(user);
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      setShowAuthGate(false);
      setGateU(''); setGateP(''); setGateCP('');
    } else {
      setLoginError('Incorrect username or password.');
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminU.trim() || !newAdminP.trim()) return setAdminMsg("Fields cannot be empty.");
    if (newAdminU.toLowerCase() === 'mike') return setAdminMsg("Cannot use 'Mike' as username.");
    if (admins.some(a => a.username.toLowerCase() === newAdminU.toLowerCase())) return setAdminMsg("Username already exists.");
    
    await addDoc(collection(db, getPath('admins')), { username: newAdminU.trim(), password: newAdminP, role: 'admin', createdAt: new Date().toISOString() });
    setNewAdminU(''); setNewAdminP('');
    setAdminMsg("Admin created successfully!");
    setTimeout(() => setAdminMsg(''), 3000);
  };

  const handleToggleAdminRole = async (adminObj) => {
    if (adminObj.role === 'owner') return;
    const newRole = adminObj.role === 'admin' ? 'host' : 'admin';
    await updateDoc(doc(db, getPath('admins'), adminObj.id), { role: newRole });
  };

  const handleDeleteAdmin = async (id) => await deleteDoc(doc(db, getPath('admins'), id));

  const handleExecuteDelete = async () => {
    if (!deleteQueue) return;
    try {
      await deleteDoc(doc(db, getPath('parties'), deleteQueue.id));
      setDeleteQueue(null);
    } catch (err) {
      console.error("Error deleting event:", err);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newPass.trim()) return setPwdMsg({ type: 'error', text: 'Password cannot be empty' });
    if (currentUser.role === 'owner') return setPwdMsg({ type: 'error', text: 'Owner password cannot be changed here.' });
    
    try {
      await updateDoc(doc(db, getPath('admins'), currentUser.id), { password: newPass });
      setPwdMsg({ type: 'success', text: 'Password updated successfully!' });
      setTimeout(() => {
        setShowProfileModal(false);
        setPwdMsg(null);
        setNewPass('');
      }, 1500);
    } catch(err) {
      setPwdMsg({ type: 'error', text: 'Error updating password.' });
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (editModal.status === 'approved' && checkEventClash(editModal, editModal.id)) {
      showAlert("Clash Detected", "Another approved event is already scheduled during this time window!");
      return;
    }
    
    const updatedEvent = { 
      ...editModal, 
      lastEditedBy: currentUser?.username || 'Admin', 
      lastEditedAt: new Date().toISOString() 
    };

    await updateDoc(doc(db, getPath('parties'), editModal.id), updatedEvent);
    setEditModal(null);
  };

  const handleApprove = async (party) => {
    if (checkEventClash(party, party.id)) {
      showAlert("Clash Detected", "Cannot approve: another event is already scheduled in this time slot!");
      return;
    }
    await updateDoc(doc(db, getPath('parties'), party.id), { 
      status: 'approved', 
      approvedBy: currentUser?.username || 'Admin',
      lastEditedBy: currentUser?.username || 'Admin',
      lastEditedAt: new Date().toISOString()
    });
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const newEvent = { 
        ...formData, 
        status: 'pending', 
        addedBy: currentUser?.username || 'Unknown', 
        createdAt: new Date().toISOString() 
      };
      await addDoc(collection(db, getPath('parties')), newEvent);
      setFormData({ theme: '', hostName: '', coHost: '', date: '', startTime: '6:00 PM', duration: 2, performers: 'VU Storytellers' });
      showAlert("Submitted", "Party submitted successfully! Waiting for admin approval.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'owner';
  const todayPT = getPTDateInt(new Date().toISOString());

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-purple-600 selection:text-white relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/15 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="max-w-md w-full bg-[#0d1322]/90 border border-purple-500/20 p-8 rounded-3xl backdrop-blur-xl shadow-2xl shadow-purple-950/80 text-center relative z-10 space-y-6">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl mx-auto flex items-center justify-center border border-purple-400/40 shadow-lg shadow-purple-900/50">
            <CalendarDays size={32} className="text-white" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-black bg-gradient-to-r from-white via-purple-100 to-purple-300 bg-clip-text text-transparent">VU Storytellers</h1>
            <p className="text-xs font-bold text-purple-400 uppercase tracking-widest">Party Schedule Hub</p>
            <p className="text-xs text-slate-400 font-medium pt-2 leading-relaxed">
              Exclusive private schedule for VU Storytellers. Please sign-in with your authorized account to access active gatherings.
            </p>
          </div>

          <button 
            onClick={() => { setShowAuthGate(true); setIsRegistering(false); setLoginError(''); }}
            className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 hover:from-purple-500 hover:to-indigo-500 transition-all py-4 rounded-2xl font-black text-white text-sm shadow-xl shadow-purple-950/60 border border-purple-400/40 uppercase tracking-wider"
          >
            Sign-In
          </button>

          <div className="text-[11px] text-purple-300/60 font-light pt-2">
            Disclaimer: All approved events are subject to IMVU Staff changes without prior notice. Independent community initiative, not officially affiliated with IMVU.
          </div>
        </div>

        {showAuthGate && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-md">
            <div className="bg-[#0d1322] p-8 rounded-3xl w-full max-w-sm border border-purple-500/30 shadow-2xl shadow-purple-950/90 relative">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <Shield size={20} className="text-purple-400"/>
                  <h2 className="font-black text-lg text-white">Sign-In</h2>
                </div>
                <button onClick={() => { setShowAuthGate(false); setLoginError(''); }} className="text-purple-300/70 hover:text-white transition-colors bg-purple-950/40 p-2 rounded-full border border-purple-500/20"><X size={16}/></button>
              </div>

              <div className="bg-purple-950/30 border border-purple-500/20 p-4 rounded-2xl mb-5 text-center space-y-3">
                <p className="text-[11px] font-bold text-purple-300 tracking-wider">New VU Storyteller?</p>
                <button 
                  type="button" 
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black py-3 rounded-xl border border-purple-400/30 transition-all shadow-md uppercase tracking-wider"
                >
                  {isRegistering ? 'Back to Sign In' : 'Register Account'}
                </button>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <input 
                  placeholder="IMVU Username" 
                  value={gateU} 
                  onChange={e=>setGateU(e.target.value)} 
                  className="w-full bg-black/40 border border-purple-500/20 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-purple-400/30"
                />
                <div className="relative">
                  <input 
                    type={showPass ? "text" : "password"} 
                    placeholder="Password" 
                    value={gateP} 
                    onChange={e=>setGateP(e.target.value)} 
                    className="w-full bg-black/40 border border-purple-500/20 rounded-2xl p-4 pr-12 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-purple-400/30"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-4 text-purple-400/50 hover:text-purple-300 transition-colors">
                    {showPass ? <EyeOff size={20}/> : <Eye size={20}/>}
                  </button>
                </div>

                {isRegistering && (
                  <input 
                    type="password" 
                    placeholder="Confirm Password" 
                    value={gateCP} 
                    onChange={e=>setGateCP(e.target.value)} 
                    className="w-full bg-black/40 border border-purple-500/20 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-purple-400/30"
                  />
                )}

                {loginError && <p className="text-rose-400 text-xs font-bold bg-rose-950/50 p-3 rounded-xl border border-rose-500/30">{loginError}</p>}
                
                <button type="submit" className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 hover:from-purple-500 hover:to-indigo-500 transition-all py-4 rounded-2xl font-black text-white text-sm border border-purple-400/40 shadow-xl shadow-purple-950/60 uppercase tracking-wider">
                  {isRegistering ? 'Register Account' : 'Sign In'}
                </button>

                <p className="text-[11px] text-purple-300/70 text-center font-medium pt-1">Need help? Contact an Admin</p>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 selection:bg-purple-600 selection:text-white pb-16">
      <header className="relative z-40 bg-[#0d1322]/90 backdrop-blur-md border-b border-purple-500/20 p-4 md:px-8 flex justify-between items-center sticky top-0 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl flex items-center justify-center border border-purple-400/40 shadow-lg shadow-purple-900/50">
              <CalendarDays size={22} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-white text-lg tracking-tight bg-gradient-to-r from-white via-purple-100 to-purple-300 bg-clip-text text-transparent">VU Storytellers</h1>
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-1">🔥 Party Schedule Hub</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-purple-200/80 bg-purple-950/40 px-3 py-1.5 rounded-xl border border-purple-500/30 shadow-inner">
            <Clock size={12} className="text-purple-400 shrink-0" />
            <span className="font-bold">{ptTime}</span>
            <span className="opacity-60">PT</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setShowProfileModal(true)} className="flex items-center gap-2 text-xs bg-purple-950/60 hover:bg-purple-900/60 px-4 py-2 rounded-2xl font-bold text-purple-300 transition-all border border-purple-500/30 shadow-md">
            <Settings size={14} className="text-purple-400" /> 
            <span>{currentUser.username}</span>
            <span className="bg-purple-600/60 text-white text-[9px] uppercase px-1.5 py-0.5 rounded-md font-black">{currentUser.role}</span>
          </button>
          <button onClick={() => { setCurrentUser(null); setView('Guide'); localStorage.removeItem(SESSION_KEY); }} className="text-xs font-black uppercase text-rose-400 hover:text-rose-300 p-2.5 bg-rose-950/30 hover:bg-rose-950/50 rounded-2xl border border-rose-500/30 transition-all">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex p-4 gap-3 max-w-4xl mx-auto overflow-x-auto relative z-30">
        {['Guide', 'Monthly', 'Submit Party', currentUser?.role === 'owner' ? 'Staff' : ''].filter(Boolean).map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`px-6 py-3 rounded-2xl text-xs font-black uppercase flex items-center gap-2.5 whitespace-nowrap transition-all duration-300 shadow-lg ${view === t ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 text-white shadow-purple-950/80 border border-purple-400/50 scale-105' : 'bg-[#111827]/80 text-purple-300/70 hover:bg-purple-950/40 hover:text-white border border-purple-500/10'}`}
          >
            {t === 'Guide' && <BookOpen size={15} />}
            {t === 'Monthly' && <Calendar size={15} />}
            {t === 'Submit Party' && <Edit size={15} />}
            {t === 'Staff' && <Users size={15} />}
            {t}
          </button>
        ))}
      </div>

      <main className="p-4 md:p-6 max-w-4xl mx-auto relative z-10">
        {view === 'Guide' && (
          <div className="space-y-6">
            {parties.some(p => p.addedBy === currentUser.username && p.status === 'approved' && !dismissedNotices[p.id]) && (
              <div className="bg-gradient-to-r from-purple-900/80 to-indigo-900/80 border border-purple-500/40 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-3">
                  <span className="bg-purple-600 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-xl shadow">NOTICE</span>
                  <p className="text-xs font-bold text-purple-100">
                    {(() => {
                      const party = parties.find(p => p.addedBy === currentUser.username && p.status === 'approved' && !dismissedNotices[p.id]);
                      return `Party "${party?.theme || 'Event'}" on ${party?.date || ''} has been approved by admin!`;
                    })()}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    const approvedParty = parties.find(p => p.addedBy === currentUser.username && p.status === 'approved' && !dismissedNotices[p.id]);
                    if (approvedParty) {
                      setDismissedNotices(prev => ({ ...prev, [approvedParty.id]: true }));
                    }
                  }}
                  className="text-xs font-black text-purple-300 hover:text-white bg-purple-950/60 px-3 py-1.5 rounded-xl border border-purple-500/30 transition-all"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="bg-gradient-to-br from-[#111827] via-[#0d1322] to-[#141c30] border border-purple-500/20 p-6 md:p-8 rounded-3xl shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
              <h2 className="font-black text-white text-2xl md:text-3xl tracking-tight mb-2 flex items-center gap-3">
                <BookOpen className="text-purple-400" size={28} /> VU Storytellers Party Schedule
              </h2>
              <p className="text-sm text-purple-200/80 font-medium mb-4">
                Exclusive schedule for VU Storytellers. Submit events and track timings in Pacific Time.
              </p>
              <div className="text-[11px] font-thin text-indigo-300/70 bg-purple-950/30 p-3.5 rounded-2xl border border-purple-500/20 leading-relaxed">
                <strong className="font-medium text-purple-300">Disclaimer:</strong> All approved events are subject to IMVU Staff changes without prior notice. Independent community initiative, not officially affiliated with IMVU.
              </div>
            </div>
            
            <div className="flex gap-2 border-b border-purple-500/20 pb-1">
              <button 
                onClick={() => setGuideTab('current')}
                className={`pb-2 px-4 font-black text-xs uppercase tracking-wider transition-all ${guideTab === 'current' ? 'text-white border-b-2 border-purple-500' : 'text-purple-400/50 hover:text-purple-300'}`}
              >
                Current Month Events
              </button>
              <button 
                onClick={() => setGuideTab('next')}
                className={`pb-2 px-4 font-black text-xs uppercase tracking-wider transition-all ${guideTab === 'next' ? 'text-white border-b-2 border-purple-500' : 'text-purple-400/50 hover:text-purple-300'}`}
              >
                Upcoming Month Events
              </button>
            </div>
      
            <div className="bg-[#111827]/85 backdrop-blur-md border border-purple-500/20 p-6 rounded-3xl min-h-[300px] shadow-xl">
              <div className="mb-6 text-xs font-black text-purple-400/80 uppercase tracking-widest flex items-center gap-2">
                <Calendar size={14} />
                {(() => {
                  const now = new Date();
                  if (guideTab === 'current') {
                    return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  } else {
                    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    return nextMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  }
                })()}
              </div>
              {guideTab === 'current' ? (
                <div className="space-y-4">
                  {thisMonthEvents.length > 0 ? thisMonthEvents.map(p => <EventCard key={p.id} p={p} currentUser={currentUser}/>) : <p className="text-purple-400/50 text-sm font-medium py-12 text-center">No storytelling parties scheduled for this month.</p>}
                </div>
              ) : (
                <div className="space-y-4">
                  {nextMonthEvents.length > 0 ? nextMonthEvents.map(p => <EventCard key={p.id} p={p} currentUser={currentUser}/>) : <p className="text-purple-400/50 text-sm font-medium py-12 text-center">No upcoming parties scheduled yet.</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'Monthly' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-[#111827]/90 backdrop-blur-md p-4 rounded-2xl border border-purple-500/20 shadow-xl">
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-2.5 hover:bg-purple-950/50 rounded-xl text-purple-300 transition-colors border border-purple-500/20"><ChevronLeft size={18}/></button>
              <span className="font-black text-white uppercase tracking-widest text-sm">{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-2.5 hover:bg-purple-950/50 rounded-xl text-purple-300 transition-colors border border-purple-500/20"><ChevronRight size={18}/></button>
            </div>
            <div className="grid grid-cols-7 gap-2 bg-[#111827]/50 p-4 rounded-3xl border border-purple-500/20 shadow-xl">
              {['M','T','W','T','F','S','S'].map((d, index) => (
                <div key={`day-header-${index}`} className="text-xs font-black text-purple-400/70 pb-2 text-center">{d}</div>
              ))}
              {calendarDays.map((d, i) => {
                const hasEventToday = hasEvent(d.date);
                const isEventDay = d.monthType === 'current' && hasEventToday;
                
                return (
                  <button 
                    key={`day-cell-${i}`} 
                    onClick={() => setSelectedDay(d.date)} 
                    className={`aspect-square flex flex-col items-center justify-center text-sm font-black rounded-2xl relative transition-all duration-300 
                      ${d.monthType === 'current' ? 'text-white' : 'text-purple-900/40'}
                      ${selectedDay?.toDateString() === d.date.toDateString() 
                        ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/80 scale-105 border border-purple-400/50' 
                        : isEventDay 
                          ? 'bg-purple-950/50 border border-purple-500/40 text-purple-200' 
                          : d.monthType === 'current' ? 'bg-[#111827]' : 'bg-[#070b14]/50'}
                      hover:border-purple-500/60 border border-purple-500/10`}
                  >
                    {d.date.getDate()}
                    {hasEventToday && (
                      <div className={`absolute bottom-2 w-1.5 h-1.5 rounded-full ${selectedDay?.toDateString() === d.date.toDateString() ? 'bg-white' : 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,1)]'}`}></div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {view === 'Submit Party' && (
          <div className="space-y-8">
            <div className="bg-[#111827]/90 backdrop-blur-md border border-purple-500/20 p-6 md:p-8 rounded-3xl shadow-2xl">
              <h3 className="font-black text-white text-xl mb-1">Schedule New Storyteller Gathering</h3>
              <p className="text-xs text-purple-300/70 font-medium mb-6">Signed in as: <strong className="text-purple-300">{currentUser.username}</strong> ({currentUser.role})</p>
              
              <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input required placeholder="Event Theme / Title" className="bg-black/40 p-4 rounded-2xl border border-purple-500/20 placeholder:text-purple-400/30 focus:outline-none focus:border-purple-500 transition-colors text-white text-sm" value={formData.theme} onChange={e=>setFormData({...formData, theme: e.target.value})}/>
                <input required placeholder="Host Name (IMVU Username)" className="bg-black/40 p-4 rounded-2xl border border-purple-500/20 placeholder:text-purple-400/30 focus:outline-none focus:border-purple-500 transition-colors text-white text-sm" value={formData.hostName} onChange={e=>setFormData({...formData, hostName: e.target.value})}/>
                <input placeholder="Co-Host Name (Optional)" className="bg-black/40 p-4 rounded-2xl border border-purple-500/20 placeholder:text-purple-400/30 focus:outline-none focus:border-purple-500 transition-colors text-white text-sm" value={formData.coHost} onChange={e=>setFormData({...formData, coHost: e.target.value})}/>
                
                <select required className="bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-purple-200 text-sm focus:outline-none focus:border-purple-500 transition-colors" value={formData.performers} onChange={e=>setFormData({...formData, performers: e.target.value})}>
                  <option value="VU Storytellers">VU Storytellers</option>
                  <option value="Special Guest">Special Guest</option>
                </select>
                
                <select required className="bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-purple-200 text-sm focus:outline-none focus:border-purple-500 transition-colors" value={formData.startTime} onChange={e=>setFormData({...formData, startTime: e.target.value})}>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                <select required className="bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-purple-200 text-sm focus:outline-none focus:border-purple-500 transition-colors" value={formData.duration} onChange={e=>setFormData({...formData, duration: Number(e.target.value)})}>
                  {DURATION_OPTIONS.map(d => <option key={d.hours} value={d.hours}>{d.label}</option>)}
                </select>
                
                <input required type="date" className="bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-purple-200 text-sm focus:outline-none focus:border-purple-500 transition-colors col-span-full md:col-span-1" value={formData.date} onChange={e=>setFormData({...formData, date: e.target.value})}/>
                
                <button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 hover:from-purple-500 hover:to-indigo-500 transition-all rounded-2xl font-black p-4 col-span-full text-white text-sm shadow-xl shadow-purple-950/60 border border-purple-400/40 uppercase tracking-wider disabled:opacity-50 mt-2">
                  {isSubmitting ? 'SUBMITTING...' : 'SUBMIT PARTY FOR APPROVAL'}
                </button>
              </form>
            </div>
        
            <div className="space-y-4">
              <h3 className="font-black text-lg mb-2 text-white flex items-center gap-2"><Archive size={18} className="text-purple-400"/> Storyteller Events & Approvals</h3>
              {parties && parties.length > 0 ? (
                parties
                  .filter(p => p && p.date && getPTDateInt(p.date) >= todayPT)
                  .sort((a, b) => new Date(a.date) - new Date(b.date))
                  .map(p => (
                    <div key={p.id} className="bg-[#111827]/90 backdrop-blur-md border border-purple-500/20 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-white text-base">{p.theme || 'Untitled Event'}</span>
                          <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${p.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                            {p.status === 'approved' ? 'Approved' : 'Pending Approval'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-purple-300/70 font-bold mt-1">
                          <span>{p.date}</span>
                          <span>{formatTime(p.startTime)} ({p.duration || 2}h)</span>
                          <span>Host: {p.hostName || 'N/A'}</span>
                          <span>Submitted by: {p.addedBy || 'Unknown'}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 w-full md:w-auto justify-end">
                        {p.status !== 'approved' && isStaff && (
                          <button onClick={() => handleApprove(p)} className="px-4 py-2.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 rounded-xl text-emerald-300 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md">
                            <CheckCircle size={14}/> Approve
                          </button>
                        )}
                        <button onClick={() => setEditModal(p)} className="p-2.5 bg-purple-950/40 border border-purple-500/20 hover:bg-purple-900/50 rounded-xl text-purple-300 transition-colors"><Edit size={16}/></button>
                        <button onClick={() => setDeleteQueue(p)} className="p-2.5 bg-rose-950/30 border border-rose-500/20 hover:bg-rose-950/60 rounded-xl text-rose-400 transition-colors"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))
              ) : (
                <p className="text-purple-400/50 text-sm font-medium">No active events to manage.</p>
              )}
            </div>
          </div>
        )}

        {view === 'Staff' && currentUser?.role === 'owner' && (
          <div className="space-y-8">
            <div className="bg-[#111827]/90 backdrop-blur-md border border-purple-500/20 p-6 md:p-8 rounded-3xl shadow-2xl">
              <h3 className="font-black text-lg text-white mb-4">Create New Administrator / Host Account</h3>
              <form onSubmit={handleAddAdmin} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input placeholder="Username" value={newAdminU} onChange={e=>setNewAdminU(e.target.value)} className="bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-white placeholder:text-purple-400/30 text-sm focus:outline-none focus:border-purple-500 transition-colors" />
                <input placeholder="Initial Password" type="password" value={newAdminP} onChange={e=>setNewAdminP(e.target.value)} className="bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-white placeholder:text-purple-400/30 text-sm focus:outline-none focus:border-purple-500 transition-colors" />
                {adminMsg && <div className="col-span-full text-sm font-bold text-emerald-400 mt-1">{adminMsg}</div>}
                <button type="submit" className="col-span-full bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 hover:from-purple-500 hover:to-indigo-500 transition-all rounded-2xl font-black p-4 text-white text-sm shadow-xl shadow-purple-950/60 border border-purple-400/40 uppercase tracking-wider">CREATE ACCOUNT</button>
              </form>
            </div>

            <div className="space-y-3">
              <h3 className="font-black text-lg text-white mb-4">Registered Accounts & Roles</h3>
              {admins.map(a => (
                <div key={a.id} className="bg-[#111827]/90 backdrop-blur-md border border-purple-500/20 p-5 rounded-2xl flex justify-between items-center shadow-xl">
                  <div className="flex items-center gap-3">
                    <Shield size={16} className="text-purple-400"/> 
                    <div>
                      <span className="font-bold text-white block text-sm">{a.username}</span>
                      <span className="text-[10px] text-purple-400 uppercase font-mono tracking-wider">Role: {a.role || 'host'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleToggleAdminRole(a)} className="px-3 py-1.5 bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/30 rounded-xl text-purple-300 font-bold text-xs transition-colors">
                      Toggle Role ({a.role === 'admin' ? 'Make Host' : 'Make Admin'})
                    </button>
                    <button onClick={()=>handleDeleteAdmin(a.id)} className="p-2.5 bg-rose-950/30 border border-rose-500/20 hover:bg-rose-950/60 rounded-xl text-rose-400 transition-colors"><Trash2 size={16}/></button>
                  </div>
                </div>
              ))}
              {admins.length === 0 && <p className="text-purple-400/50 text-sm font-medium">No registered accounts found.</p>}
            </div>

            <div className="space-y-3 pt-8 border-t border-purple-500/20">
              <h3 className="font-black text-lg text-white mb-4">Master Activity & Audit Logs</h3>
              {parties
                .slice()
                .sort((a,b) => new Date(b.lastEditedAt || b.createdAt || 0) - new Date(a.lastEditedAt || a.createdAt || 0))
                .map(p => (
                  <div key={p.id} className="text-xs bg-[#070b14] p-4 rounded-2xl border border-purple-500/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 text-purple-300/80 shadow-inner">
                    <div className="font-bold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                      {p.theme}
                      <span className="text-[10px] text-purple-400 font-normal">({p.status})</span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-[11px] font-mono">
                      <span>Submitted by: <strong className="text-purple-300">{p.addedBy || 'Unknown'}</strong></span>
                      <span>Edited by: <strong className="text-purple-300">{p.lastEditedBy || 'None'}</strong></span>
                      <span className="text-purple-400/60">
                        {p.lastEditedAt ? new Date(p.lastEditedAt).toLocaleString('en-US') : (p.createdAt ? new Date(p.createdAt).toLocaleString('en-US') : 'Recent')}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </main>

      {selectedDay && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-md">
           <div className="bg-[#0d1322] p-6 rounded-3xl w-full max-w-lg border border-purple-500/30 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl shadow-purple-950/90">
              <div className="flex justify-between items-center mb-2 pb-4 border-b border-purple-500/20">
                  <h2 className="font-black text-base text-white">Events for {selectedDay.toDateString()}</h2>
                  <button onClick={() => setSelectedDay(null)} className="text-purple-300/70 hover:text-white transition-colors bg-purple-950/40 p-2 rounded-full border border-purple-500/20"><X size={18}/></button>
              </div>
              {parties.filter(p => (p.status === 'approved' || currentUser.role !== 'host') && new Date(p.date).toDateString() === selectedDay.toDateString()).map(p => <EventCard key={p.id} p={p} currentUser={currentUser}/>)}
              {parties.filter(p => (p.status === 'approved' || currentUser.role !== 'host') && new Date(p.date).toDateString() === selectedDay.toDateString()).length === 0 && (
                  <p className="text-purple-400/50 text-sm text-center py-8 font-medium">No events scheduled for this date.</p>
              )}
           </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-md">
            <form onSubmit={handleUpdate} className="bg-[#0d1322] p-6 rounded-3xl w-full max-w-lg border border-purple-500/30 space-y-4 shadow-2xl shadow-purple-950/90">
              <div className="flex justify-between items-center mb-2 pb-4 border-b border-purple-500/20">
                  <h2 className="font-black text-lg text-white flex items-center gap-2"><Edit size={18} className="text-purple-400"/> Edit Event</h2>
              </div>
              
              <input required placeholder="Event Theme" className="w-full bg-black/40 p-4 rounded-2xl border border-purple-500/20 placeholder:text-purple-400/30 focus:outline-none focus:border-purple-500 text-white text-sm transition-colors" value={editModal.theme} onChange={e=>setEditModal({...editModal, theme: e.target.value})}/>
              <input required placeholder="Host Name" className="w-full bg-black/40 p-4 rounded-2xl border border-purple-500/20 placeholder:text-purple-400/30 focus:outline-none focus:border-purple-500 text-white text-sm transition-colors" value={editModal.hostName} onChange={e=>setEditModal({...editModal, hostName: e.target.value})}/>
              <input placeholder="Co-Host Name (Optional)" className="w-full bg-black/40 p-4 rounded-2xl border border-purple-500/20 placeholder:text-purple-400/30 focus:outline-none focus:border-purple-500 text-white text-sm transition-colors" value={editModal.coHost} onChange={e=>setEditModal({...editModal, coHost: e.target.value})}/>
              
              <select required className="w-full bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-purple-200 text-sm focus:outline-none focus:border-purple-500 transition-colors" value={editModal.performers} onChange={e=>setEditModal({...editModal, performers: e.target.value})}>
                <option value="VU Storytellers">VU Storytellers</option>
                <option value="Special Guest">Special Guest</option>
              </select>
              
              <select required className="w-full bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-purple-200 text-sm focus:outline-none focus:border-purple-500 transition-colors" value={editModal.startTime} onChange={e=>setEditModal({...editModal, startTime: e.target.value})}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <select required className="w-full bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-purple-200 text-sm focus:outline-none focus:border-purple-500 transition-colors" value={editModal.duration || 2} onChange={e=>setEditModal({...editModal, duration: Number(e.target.value)})}>
                {DURATION_OPTIONS.map(d => <option key={d.hours} value={d.hours}>{d.label}</option>)}
              </select>
              
              <input required type="date" className="w-full bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-purple-200 text-sm focus:outline-none focus:border-purple-500 transition-colors" value={editModal.date} onChange={e=>setEditModal({...editModal, date: e.target.value})}/>
              
              <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setEditModal(null)} className="bg-black/40 border border-purple-500/20 flex-1 p-4 rounded-2xl flex items-center justify-center gap-2 font-black text-purple-300 hover:bg-purple-950/40 transition-colors text-xs uppercase tracking-wider">
                      CANCEL
                  </button>
                  <button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 flex-1 p-4 rounded-2xl flex items-center justify-center gap-2 font-black text-white hover:from-purple-500 hover:to-indigo-500 transition-colors shadow-xl shadow-purple-950/60 text-xs uppercase tracking-wider border border-purple-400/40">
                      <Save size={16}/> SAVE
                  </button>
              </div>
            </form>
        </div>
      )}

      {showProfileModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-md">
            <form onSubmit={handleChangePassword} className="bg-[#0d1322] p-8 rounded-3xl w-full max-w-sm border border-purple-500/30 space-y-4 shadow-2xl shadow-purple-950/90">
              <div className="flex justify-between items-center mb-4">
                  <h2 className="font-black text-lg text-white">Change Password</h2>
                  <button type="button" onClick={()=>{setShowProfileModal(false); setPwdMsg(null); setNewPass('');}} className="text-purple-300/70 hover:text-white transition-colors bg-purple-950/40 p-2 rounded-full border border-purple-500/20"><X size={16}/></button>
              </div>
              <p className="text-xs text-purple-300/70 font-medium mb-4">Update the password for <strong className="text-purple-300">{currentUser?.username}</strong>.</p>
              <input type="password" placeholder="Enter new password" value={newPass} onChange={e=>setNewPass(e.target.value)} className="w-full bg-black/40 p-4 rounded-2xl border border-purple-500/20 text-white placeholder:text-purple-400/30 text-sm focus:outline-none focus:border-purple-500 transition-colors" />
              {pwdMsg && <p className={`text-xs font-bold ${pwdMsg.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>{pwdMsg.text}</p>}
              <button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 w-full p-4 rounded-2xl font-black text-white hover:from-purple-500 hover:to-indigo-500 transition-colors shadow-xl shadow-purple-950/60 mt-2 text-xs uppercase tracking-wider border border-purple-400/40">UPDATE PASSWORD</button>
            </form>
        </div>
      )}

      {deleteQueue && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[100] backdrop-blur-md">
            <div className="bg-[#0d1322] p-6 rounded-3xl w-full max-w-sm border border-rose-500/30 space-y-4 shadow-2xl shadow-rose-950/80">
                <h2 className="font-black text-white text-lg">Confirm Deletion</h2>
                <p className="text-xs text-purple-300/80">Are you sure you want to delete <span className="text-white font-bold">{deleteQueue.theme}</span>?</p>
                <div className="flex gap-3 mt-6">
                    <button onClick={() => setDeleteQueue(null)} className="flex-1 p-3 bg-black/40 rounded-2xl font-bold text-xs text-purple-300 hover:bg-purple-950/40 transition-colors border border-purple-500/20">Cancel</button>
                    <button onClick={handleExecuteDelete} className="flex-1 p-3 bg-rose-600 rounded-2xl font-bold text-xs text-white hover:bg-rose-500 transition-colors shadow-lg shadow-rose-950/80">Yes, Delete</button>
                </div>
            </div>
        </div>
      )}

      {customAlert && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[200] backdrop-blur-md">
            <div className="bg-[#0d1322] p-6 rounded-3xl w-full max-w-sm border border-purple-500/30 space-y-4 shadow-2xl shadow-purple-950/90 text-center animate-in fade-in zoom-in-95 duration-200">
                <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl mx-auto flex items-center justify-center border border-amber-500/30 shadow-lg shadow-amber-950/50">
                    <AlertTriangle size={24} />
                </div>
                <h2 className="font-black text-white text-lg">{customAlert.title}</h2>
                <p className="text-xs text-purple-300/80 leading-relaxed font-medium">{customAlert.message}</p>
                <button onClick={() => setCustomAlert(null)} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all p-3.5 rounded-2xl font-black text-white text-xs uppercase tracking-wider shadow-lg shadow-purple-950/60 border border-purple-400/40">
                    OK
                </button>
            </div>
        </div>
      )}

      {showAuthGate && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50 backdrop-blur-md">
          <div className="bg-[#0d1322] p-8 rounded-3xl w-full max-w-sm border border-purple-500/30 shadow-2xl shadow-purple-950/90 relative">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Shield size={20} className="text-purple-400"/>
                <h2 className="font-black text-lg text-white">Sign-In</h2>
              </div>
              <button onClick={() => { setShowAuthGate(false); setLoginError(''); }} className="text-purple-300/70 hover:text-white transition-colors bg-purple-950/40 p-2 rounded-full border border-purple-500/20"><X size={16}/></button>
            </div>

            <div className="bg-purple-950/30 border border-purple-500/20 p-4 rounded-2xl mb-5 text-center space-y-3">
              <p className="text-[11px] font-bold text-purple-300 tracking-wider">New VU Storyteller?</p>
              <button 
                type="button" 
                onClick={() => setIsRegistering(!isRegistering)}
                className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black py-3 rounded-xl border border-purple-400/30 transition-all shadow-md uppercase tracking-wider"
              >
                {isRegistering ? 'Back to Sign In' : 'Register Account'}
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <input 
                placeholder="IMVU Username" 
                value={gateU} 
                onChange={e=>setGateU(e.target.value)} 
                className="w-full bg-black/40 border border-purple-500/20 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-purple-400/30"
              />
              <div className="relative">
                <input 
                  type={showPass ? "text" : "password"} 
                  placeholder="Password" 
                  value={gateP} 
                  onChange={e=>setGateP(e.target.value)} 
                  className="w-full bg-black/40 border border-purple-500/20 rounded-2xl p-4 pr-12 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-purple-400/30"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-4 text-purple-400/50 hover:text-purple-300 transition-colors">
                  {showPass ? <EyeOff size={20}/> : <Eye size={20}/>}
                </button>
              </div>

              {isRegistering && (
                <input 
                  type="password" 
                  placeholder="Confirm Password" 
                  value={gateCP} 
                  onChange={e=>setGateCP(e.target.value)} 
                  className="w-full bg-black/40 border border-purple-500/20 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder:text-purple-400/30"
                />
              )}

              {loginError && <p className="text-rose-400 text-xs font-bold bg-rose-950/50 p-3 rounded-xl border border-rose-500/30">{loginError}</p>}
              
              <button type="submit" className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 hover:from-purple-500 hover:to-indigo-500 transition-all py-4 rounded-2xl font-black text-white text-sm border border-purple-400/40 shadow-xl shadow-purple-950/60 uppercase tracking-wider">
                {isRegistering ? 'Register Account' : 'Sign In'}
              </button>

              <p className="text-[11px] text-purple-300/70 text-center font-medium pt-1">Need help? Contact an Admin</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({ p, currentUser }) {
    const live = isEventLive(p.date, p.startTime, p.duration);

    return (
        <div className={`bg-[#111827]/90 backdrop-blur-md border p-6 rounded-3xl mb-4 relative transition-all duration-300 shadow-xl 
            ${live 
                ? 'border-purple-500/60 shadow-[0_0_25px_rgba(168,85,247,0.3)] ring-1 ring-purple-500/40' 
                : 'border-purple-500/15 hover:border-purple-500/30 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]'
            }`}>
            
            <div className="flex justify-between items-start mb-3">
                <div className="font-black text-white text-lg tracking-tight">{p.theme}</div>
                {live && (
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-[10px] font-black px-2.5 py-1 rounded-full animate-pulse text-white uppercase tracking-wider shrink-0 ml-2 shadow-lg shadow-purple-950/80 border border-purple-400/40">
                        live now
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-3 text-sm font-bold">
                <div className="flex justify-between items-center text-xs">
                    <span className="tracking-widest">
                        <span className="text-purple-400/60 uppercase text-[10px] font-black">Host: </span>
                        <span className="text-white font-bold">{p.hostName}</span>
                    </span>
                    
                    <span className="bg-purple-950/60 text-purple-300 px-3 py-1 rounded-xl text-[10px] border border-purple-500/30 uppercase tracking-wider shadow-inner font-black">
                        {p.performers || 'VU Storytellers'}
                    </span>
                </div>
                
                <div className="flex justify-between mt-1 pt-3 border-t border-purple-500/10">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-purple-400/60 uppercase tracking-wider font-black">Date</span>
                        <span className="text-white text-sm font-bold">{formatDate(p.date)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] text-purple-400/60 uppercase tracking-wider font-black">Time & Duration</span>
                        <span className="text-white text-sm font-bold">{formatTime(p.startTime)} <span className="text-purple-400 font-normal">({p.duration || 2}h)</span></span>
                    </div>
                </div>
            </div>
        </div>
    );
}
