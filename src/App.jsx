import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays, LogOut, ChevronLeft, ChevronRight, 
  Shield, Calendar, BookOpen, Trash2, Edit, Clock, User, Users, X, Save, Settings, Eye, EyeOff, Archive, Award, CheckCircle, Activity
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

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
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
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
const googleProvider = new GoogleAuthProvider();
const getPath = (colName) => typeof __app_id !== 'undefined' ? `artifacts/${__app_id}/public/data/${colName}` : colName;
const SESSION_KEY = 'vu_storytellers_party_hub_v500';

const TIME_OPTIONS = [
  "12:00 AM", "1:00 AM", "2:00 AM", "3:00 AM", "4:00 AM", "5:00 AM",
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", 
  "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM", "11:00 PM"
];

const DURATION_OPTIONS = [
  { label: '1 Hour', value: 60 },
  { label: '2 Hours', value: 120 },
  { label: '3 Hours', value: 180 },
  { label: '4 Hours', value: 240 },
];

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${month}-${day}`;
};

const formatTime = (timeStr) => {
  if (!timeStr) return '';
  if (/(am|pm)/i.test(timeStr)) {
    return timeStr.toUpperCase();
  }
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    const hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    if (isNaN(hours)) return timeStr;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes} ${ampm}`;
  }
  return timeStr;
};

const parseEventTimestamp = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return 0;
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours !== 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;

  const d = new Date(dateStr);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
};

const isEventLive = (dateStr, startTimeStr, durationMins = 120) => {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const eventStartTime = parseEventTimestamp(dateStr, startTimeStr);
  const durationMs = (durationMins || 120) * 60 * 1000;
  const endTime = eventStartTime + durationMs;

  return new Date(dateStr).toDateString() === now.toDateString() && now.getTime() >= eventStartTime && now.getTime() <= endTime;
};

export default function App() {
  const [parties, setParties] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
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
  const [authError, setAuthError] = useState('');
  
  // Forms & Inputs
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [formData, setFormData] = useState({ 
    theme: '', 
    hostName: currentUser?.username || '', 
    coHost: '', 
    date: '', 
    startTime: '6:00 PM', 
    duration: 120,
    performers: 'VU Storytellers' 
  });
  
  const [gateU, setGateU] = useState('');
  const [gateP, setGateP] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Helper to log access & actions for Mike's master audit view
  const logActivity = async (action, details) => {
    try {
      await addDoc(collection(db, getPath('auditLogs')), {
        action,
        details,
        user: currentUser?.username || gateU || 'Anonymous',
        role: currentUser?.role || 'guest',
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error("Audit log error:", e);
    }
  };

  const checkEventClash = (proposedEvent, excludeId = null) => {
    const newStart = parseEventTimestamp(proposedEvent.date, proposedEvent.startTime);
    const duration = Number(proposedEvent.duration) || 120;
    const newEnd = newStart + (duration * 60 * 1000);

    return parties.some(p => {
      if (excludeId && p.id === excludeId) return false;
      const pStart = parseEventTimestamp(p.date, p.startTime);
      const pDuration = Number(p.duration) || 120;
      const pEnd = pStart + (pDuration * 60 * 1000);
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
    
    return {
      thisMonthEvents: parties.filter(p => {
        const [y, m] = p.date ? p.date.split('-').map(Number) : [0, 0];
        return (m - 1) === currentMonthIdx && y === currentYear && getPTDateInt(p.date) >= todayPT;
      }).sort((a, b) => a.date.localeCompare(b.date)),
      
      nextMonthEvents: parties.filter(p => {
        const [y, m] = p.date ? p.date.split('-').map(Number) : [0, 0];
        return (m - 1) === nextMonthIdx && y === nextYear;
      }).sort((a, b) => a.date.localeCompare(b.date))
    };
  }, [parties]);
  
  // Admin & Host Account Management
  const [newAdminU, setNewAdminU] = useState('');
  const [newAdminP, setNewAdminP] = useState('');
  const [newAdminRole, setNewAdminRole] = useState('host'); // 'host' or 'admin'
  const [adminMsg, setAdminMsg] = useState('');
  const [newPass, setNewPass] = useState('');
  const [pwdMsg, setPwdMsg] = useState(null);

  useEffect(() => {
    const initAuth = async () => { 
      try { 
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token); 
        } else {
          await signInAnonymously(auth); 
        }
      } catch(e) { console.error("Auth error", e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => { 
      if (user) setIsAuthReady(true); 
    });
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

    const unsubscribeLogs = onSnapshot(collection(db, getPath('auditLogs')), 
      (s) => {
        if (isMounted) setAuditLogs(s.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (e) => console.error("Audit log permission error:", e)
    );

    return () => { 
      isMounted = false;
      unsubscribeParties(); 
      unsubscribeAdmins(); 
      unsubscribeLogs();
    };
  }, [isAuthReady]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1; // Mon=0..Sun=6
    
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

  const hasEvent = (date) => parties.some(p => new Date(p.date).toDateString() === date.toDateString());

  const handleGoogleLogin = async () => {
    setAuthError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const googleUsername = result.user.displayName || result.user.email.split('@')[0];
      
      // Check if already registered in admins/hosts collection
      const existing = admins.find(a => a.username.toLowerCase() === googleUsername.toLowerCase());
      const role = existing ? (existing.role || 'host') : 'host';

      const userObj = {
        id: existing?.id || result.user.uid,
        username: googleUsername,
        email: result.user.email,
        photoURL: result.user.photoURL,
        role: role
      };

      setCurrentUser(userObj);
      localStorage.setItem(SESSION_KEY, JSON.stringify(userObj));
      setFormData(prev => ({ ...prev, hostName: userObj.username }));
      setShowAuthGate(false);

      await addDoc(collection(db, getPath('auditLogs')), {
        action: 'GOOGLE_LOGIN',
        details: `Google Sign-In by ${userObj.username} (${userObj.email}) as ${role}`,
        user: userObj.username,
        role: role,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Google Auth error:", error);
      setAuthError('Google Sign-In failed. Please try again.');
    }
  };

  const handleLegacyLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (gateU.toLowerCase() === 'mike' && gateP === 'Owner123') {
      const user = { id: 'owner', username: 'Mike', role: 'owner' };
      setCurrentUser(user);
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      setShowAuthGate(false);
      setGateU(''); setGateP('');
      
      await addDoc(collection(db, getPath('auditLogs')), {
        action: 'OWNER_LOGIN',
        details: `Master Owner 'Mike' logged in.`,
        user: 'Mike',
        role: 'owner',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const foundAdmin = admins.find(a => a.username.toLowerCase() === gateU.toLowerCase());
    if (foundAdmin) {
      if (foundAdmin.password === gateP) {
        const user = { id: foundAdmin.id, username: foundAdmin.username, role: foundAdmin.role || 'host' };
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        setShowAuthGate(false);
        setGateU(''); setGateP('');

        await addDoc(collection(db, getPath('auditLogs')), {
          action: 'CREDENTIAL_LOGIN',
          details: `User '${foundAdmin.username}' logged in as ${foundAdmin.role || 'host'}.`,
          user: foundAdmin.username,
          role: foundAdmin.role || 'host',
          timestamp: new Date().toISOString()
        });
      } else {
        setLoginError('Invalid password');
      }
    } else {
      // Automatic registration as Host if user does not exist
      try {
        const docRef = await addDoc(collection(db, getPath('admins')), {
          username: gateU.trim(),
          password: gateP,
          role: 'host',
          createdAt: new Date().toISOString()
        });

        const newUser = { id: docRef.id, username: gateU.trim(), role: 'host' };
        setCurrentUser(newUser);
        localStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
        setShowAuthGate(false);
        setGateU(''); setGateP('');

        await addDoc(collection(db, getPath('auditLogs')), {
          action: 'AUTO_REGISTER_HOST',
          details: `New host account automatically registered for '${newUser.username}'.`,
          user: newUser.username,
          role: 'host',
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error("Auto registration error:", err);
        setLoginError('Registration error. Please try again.');
      }
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminU.trim() || !newAdminP.trim()) return setAdminMsg("Fields cannot be empty.");
    if (newAdminU.toLowerCase() === 'mike') return setAdminMsg("Cannot use 'Mike' as username.");
    if (admins.some(a => a.username.toLowerCase() === newAdminU.toLowerCase())) return setAdminMsg("Username already exists.");
    
    await addDoc(collection(db, getPath('admins')), { 
      username: newAdminU, 
      password: newAdminP, 
      role: newAdminRole, // 'host' or 'admin'
      createdAt: new Date().toISOString()
    });

    await addDoc(collection(db, getPath('auditLogs')), {
      action: 'CREATE_ACCOUNT',
      details: `Created new ${newAdminRole} account for '${newAdminU}'.`,
      user: currentUser?.username || 'Mike',
      role: currentUser?.role || 'owner',
      timestamp: new Date().toISOString()
    });

    setNewAdminU(''); setNewAdminP('');
    setAdminMsg(`${newAdminRole === 'host' ? 'Host' : 'Admin'} account created successfully!`);
    setTimeout(() => setAdminMsg(''), 3000);
  };

  const handleToggleRole = async (id, currentRole, uname) => {
    const newRole = currentRole === 'admin' ? 'host' : 'admin';
    await updateDoc(doc(db, getPath('admins'), id), { role: newRole });
    await addDoc(collection(db, getPath('auditLogs')), {
      action: 'UPDATE_ROLE',
      details: `Changed role for user '${uname}' to ${newRole}.`,
      user: currentUser?.username || 'Mike',
      role: currentUser?.role || 'owner',
      timestamp: new Date().toISOString()
    });
  };

  const handleDeleteAdmin = async (id, uname) => {
    await deleteDoc(doc(db, getPath('admins'), id));
    await addDoc(collection(db, getPath('auditLogs')), {
      action: 'DELETE_ACCOUNT',
      details: `Deleted account for user '${uname}'.`,
      user: currentUser?.username || 'Mike',
      role: currentUser?.role || 'owner',
      timestamp: new Date().toISOString()
    });
  };

  const handleExecuteDelete = async () => {
    if (!deleteQueue) return;
    try {
      await deleteDoc(doc(db, getPath('parties'), deleteQueue.id));
      await addDoc(collection(db, getPath('auditLogs')), {
        action: 'DELETE_EVENT',
        details: `Deleted event '${deleteQueue.theme}' (${deleteQueue.date}).`,
        user: currentUser?.username || 'Unknown',
        role: currentUser?.role || 'host',
        timestamp: new Date().toISOString()
      });
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
      await addDoc(collection(db, getPath('auditLogs')), {
        action: 'CHANGE_PASSWORD',
        details: `User '${currentUser.username}' updated their password.`,
        user: currentUser.username,
        role: currentUser.role,
        timestamp: new Date().toISOString()
      });

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
    if (checkEventClash(editModal, editModal.id)) {
      alert("Clash Detected: Another storyteller event is already scheduled during this duration window!");
      return;
    }
    
    const updatedEvent = { 
      ...editModal, 
      lastEditedBy: currentUser?.username || 'Storyteller Host', 
      lastEditedAt: new Date().toISOString() 
    };

    await updateDoc(doc(db, getPath('parties'), editModal.id), updatedEvent);
    
    await addDoc(collection(db, getPath('auditLogs')), {
      action: 'EDIT_EVENT',
      details: `Updated event '${editModal.theme}' scheduled for ${editModal.date} at ${editModal.startTime}.`,
      user: currentUser?.username || 'Unknown',
      role: currentUser?.role || 'host',
      timestamp: new Date().toISOString()
    });

    setEditModal(null);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (checkEventClash(formData)) {
      alert("Clash Detected: A party is already scheduled during this time slot!");
      return;
    }

    setIsSubmitting(true);
    try {
      const newEvent = { 
        ...formData, 
        duration: Number(formData.duration) || 120,
        status: 'approved', 
        addedBy: currentUser?.username || 'Verified Storyteller', 
        createdAt: new Date().toISOString() 
      };
      await addDoc(collection(db, getPath('parties')), newEvent);

      await addDoc(collection(db, getPath('auditLogs')), {
        action: 'CREATE_EVENT',
        details: `Created new event '${formData.theme}' for ${formData.date} at ${formData.startTime}.`,
        user: currentUser?.username || 'Unknown',
        role: currentUser?.role || 'host',
        timestamp: new Date().toISOString()
      });

      setFormData({ theme: '', hostName: currentUser?.username || '', coHost: '', date: '', startTime: '6:00 PM', duration: 120, performers: 'VU Storytellers' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'owner' || currentUser?.role === 'host';
  const todayPT = getPTDateInt(new Date().toISOString());
  const upcomingParties = parties
    .filter(p => p.date && getPTDateInt(p.date) >= todayPT)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="min-h-screen bg-[#0d0914] text-slate-100 font-sans selection:bg-purple-600 selection:text-white">
      <header className="relative z-40 bg-[#161026] border-b border-purple-500/10 p-4 flex justify-between items-center sticky top-0 shadow-lg shadow-black/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center border border-purple-400/30 shadow-md shadow-purple-900/40">
              <BookOpen size={22} className="text-white" />
            </div>
            <div>
              <h1 className="font-black text-white text-base tracking-wide">VU Storytellers</h1>
              <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Party Schedule Hub</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-purple-200/80 bg-purple-950/40 px-3 py-1 rounded-lg border border-purple-500/20 shadow-inner">
            <Clock size={11} className="text-purple-400 shrink-0" />
            <span className="font-bold">{ptTime}</span>
            <span className="opacity-60">PT</span>
          </div>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-3">
            <button onClick={() => setShowProfileModal(true)} className="flex items-center gap-2 text-xs bg-purple-600/15 hover:bg-purple-600/25 px-4 py-2 rounded-full font-bold text-purple-300 transition-all border border-purple-500/30 shadow-sm">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <Settings size={14} className="text-purple-400" />
              )}
              <span>{currentUser.username}</span>
              <span className="text-[9px] uppercase bg-purple-500/30 px-1.5 py-0.2 rounded text-purple-200 font-mono">{currentUser.role}</span>
            </button>
            <button onClick={() => { setCurrentUser(null); setView('Guide'); localStorage.removeItem(SESSION_KEY); }} title="Sign Out" className="text-xs font-black uppercase text-rose-400 hover:text-rose-300 p-2 bg-rose-500/10 rounded-xl border border-rose-500/20 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button onClick={() => setShowAuthGate(true)} className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-purple-900/30 border border-purple-400/30">
            <Shield size={15} /> Sign-In
          </button>
        )}
      </header>

      {/* Navigation tabs */}
      <div className="flex p-4 gap-2.5 bg-[#120d1f]/80 border-b border-purple-500/10 overflow-x-auto relative z-30 max-w-4xl mx-auto mt-2 rounded-2xl shadow-inner">
        {['Guide', 'Monthly', canManage ? 'Manage' : '', currentUser?.role === 'owner' ? 'Staff' : '', currentUser?.role === 'owner' ? 'Audit Logs' : ''].filter(Boolean).map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`px-6 py-3 rounded-xl text-xs font-black uppercase flex items-center gap-2 whitespace-nowrap transition-all ${view === t ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30 border border-purple-400/30 scale-[1.02]' : 'bg-[#1a1429] text-slate-400 hover:bg-[#231b38] hover:text-slate-200 border border-white/5'}`}
          >
            {t === 'Guide' && <BookOpen size={14} />}
            {t === 'Monthly' && <Calendar size={14} />}
            {t === 'Manage' && <Edit size={14} />}
            {t === 'Staff' && <Users size={14} />}
            {t === 'Audit Logs' && <Activity size={14} />}
            {t}
          </button>
        ))}
      </div>

      <main className="p-4 md:p-6 max-w-4xl mx-auto relative z-10">
        {view === 'Guide' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-950/40 to-indigo-950/40 p-6 rounded-3xl border border-purple-500/20 shadow-xl relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
              <h2 className="font-black text-white text-2xl mb-1 flex items-center gap-2.5">
                <Award className="text-purple-400" size={26} /> VU Storytellers Party Schedule
              </h2>
              <p className="text-sm text-purple-200/70 font-medium">Browse upcoming immersive storytelling gatherings, check live rooms, and view schedule details in Pacific Time.</p>
            </div>
            
            {/* Tab Buttons */}
            <div className="flex gap-3 border-b border-purple-500/10 pb-1">
              <button 
                onClick={() => setGuideTab('current')}
                className={`pb-2.5 px-5 font-black text-sm uppercase tracking-wider transition-all rounded-t-lg ${guideTab === 'current' ? 'text-white border-b-2 border-purple-500 bg-purple-600/10' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Current Month Events
              </button>
              <button 
                onClick={() => setGuideTab('next')}
                className={`pb-2.5 px-5 font-black text-sm uppercase tracking-wider transition-all rounded-t-lg ${guideTab === 'next' ? 'text-white border-b-2 border-purple-500 bg-purple-600/10' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Upcoming Month Events
              </button>
            </div>
      
            {/* Tab Content */}
            <div className="bg-[#151022] border border-purple-500/15 p-6 rounded-3xl shadow-xl min-h-[300px]">
              <div className="mb-5 text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
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
                <div className="space-y-3.5">
                  {thisMonthEvents.length > 0 ? thisMonthEvents.map(p => <EventCard key={p.id} p={p}/>) : <p className="text-slate-500 text-sm italic py-10 text-center">No storytelling parties scheduled for this month.</p>}
                </div>
              ) : (
                <div className="space-y-3.5">
                  {nextMonthEvents.length > 0 ? nextMonthEvents.map(p => <EventCard key={p.id} p={p}/>) : <p className="text-slate-500 text-sm italic py-10 text-center">No events scheduled for the upcoming month yet.</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'Monthly' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-[#151022] p-5 rounded-2xl border border-purple-500/15 shadow-lg">
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-2.5 hover:bg-purple-600/20 rounded-xl transition-colors text-purple-300"><ChevronLeft size={20}/></button>
              <span className="font-black text-white uppercase tracking-widest text-sm md:text-base">{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-2.5 hover:bg-purple-600/20 rounded-xl transition-colors text-purple-300"><ChevronRight size={20}/></button>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, index) => (
                <div key={`day-header-${index}`} className="text-xs font-black text-purple-400 pb-2 text-center uppercase">{d}</div>
              ))}
              {calendarDays.map((d, i) => {
                const hasEventToday = hasEvent(d.date);
                const isEventDay = d.monthType === 'current' && hasEventToday;
                
                return (
                  <button 
                    key={`day-cell-${i}`} 
                    onClick={() => setSelectedDay(d.date)} 
                    className={`aspect-square flex flex-col items-center justify-center text-sm md:text-base font-bold rounded-2xl relative transition-all 
                      ${d.monthType === 'current' ? 'text-white' : 'text-slate-600'}
                      ${selectedDay?.toDateString() === d.date.toDateString() 
                        ? 'bg-gradient-to-br from-purple-600 to-indigo-600 !text-white shadow-lg shadow-purple-900/50 scale-105 border border-purple-400/40' 
                        : isEventDay 
                          ? 'bg-purple-900/30 border border-purple-500/40 text-purple-200' 
                          : d.monthType === 'current' ? 'bg-[#151022]' : 'bg-[#0a0712]'}
                      hover:bg-purple-600/10 border border-purple-500/10`}
                  >
                    {d.date.getDate()}
                    {hasEventToday && (
                      <div className={`absolute bottom-2.5 w-2 h-2 rounded-full ${selectedDay?.toDateString() === d.date.toDateString() ? 'bg-white animate-pulse' : 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.8)]'}`}></div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {view === 'Manage' && canManage && (
          <div className="space-y-8">
            <form onSubmit={handleAdd} className="bg-[#151022] border border-purple-500/20 p-6 md:p-8 rounded-3xl shadow-xl grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="col-span-full">
                <h3 className="font-black text-lg text-white mb-1">Schedule New Storyteller Gathering</h3>
                <p className="text-xs text-slate-400">Signed in as: <span className="text-purple-400 font-bold">{currentUser?.username || 'Host'}</span> ({currentUser?.role})</p>
              </div>
              <input required placeholder="Event Theme / Title" className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors text-white text-sm" value={formData.theme} onChange={e=>setFormData({...formData, theme: e.target.value})}/>
              <input required placeholder="Host Name (IMVU Username)" className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors text-white text-sm" value={formData.hostName} onChange={e=>setFormData({...formData, hostName: e.target.value})}/>
              <input placeholder="Co-Host Name (Optional)" className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors text-white text-sm" value={formData.coHost} onChange={e=>setFormData({...formData, coHost: e.target.value})}/>
              <select required className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-slate-300 focus:outline-none focus:border-purple-500 transition-colors text-sm" value={formData.performers} onChange={e=>setFormData({...formData, performers: e.target.value})}>
                <option value="VU Storytellers">VU Storytellers</option>
                <option value="Guest Troupe">Guest Troupe</option>
                <option value="Special Feature">Special Feature</option>
              </select>
              <select required className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-slate-300 focus:outline-none focus:border-purple-500 transition-colors text-sm" value={formData.startTime} onChange={e=>setFormData({...formData, startTime: e.target.value})}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select required className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-slate-300 focus:outline-none focus:border-purple-500 transition-colors text-sm" value={formData.duration} onChange={e=>setFormData({...formData, duration: Number(e.target.value)})}>
                {DURATION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <input required type="date" className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-slate-300 focus:outline-none focus:border-purple-500 transition-colors text-sm col-span-full md:col-span-1" value={formData.date} onChange={e=>setFormData({...formData, date: e.target.value})}/>
              
              <button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl font-black p-4 col-span-full hover:from-purple-500 hover:to-indigo-500 transition-all text-white mt-2 shadow-lg shadow-purple-900/40 disabled:opacity-50">
                {isSubmitting ? 'SCHEDULING...' : 'ADD PARTY TO SCHEDULE'}
              </button>
            </form>
        
            <div className="space-y-4">
              <h3 className="font-black text-lg text-white flex items-center gap-2"><Archive size={18} className="text-purple-400"/> Active Storyteller Events</h3>
              {upcomingParties.length > 0 ? (
                upcomingParties.map(p => (
                  <div key={p.id} className="bg-[#151022] border border-purple-500/15 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-md">
                    <div className="flex flex-col gap-1.5">
                      <span className="font-bold text-white text-base">{p.theme || 'Untitled Event'}</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 font-bold">
                        <span className="text-purple-300">{p.date}</span>
                        <span>{formatTime(p.startTime)} ({p.duration ? `${p.duration / 60}h` : '2h'})</span>
                        <span>Host: <strong className="text-white">{p.hostName || 'N/A'}</strong></span>
                        {p.addedBy && <span className="text-slate-500 font-normal">Added by: {p.addedBy}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto justify-end">
                      <button onClick={() => setEditModal(p)} className="p-2.5 bg-[#0e0a19] border border-purple-500/20 hover:bg-purple-600/20 rounded-xl text-purple-400 transition-colors"><Edit size={16}/></button>
                      <button onClick={() => setDeleteQueue(p)} className="p-2.5 bg-[#0e0a19] border border-purple-500/20 hover:bg-rose-500/20 rounded-xl text-rose-400 transition-colors"><Trash2 size={16}/></button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-500 text-sm italic">No active events to manage.</p>
              )}
            </div>
          </div>
        )}

        {view === 'Staff' && currentUser?.role === 'owner' && (
          <div className="space-y-8">
            <div className="bg-[#151022] border border-purple-500/20 p-6 md:p-8 rounded-3xl shadow-xl">
              <h3 className="font-black text-lg text-white mb-4">Create Host or Staff Account</h3>
              <form onSubmit={handleAddAdmin} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input placeholder="IMVU Username / ID" value={newAdminU} onChange={e=>setNewAdminU(e.target.value)} className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors text-sm" />
                <input placeholder="Assigned Password" type="password" value={newAdminP} onChange={e=>setNewAdminP(e.target.value)} className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors text-sm" />
                <select className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-slate-300 focus:outline-none focus:border-purple-500 text-sm" value={newAdminRole} onChange={e=>setNewAdminRole(e.target.value)}>
                  <option value="host">Storyteller Host</option>
                  <option value="admin">Staff Admin</option>
                </select>
                {adminMsg && <div className="col-span-full text-sm font-bold text-emerald-400 mt-1">{adminMsg}</div>}
                <button type="submit" className="col-span-full bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl font-black p-4 text-white hover:from-purple-500 hover:to-indigo-500 transition-all shadow-lg shadow-purple-900/40">CREATE ACCOUNT</button>
              </form>
            </div>

            <div className="space-y-4">
              <h3 className="font-black text-lg text-white mb-2">Registered Storytellers & Staff Accounts</h3>
              {admins.map(a => (
                <div key={a.id} className="bg-[#151022] border border-purple-500/15 p-5 rounded-2xl flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-3">
                    <Shield size={18} className="text-purple-400"/>
                    <div>
                      <span className="font-bold text-white">{a.username}</span>
                      <button onClick={()=>handleToggleRole(a.id, a.role || 'host', a.username)} className="ml-3 text-[10px] uppercase bg-purple-500/20 hover:bg-purple-500/30 px-2 py-0.5 rounded text-purple-300 font-mono transition-colors">
                        {a.role || 'host'} (Click to change)
                      </button>
                    </div>
                  </div>
                  <button onClick={()=>handleDeleteAdmin(a.id, a.username)} className="p-2.5 bg-[#0e0a19] border border-purple-500/20 hover:bg-rose-500/20 rounded-xl text-rose-400 transition-colors"><Trash2 size={16}/></button>
                </div>
              ))}
              {admins.length === 0 && <p className="text-slate-500 text-sm italic">No registered host/staff accounts found.</p>}
            </div>
          </div>
        )}

        {view === 'Audit Logs' && currentUser?.role === 'owner' && (
          <div className="space-y-6">
            <div className="bg-[#151022] border border-purple-500/20 p-6 md:p-8 rounded-3xl shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-lg text-white flex items-center gap-2.5">
                  <Activity className="text-purple-400" size={20} /> Master Access & Activity Log (Mike's View)
                </h3>
                <span className="text-xs text-purple-300 font-mono bg-purple-950/60 px-3 py-1 rounded-lg border border-purple-500/30">
                  {auditLogs.length} Events Recorded
                </span>
              </div>

              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {auditLogs
                  .slice()
                  .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
                  .map(log => (
                    <div key={log.id} className="bg-[#0e0a19] p-4 rounded-xl border border-purple-500/15 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs shadow-inner">
                      <div className="flex items-start md:items-center gap-3">
                        <span className="bg-purple-600/20 text-purple-300 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider font-black shrink-0 border border-purple-500/30">
                          {log.action}
                        </span>
                        <div>
                          <p className="text-white font-bold">{log.details}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">User: <strong className="text-purple-300">{log.user}</strong> ({log.role})</p>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono shrink-0">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''} PT
                      </div>
                    </div>
                  ))}
                {auditLogs.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-10 italic">No activity logs recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Monthly Day Modal */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-md">
           <div className="bg-[#151022] p-6 rounded-3xl w-full max-w-lg border border-purple-500/30 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center mb-2 pb-4 border-b border-purple-500/15">
                  <h2 className="font-black text-lg text-white">Events for {selectedDay.toDateString()}</h2>
                  <button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-white transition-colors bg-purple-600/10 p-2 rounded-full border border-purple-500/20"><X size={18}/></button>
              </div>
              {parties.filter(p => new Date(p.date).toDateString() === selectedDay.toDateString()).map(p => <EventCard key={p.id} p={p}/>)}
              {parties.filter(p => new Date(p.date).toDateString() === selectedDay.toDateString()).length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-10 italic">No storyteller gatherings scheduled for this date.</p>
              )}
           </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-md">
           <form onSubmit={handleUpdate} className="bg-[#151022] p-6 md:p-8 rounded-3xl w-full max-w-lg border border-purple-500/30 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center mb-2 pb-4 border-b border-purple-500/15">
                  <h2 className="font-black text-lg text-white flex items-center gap-2"><Edit size={18} className="text-purple-400"/> Edit Storyteller Gathering</h2>
                  <button type="button" onClick={() => setEditModal(null)} className="text-slate-400 hover:text-white bg-purple-600/10 p-2 rounded-full border border-purple-500/20"><X size={16}/></button>
              </div>
              
              <input required placeholder="Event Theme" className="w-full bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 text-white text-sm transition-colors" value={editModal.theme} onChange={e=>setEditModal({...editModal, theme: e.target.value})}/>
              <input required placeholder="Host Name (IMVU Username)" className="w-full bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 text-white text-sm transition-colors" value={editModal.hostName} onChange={e=>setEditModal({...editModal, hostName: e.target.value})}/>
              <input placeholder="Co-Host Name (Optional)" className="w-full bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 placeholder:text-slate-600 focus:outline-none focus:border-purple-500 text-white text-sm transition-colors" value={editModal.coHost} onChange={e=>setEditModal({...editModal, coHost: e.target.value})}/>
              
              <select required className="w-full bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-slate-300 focus:outline-none focus:border-purple-500 text-sm transition-colors" value={editModal.performers} onChange={e=>setEditModal({...editModal, performers: e.target.value})}>
                <option value="VU Storytellers">VU Storytellers</option>
                <option value="Guest Troupe">Guest Troupe</option>
                <option value="Special Feature">Special Feature</option>
              </select>
              
              <select required className="w-full bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-slate-300 focus:outline-none focus:border-purple-500 text-sm transition-colors" value={editModal.startTime} onChange={e=>setEditModal({...editModal, startTime: e.target.value})}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <select required className="w-full bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-slate-300 focus:outline-none focus:border-purple-500 text-sm transition-colors" value={editModal.duration || 120} onChange={e=>setEditModal({...editModal, duration: Number(e.target.value)})}>
                {DURATION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              
              <input required type="date" className="w-full bg-[#0e0a19] p-4 rounded-xl border border-purple-500/20 text-slate-300 focus:outline-none focus:border-purple-500 text-sm transition-colors" value={editModal.date} onChange={e=>setEditModal({...editModal, date: e.target.value})}/>
              
              <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setEditModal(null)} className="bg-[#0e0a19] border border-purple-500/20 flex-1 p-4 rounded-xl flex items-center justify-center gap-2 font-black text-slate-300 hover:bg-purple-600/10 transition-colors text-sm">
                      CANCEL
                  </button>
                  <button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 flex-1 p-4 rounded-xl flex items-center justify-center gap-2 font-black text-white hover:from-purple-500 hover:to-indigo-500 transition-all shadow-lg shadow-purple-900/40 text-sm">
                      <Save size={18}/> SAVE
                  </button>
              </div>
           </form>
        </div>
      )}

      {/* Auth Gate Modal with Google & Credentials */}
      {showAuthGate && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-md">
           <div className="bg-[#151022] p-8 rounded-3xl w-full max-w-sm border border-purple-500/30 shadow-2xl space-y-6">
              <div className="flex justify-between items-center">
                  <h2 className="font-black text-xl text-white flex items-center gap-2.5"><Shield size={20} className="text-purple-400"/> Sign-In</h2>
                  <button onClick={() => { setShowAuthGate(false); setLoginError(''); setAuthError(''); }} className="text-slate-400 hover:text-white bg-purple-600/10 p-2 rounded-full border border-purple-500/20"><X size={16}/></button>
              </div>

              {/* Google Sign-In Option */}
              <div className="space-y-3">
                <button 
                  onClick={handleGoogleLogin} 
                  className="w-full bg-white hover:bg-slate-100 text-slate-900 transition-all py-3.5 px-4 rounded-xl font-bold flex items-center justify-center gap-3 shadow-md text-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  Sign in with Google
                </button>
                {authError && <p className="text-rose-400 text-xs font-bold text-center">{authError}</p>}
              </div>

              <div className="flex items-center gap-4 text-xs text-slate-500 uppercase font-bold tracking-widest">
                <div className="h-px bg-purple-500/20 flex-1"></div>
                <span>or IMVU username</span>
                <div className="h-px bg-purple-500/20 flex-1"></div>
              </div>

              <form onSubmit={handleLegacyLogin} className="space-y-3.5">
                <input placeholder="IMVU Username / ID" value={gateU} onChange={e=>setGateU(e.target.value)} className="w-full bg-[#0e0a19] border border-purple-500/20 rounded-xl p-3.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors"/>
                <div className="relative">
                    <input type={showPass ? "text" : "password"} placeholder="Password" value={gateP} onChange={e=>setGateP(e.target.value)} className="w-full bg-[#0e0a19] border border-purple-500/20 rounded-xl p-3.5 pr-12 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors"/>
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-3.5 text-slate-400 hover:text-white transition-colors">{showPass ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                </div>
                {loginError && <p className="text-rose-400 text-xs font-bold pt-1">{loginError}</p>}
                <button type="submit" className="w-full bg-[#201836] hover:bg-[#2c224a] transition-all py-3.5 rounded-xl font-bold text-white text-sm border border-purple-500/30">Sign In with Password</button>
              </form>
           </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-md">
           <form onSubmit={handleChangePassword} className="bg-[#151022] p-8 rounded-3xl w-full max-w-sm border border-purple-500/30 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center mb-2">
                  <h2 className="font-black text-lg text-white">Storyteller Profile</h2>
                  <button type="button" onClick={()=>{ setShowProfileModal(false); setPwdMsg(null); setNewPass(''); }} className="text-slate-400 hover:text-white bg-purple-600/10 p-2 rounded-full border border-purple-500/20"><X size={16}/></button>
              </div>
              <div className="flex items-center gap-3 bg-[#0e0a19] p-3.5 rounded-2xl border border-purple-500/15">
                {currentUser?.photoURL ? (
                  <img src={currentUser.photoURL} alt="" className="w-10 h-10 rounded-full object-cover border border-purple-400/40" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-300 font-bold">
                    {currentUser?.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-bold text-white text-sm">{currentUser?.username}</p>
                  <p className="text-[11px] text-purple-400 font-mono capitalize">{currentUser?.role || 'host'} Account</p>
                </div>
              </div>

              {currentUser?.role !== 'owner' && !currentUser?.email && (
                <>
                  <p className="text-xs text-slate-400 font-medium pt-2">Change your password below.</p>
                  <input type="password" placeholder="Enter new password" value={newPass} onChange={e=>setNewPass(e.target.value)} className="w-full bg-[#0e0a19] p-3.5 rounded-xl border border-purple-500/20 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-purple-500 transition-colors" />
                  {pwdMsg && <p className={`text-xs font-bold ${pwdMsg.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>{pwdMsg.text}</p>}
                  <button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 w-full p-3.5 rounded-xl font-black text-white hover:from-purple-500 hover:to-indigo-500 transition-all shadow-md text-sm mt-1">UPDATE PASSWORD</button>
                </>
              )}
           </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteQueue && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[100] backdrop-blur-md">
            <div className="bg-[#151022] p-6 rounded-3xl w-full max-w-sm border border-rose-500/30 space-y-4 shadow-2xl">
                <h2 className="font-black text-white text-lg">Confirm Deletion</h2>
                <p className="text-sm text-slate-400">Are you sure you want to delete <span className="text-white font-bold">{deleteQueue.theme}</span>?</p>
                <div className="flex gap-3 mt-4">
                    <button onClick={() => setDeleteQueue(null)} className="flex-1 p-3 bg-[#0e0a19] border border-purple-500/20 rounded-xl font-bold text-white hover:bg-purple-600/10 transition-colors text-sm">Cancel</button>
                    <button onClick={handleExecuteDelete} className="flex-1 p-3 bg-rose-600 rounded-xl font-bold text-white hover:bg-rose-500 transition-all shadow-lg shadow-rose-900/40 text-sm">Yes, Delete</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

function EventCard({ p }) {
    const duration = p.duration || 120;
    const live = isEventLive(p.date, p.startTime, duration);

    return (
        <div className={`bg-[#151022] border p-5 rounded-2xl mb-3.5 relative transition-all duration-300 shadow-md
            ${live 
                ? 'border-purple-500/60 shadow-[0_0_25px_rgba(168,85,247,0.35)] ring-1 ring-purple-500/40 bg-gradient-to-br from-[#1c1330] to-[#151022]' 
                : 'border-purple-500/15 hover:border-purple-500/30 hover:shadow-[0_0_20px_rgba(168,85,247,0.1)]'
            }`}>
            
            {/* Header: Theme and Live Badge */}
            <div className="flex justify-between items-start mb-3">
                <div className="font-black text-white text-base md:text-[17px] leading-tight flex items-center gap-2">
                  <span>{p.theme}</span>
                </div>
                {live && (
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-[10px] font-black px-2.5 py-1 rounded-lg animate-pulse text-white uppercase tracking-wider shrink-0 ml-2 shadow-md">
                        live now
                    </div>
                )}
            </div>

            {/* Content: Host, Role, Date, Time */}
            <div className="flex flex-col gap-2.5 text-sm font-bold">
                <div className="flex justify-between items-center text-xs">
                    <span className="tracking-widest flex items-center gap-1.5">
                        <span className="text-purple-400/70 uppercase text-[10px]">Host:</span>
                        <span className="text-white font-semibold">{p.hostName}</span>
                    </span>
                    
                    <span className="bg-purple-500/15 text-purple-300 px-2.5 py-0.5 rounded-md text-[10px] border border-purple-500/30 uppercase tracking-wider font-mono">
                        {p.performers || 'VU Storytellers'}
                    </span>
                </div>
                
                {/* Date and Time Row */}
                <div className="flex justify-between items-center mt-1 pt-2.5 border-t border-purple-500/10 text-xs">
                    <div className="flex flex-col">
                        <span className="text-[9px] text-purple-400/60 uppercase tracking-widest font-mono">Date</span>
                        <span className="text-white font-bold">{formatDate(p.date)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] text-purple-400/60 uppercase tracking-widest font-mono">Time & Duration</span>
                        <span className="text-white font-bold">{formatTime(p.startTime)} <span className="text-purple-400 font-normal">({duration / 60}h)</span></span>
                    </div>
                </div>
            </div>
        </div>
    );
}
