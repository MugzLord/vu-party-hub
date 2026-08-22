import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarDays, LogOut, ChevronLeft, ChevronRight, 
  Shield, Calendar, BookOpen, Trash2, Edit, Clock, User, Users, X, Save, Settings, Eye, EyeOff, Archive, Award, CheckCircle, Activity, AlertTriangle, Sparkles, Flame, Radio
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
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
const getPath = (colName) => typeof __app_id !== 'undefined' ? `artifacts/${__app_id}/public/data/${colName}` : colName;
const SESSION_KEY = 'vu_storytellers_party_hub_v750';

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
  const [notifications, setNotifications] = useState([]);
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
  const [customAlert, setCustomAlert] = useState(null); // { message, title }
  
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
        return (m - 1) === currentMonthIdx && y === currentYear && getPTDateInt(p.date) >= todayPT && p.status === 'approved';
      }).sort((a, b) => a.date.localeCompare(b.date)),
      
      nextMonthEvents: parties.filter(p => {
        const [y, m] = p.date ? p.date.split('-').map(Number) : [0, 0];
        return (m - 1) === nextMonthIdx && y === nextYear && p.status === 'approved';
      }).sort((a, b) => a.date.localeCompare(b.date))
    };
  }, [parties]);
  
  const [newAdminU, setNewAdminU] = useState('');
  const [newAdminP, setNewAdminP] = useState('');
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

    const unsubscribeNotifs = onSnapshot(collection(db, getPath('notifications')), 
      (s) => {
        if (isMounted) setNotifications(s.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (e) => console.error("Notification permission error:", e)
    );

    return () => { 
      isMounted = false;
      unsubscribeParties(); 
      unsubscribeAdmins(); 
      unsubscribeLogs();
      unsubscribeNotifs();
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

  const hasEvent = (date) => parties.some(p => p.status === 'approved' && new Date(p.date).toDateString() === date.toDateString());

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    
    if (gateU.trim().toLowerCase() === 'mike' && gateP === 'Owner123') {
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

    const foundAdmin = admins.find(a => a.username.toLowerCase() === gateU.trim().toLowerCase());
    if (foundAdmin) {
      if (foundAdmin.password === gateP) {
        const role = foundAdmin.role || 'host';
        const user = { id: foundAdmin.id, username: foundAdmin.username, role: role };
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        setShowAuthGate(false);
        setGateU(''); setGateP('');

        await addDoc(collection(db, getPath('auditLogs')), {
          action: 'CREDENTIAL_LOGIN',
          details: `User '${foundAdmin.username}' logged in as ${role}.`,
          user: foundAdmin.username,
          role: role,
          timestamp: new Date().toISOString()
        });
      } else {
        setLoginError('Incorrect password. Please try again.');
      }
    } else {
      setLoginError('Username not found. Please contact Admin to get access.');
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
      role: 'host',
      createdAt: new Date().toISOString()
    });

    await addDoc(collection(db, getPath('auditLogs')), {
      action: 'CREATE_ACCOUNT',
      details: `Created new host account for '${newAdminU}'.`,
      user: currentUser?.username || 'Mike',
      role: currentUser?.role || 'owner',
      timestamp: new Date().toISOString()
    });

    setNewAdminU(''); setNewAdminP('');
    setAdminMsg("Host account created successfully!");
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

  const handleApproveEvent = async (party) => {
    await updateDoc(doc(db, getPath('parties'), party.id), { status: 'approved' });
    await addDoc(collection(db, getPath('auditLogs')), {
      action: 'APPROVE_EVENT',
      details: `Approved event '${party.theme}' scheduled for ${party.date}.`,
      user: currentUser?.username || 'Admin',
      role: currentUser?.role || 'admin',
      timestamp: new Date().toISOString()
    });
    await addDoc(collection(db, getPath('notifications')), {
      message: `Party "${party.theme}" on ${party.date} has been approved by admin!`,
      timestamp: new Date().toISOString(),
      forHost: party.hostName
    });
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
      setCustomAlert({ title: 'Clash Detected', message: 'Another storyteller event is already scheduled during this duration window!' });
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
      setCustomAlert({ title: 'Clash Detected', message: 'A party is already scheduled during this time slot!' });
      return;
    }

    setIsSubmitting(true);
    try {
      const isOwnerOrAdmin = currentUser?.role === 'owner' || currentUser?.role === 'admin';
      const newEvent = { 
        ...formData, 
        duration: Number(formData.duration) || 120,
        status: isOwnerOrAdmin ? 'approved' : 'pending', 
        addedBy: currentUser?.username || 'Verified Storyteller', 
        createdAt: new Date().toISOString() 
      };
      await addDoc(collection(db, getPath('parties')), newEvent);

      await addDoc(collection(db, getPath('auditLogs')), {
        action: 'SUBMIT_EVENT',
        details: `Submitted new event '${formData.theme}' for ${formData.date} at ${formData.startTime} (Status: ${newEvent.status}).`,
        user: currentUser?.username || 'Unknown',
        role: currentUser?.role || 'host',
        timestamp: new Date().toISOString()
      });

      setFormData({ theme: '', hostName: currentUser?.username || '', coHost: '', date: '', startTime: '6:00 PM', duration: 120, performers: 'VU Storytellers' });
      setCustomAlert({ 
        title: isOwnerOrAdmin ? 'Success' : 'Submitted for Approval', 
        message: isOwnerOrAdmin ? 'Party added successfully!' : 'Party submitted successfully! Waiting for admin approval.' 
      });
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
    <div className="min-h-screen bg-[#09060f] text-slate-100 font-sans selection:bg-purple-600 selection:text-white relative overflow-hidden">
      {/* Background ambient glowing gradient orbs for vibrant life */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-700/15 rounded-full blur-[130px] pointer-events-none animate-pulse"></div>
      <div className="absolute top-1/3 right-10 w-[400px] h-[400px] bg-indigo-600/15 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-10 left-10 w-[450px] h-[450px] bg-fuchsia-600/10 rounded-full blur-[150px] pointer-events-none"></div>

      {/* Header */}
      <header className="relative z-40 bg-[#140d24]/90 border-b border-purple-500/20 p-4 md:px-8 flex justify-between items-center sticky top-0 shadow-xl shadow-black/60 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-tr from-purple-600 via-indigo-600 to-fuchsia-500 rounded-2xl flex items-center justify-center border border-purple-400/40 shadow-lg shadow-purple-900/60 transform hover:scale-105 transition-transform">
              <Sparkles size={22} className="text-white animate-spin" style={{ animationDuration: '8s' }} />
            </div>
            <div>
              <h1 className="font-black text-white text-lg tracking-wide bg-gradient-to-r from-white via-purple-200 to-fuchsia-300 bg-clip-text text-transparent">VU Storytellers</h1>
              <p className="text-[11px] text-purple-400 font-bold uppercase tracking-widest flex items-center gap-1">
                <Flame size={12} className="text-amber-400 fill-amber-400" /> Party Schedule Hub
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-purple-200/90 bg-purple-950/60 px-3.5 py-1.5 rounded-xl border border-purple-500/30 shadow-inner">
            <Clock size={13} className="text-purple-400 shrink-0 animate-pulse" />
            <span className="font-extrabold">{ptTime}</span>
            <span className="opacity-60 text-[10px]">PT</span>
          </div>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-3">
            <button onClick={() => setShowProfileModal(true)} className="flex items-center gap-2 text-xs bg-gradient-to-r from-purple-900/50 to-indigo-900/50 hover:from-purple-800/60 hover:to-indigo-800/60 px-4 py-2 rounded-2xl font-bold text-purple-200 transition-all border border-purple-500/40 shadow-md shadow-purple-950/50 group">
              <Settings size={14} className="text-purple-400 group-hover:rotate-90 transition-transform duration-300" />
              <span className="font-extrabold">{currentUser.username}</span>
              <span className="text-[9px] uppercase bg-gradient-to-r from-purple-600 to-indigo-600 px-2 py-0.5 rounded-full text-white font-mono shadow-sm">{currentUser.role}</span>
            </button>
            <button onClick={() => { setCurrentUser(null); setView('Guide'); localStorage.removeItem(SESSION_KEY); }} title="Sign Out" className="text-xs font-black uppercase text-rose-400 hover:text-white p-2.5 bg-rose-500/10 hover:bg-rose-600 rounded-2xl border border-rose-500/30 transition-all shadow-md shadow-rose-950/40">
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button onClick={() => setShowAuthGate(true)} className="flex items-center gap-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 hover:from-purple-500 hover:to-indigo-500 transition-all px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-purple-900/50 border border-purple-400/40 transform hover:scale-105">
            <Shield size={16} className="text-purple-200" /> Sign-In
          </button>
        )}
      </header>

      {/* Notifications bar */}
      {notifications.length > 0 && (
        <div className="bg-gradient-to-r from-purple-900/60 via-indigo-900/60 to-purple-900/60 border-b border-purple-500/30 px-4 py-2.5 text-xs text-purple-100 flex items-center justify-center gap-3 shadow-lg">
          <span className="font-black uppercase tracking-widest bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white px-2.5 py-0.5 rounded-full text-[9px] shadow">Notice</span>
          <span className="truncate font-medium">{notifications[notifications.length - 1]?.message}</span>
        </div>
      )}

      {/* Navigation tabs */}
      <div className="flex p-3 gap-3 bg-[#110a1f]/90 border-b border-purple-500/15 overflow-x-auto relative z-30 max-w-4xl mx-auto mt-4 rounded-2xl shadow-2xl backdrop-blur-md">
        {['Guide', 'Monthly', canManage ? 'Submit Party' : '', currentUser?.role === 'owner' ? 'Staff' : '', currentUser?.role === 'owner' ? 'Audit Logs' : ''].filter(Boolean).map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className={`px-6 py-3.5 rounded-xl text-xs font-black uppercase flex items-center gap-2.5 whitespace-nowrap transition-all duration-300 ${view === t ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 text-white shadow-lg shadow-purple-600/40 border border-purple-400/50 scale-[1.03]' : 'bg-[#18112a] text-purple-300/70 hover:bg-[#22183b] hover:text-white border border-purple-500/10'}`}
          >
            {t === 'Guide' && <BookOpen size={15} className={view === t ? 'text-white' : 'text-purple-400'} />}
            {t === 'Monthly' && <Calendar size={15} className={view === t ? 'text-white' : 'text-purple-400'} />}
            {t === 'Submit Party' && <Edit size={15} className={view === t ? 'text-white' : 'text-purple-400'} />}
            {t === 'Staff' && <Users size={15} className={view === t ? 'text-white' : 'text-purple-400'} />}
            {t === 'Audit Logs' && <Activity size={15} className={view === t ? 'text-white' : 'text-purple-400'} />}
            {t}
          </button>
        ))}
      </div>

      <main className="p-4 md:p-8 max-w-4xl mx-auto relative z-10">
        {view === 'Guide' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-purple-950/70 via-indigo-950/60 to-[#18102d] p-7 rounded-3xl border border-purple-500/30 shadow-2xl shadow-purple-950/50 relative overflow-hidden backdrop-blur-md">
              <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-fuchsia-600/20 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute top-0 right-5 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none"></div>
              <h2 className="font-black text-white text-2xl md:text-3xl mb-2 flex items-center gap-3 drop-shadow-md">
                <Award className="text-fuchsia-400" size={30} /> VU Storytellers Party Schedule
              </h2>
              <p className="text-sm text-purple-200/80 font-medium leading-relaxed">Browse upcoming immersive storytelling gatherings, check live rooms, and view schedule details in Pacific Time.</p>
            </div>
            
            {/* Tab Buttons */}
            <div className="flex gap-4 border-b border-purple-500/20 pb-1">
              <button 
                onClick={() => setGuideTab('current')}
                className={`pb-3 px-6 font-black text-sm uppercase tracking-wider transition-all rounded-t-xl ${guideTab === 'current' ? 'text-white border-b-2 border-purple-500 bg-gradient-to-t from-purple-600/20 to-transparent shadow-sm' : 'text-purple-400/60 hover:text-purple-200'}`}
              >
                Current Month Events
              </button>
              <button 
                onClick={() => setGuideTab('next')}
                className={`pb-3 px-6 font-black text-sm uppercase tracking-wider transition-all rounded-t-xl ${guideTab === 'next' ? 'text-white border-b-2 border-purple-500 bg-gradient-to-t from-purple-600/20 to-transparent shadow-sm' : 'text-purple-400/60 hover:text-purple-200'}`}
              >
                Upcoming Month Events
              </button>
            </div>
      
            {/* Tab Content */}
            <div className="bg-[#130b20]/90 border border-purple-500/20 p-6 md:p-8 rounded-3xl shadow-2xl min-h-[320px] backdrop-blur-xl">
              <div className="mb-6 text-xs font-extrabold text-fuchsia-400 uppercase tracking-widest flex items-center gap-2 bg-purple-950/60 px-4 py-2 rounded-xl border border-purple-500/30 w-fit">
                <Calendar size={15} className="text-purple-300" />
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
                  {thisMonthEvents.length > 0 ? thisMonthEvents.map(p => <EventCard key={p.id} p={p}/>) : <p className="text-purple-400/60 text-sm italic py-16 text-center font-medium bg-[#1a112e]/50 rounded-2xl border border-purple-500/10">No storytelling parties scheduled for this month.</p>}
                </div>
              ) : (
                <div className="space-y-4">
                  {nextMonthEvents.length > 0 ? nextMonthEvents.map(p => <EventCard key={p.id} p={p}/>) : <p className="text-purple-400/60 text-sm italic py-16 text-center font-medium bg-[#1a112e]/50 rounded-2xl border border-purple-500/10">No events scheduled for the upcoming month yet.</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'Monthly' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-[#130b20]/90 p-5 md:p-6 rounded-3xl border border-purple-500/25 shadow-xl backdrop-blur-xl">
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-3 hover:bg-purple-600/30 rounded-2xl transition-all text-purple-200 border border-purple-500/20 shadow"><ChevronLeft size={22}/></button>
              <span className="font-black text-white uppercase tracking-widest text-base md:text-lg bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-3 hover:bg-purple-600/30 rounded-2xl transition-all text-purple-200 border border-purple-500/20 shadow"><ChevronRight size={22}/></button>
            </div>
            <div className="grid grid-cols-7 gap-3">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, index) => (
                <div key={`day-header-${index}`} className="text-xs font-black text-purple-400 pb-2 text-center uppercase tracking-wider">{d}</div>
              ))}
              {calendarDays.map((d, i) => {
                const hasEventToday = hasEvent(d.date);
                const isEventDay = d.monthType === 'current' && hasEventToday;
                
                return (
                  <button 
                    key={`day-cell-${i}`} 
                    onClick={() => setSelectedDay(d.date)} 
                    className={`aspect-square flex flex-col items-center justify-center text-base md:text-lg font-black rounded-2xl relative transition-all duration-300 
                      ${d.monthType === 'current' ? 'text-white' : 'text-slate-600'}
                      ${selectedDay?.toDateString() === d.date.toDateString() 
                        ? 'bg-gradient-to-br from-purple-600 via-indigo-600 to-fuchsia-600 !text-white shadow-xl shadow-purple-900/60 scale-105 border border-purple-300/50' 
                        : isEventDay 
                          ? 'bg-purple-900/40 border border-purple-500/50 text-purple-100 shadow-md shadow-purple-950/50' 
                          : d.monthType === 'current' ? 'bg-[#130b20]/90' : 'bg-[#0a0612]/80'}
                      hover:bg-purple-600/20 border border-purple-500/15`}
                  >
                    {d.date.getDate()}
                    {hasEventToday && (
                      <div className={`absolute bottom-3 w-2.5 h-2.5 rounded-full ${selectedDay?.toDateString() === d.date.toDateString() ? 'bg-white animate-ping' : 'bg-fuchsia-400 shadow-[0_0_12px_rgba(232,121,249,0.9)]'}`}></div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {view === 'Submit Party' && canManage && (
          <div className="space-y-8">
            <form onSubmit={handleAdd} className="bg-[#130b20]/90 border border-purple-500/25 p-6 md:p-10 rounded-3xl shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-6 backdrop-blur-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="col-span-full">
                <h3 className="font-black text-xl text-white mb-1 flex items-center gap-2">
                  <Sparkles className="text-purple-400" size={22} /> Schedule New VU Storyteller Party
                </h3>
                <p className="text-xs text-purple-300/70 font-medium">Signed in as: <span className="text-purple-300 font-bold bg-purple-950/80 px-2.5 py-0.5 rounded-lg border border-purple-500/30">{currentUser?.username || 'Host'}</span> ({currentUser?.role})</p>
              </div>
              <input required placeholder="Event Theme / Title" className="bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 placeholder:text-purple-400/40 focus:outline-none focus:border-purple-400 transition-all text-white text-sm shadow-inner" value={formData.theme} onChange={e=>setFormData({...formData, theme: e.target.value})}/>
              <input required placeholder="Host Name (IMVU Username)" className="bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 placeholder:text-purple-400/40 focus:outline-none focus:border-purple-400 transition-all text-white text-sm shadow-inner" value={formData.hostName} onChange={e=>setFormData({...formData, hostName: e.target.value})}/>
              <input placeholder="Co-Host Name (Optional)" className="bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 placeholder:text-purple-400/40 focus:outline-none focus:border-purple-400 transition-all text-white text-sm shadow-inner" value={formData.coHost} onChange={e=>setFormData({...formData, coHost: e.target.value})}/>
              <select required className="bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-purple-200 focus:outline-none focus:border-purple-400 transition-all text-sm shadow-inner" value={formData.performers} onChange={e=>setFormData({...formData, performers: e.target.value})}>
                <option value="VU Storytellers">VU Storytellers</option>
                <option value="Others">Others</option>                
              </select>
              <select required className="bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-purple-200 focus:outline-none focus:border-purple-400 transition-all text-sm shadow-inner" value={formData.startTime} onChange={e=>setFormData({...formData, startTime: e.target.value})}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select required className="bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-purple-200 focus:outline-none focus:border-purple-400 transition-all text-sm shadow-inner" value={formData.duration} onChange={e=>setFormData({...formData, duration: Number(e.target.value)})}>
                {DURATION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <input required type="date" className="bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-purple-200 focus:outline-none focus:border-purple-400 transition-all text-sm col-span-full md:col-span-1 shadow-inner" value={formData.date} onChange={e=>setFormData({...formData, date: e.target.value})}/>
              
              <button type="submit" disabled={isSubmitting} className="bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 rounded-2xl font-black p-4.5 col-span-full hover:from-purple-500 hover:to-indigo-500 transition-all text-white mt-3 shadow-xl shadow-purple-950/60 border border-purple-400/40 disabled:opacity-50 transform hover:scale-[1.01]">
                {isSubmitting ? 'SUBMITTING...' : 'SUBMIT PARTY FOR APPROVAL'}
              </button>
            </form>
        
            <div className="space-y-4">
              <h3 className="font-black text-xl text-white flex items-center gap-2"><Archive size={20} className="text-purple-400"/> Storyteller Events & Approvals</h3>
              {upcomingParties.length > 0 ? (
                upcomingParties.map(p => (
                  <div key={p.id} className="bg-[#130b20]/90 border border-purple-500/20 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl backdrop-blur-xl">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <span className="font-black text-white text-lg">{p.theme || 'Untitled Event'}</span>
                        <span className={`text-[10px] uppercase font-mono px-2.5 py-1 rounded-full font-black tracking-wider ${p.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'}`}>
                          {p.status || 'pending'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-purple-200/80 font-bold">
                        <span className="text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-500/20">{p.date}</span>
                        <span>{formatTime(p.startTime)} ({p.duration ? `${p.duration / 60}h` : '2h'})</span>
                        <span>Host: <strong className="text-white">{p.hostName || 'N/A'}</strong></span>
                      </div>
                    </div>
                    <div className="flex gap-2.5 w-full md:w-auto justify-end items-center">
                      {p.status !== 'approved' && (currentUser?.role === 'owner' || currentUser?.role === 'admin') && (
                        <button onClick={() => handleApproveEvent(p)} className="px-4 py-2.5 bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-200 text-xs font-black rounded-2xl transition-all flex items-center gap-1.5 shadow-md">
                          <CheckCircle size={15}/> Approve
                        </button>
                      )}
                      <button onClick={() => setEditModal(p)} className="p-3 bg-[#0b0615] border border-purple-500/30 hover:bg-purple-600/30 rounded-2xl text-purple-300 transition-all shadow"><Edit size={17}/></button>
                      <button onClick={() => setDeleteQueue(p)} className="p-3 bg-[#0b0615] border border-purple-500/30 hover:bg-rose-500/30 rounded-2xl text-rose-300 transition-all shadow"><Trash2 size={17}/></button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-purple-400/60 text-sm italic py-8 text-center bg-[#130b20]/50 rounded-2xl border border-purple-500/10">No active events to manage.</p>
              )}
            </div>
          </div>
        )}

        {view === 'Staff' && currentUser?.role === 'owner' && (
          <div className="space-y-8">
            <div className="bg-[#130b20]/90 border border-purple-500/25 p-6 md:p-8 rounded-3xl shadow-2xl backdrop-blur-xl">
              <h3 className="font-black text-xl text-white mb-4 flex items-center gap-2"><Users size={20} className="text-purple-400" /> Create Host or Staff Account</h3>
              <form onSubmit={handleAddAdmin} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input placeholder="IMVU Username" value={newAdminU} onChange={e=>setNewAdminU(e.target.value)} className="bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-white placeholder:text-purple-400/40 focus:outline-none focus:border-purple-400 transition-all text-sm shadow-inner" />
                <input placeholder="Assigned Password" type="password" value={newAdminP} onChange={e=>setNewAdminP(e.target.value)} className="bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-white placeholder:text-purple-400/40 focus:outline-none focus:border-purple-400 transition-all text-sm shadow-inner" />
                {adminMsg && <div className="col-span-full text-sm font-bold text-emerald-400 mt-1 bg-emerald-950/40 p-3 rounded-xl border border-emerald-500/30">{adminMsg}</div>}
                <button type="submit" className="col-span-full bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl font-black p-4 text-white hover:from-purple-500 hover:to-indigo-500 transition-all shadow-xl shadow-purple-950/60 border border-purple-400/40">CREATE HOST ACCOUNT</button>
              </form>
            </div>

            <div className="space-y-4">
              <h3 className="font-black text-xl text-white mb-2">Registered Storytellers & Staff Accounts</h3>
              {admins.map(a => (
                <div key={a.id} className="bg-[#130b20]/90 border border-purple-500/20 p-5 rounded-3xl flex justify-between items-center shadow-lg backdrop-blur-xl">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                      <Shield size={18}/>
                    </div>
                    <div>
                      <span className="font-extrabold text-white text-base">{a.username}</span>
                      <div>
                        <button onClick={()=>handleToggleRole(a.id, a.role || 'host', a.username)} className="mt-1 text-[10px] uppercase bg-purple-500/20 hover:bg-purple-500/40 px-2.5 py-1 rounded-lg text-purple-200 font-mono transition-all border border-purple-500/30 font-bold">
                          Role: {a.role || 'host'} (Click to toggle Admin)
                        </button>
                      </div>
                    </div>
                  </div>
                  <button onClick={()=>handleDeleteAdmin(a.id, a.username)} className="p-3 bg-[#0b0615] border border-purple-500/30 hover:bg-rose-500/30 rounded-2xl text-rose-300 transition-all shadow"><Trash2 size={17}/></button>
                </div>
              ))}
              {admins.length === 0 && <p className="text-purple-400/60 text-sm italic py-8 text-center bg-[#130b20]/50 rounded-2xl border border-purple-500/10">No registered accounts found.</p>}
            </div>
          </div>
        )}

        {view === 'Audit Logs' && currentUser?.role === 'owner' && (
          <div className="space-y-6">
            <div className="bg-[#130b20]/90 border border-purple-500/25 p-6 md:p-8 rounded-3xl shadow-2xl backdrop-blur-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-xl text-white flex items-center gap-2.5">
                  <Activity className="text-purple-400" size={22} /> Master Access & Activity Log (Mike's View)
                </h3>
                <span className="text-xs text-purple-200 font-mono bg-purple-950/80 px-3.5 py-1.5 rounded-xl border border-purple-500/40 shadow-inner font-extrabold">
                  {auditLogs.length} Events Recorded
                </span>
              </div>

              <div className="space-y-3.5 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {auditLogs
                  .slice()
                  .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
                  .map(log => (
                    <div key={log.id} className="bg-[#0b0615] p-4.5 rounded-2xl border border-purple-500/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs shadow-inner">
                      <div className="flex items-start md:items-center gap-3.5">
                        <span className="bg-purple-600/30 text-purple-200 px-3 py-1.5 rounded-xl text-[10px] font-mono uppercase tracking-wider font-black shrink-0 border border-purple-500/40 shadow-sm">
                          {log.action}
                        </span>
                        <div>
                          <p className="text-white font-extrabold text-sm">{log.details}</p>
                          <p className="text-xs text-purple-300/70 mt-0.5">User: <strong className="text-purple-200">{log.user}</strong> ({log.role})</p>
                        </div>
                      </div>
                      <div className="text-xs text-purple-400/80 font-mono shrink-0 bg-purple-950/50 px-3 py-1.5 rounded-xl border border-purple-500/20">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''} PT
                      </div>
                    </div>
                  ))}
                {auditLogs.length === 0 && (
                  <p className="text-purple-400/60 text-sm text-center py-16 italic font-medium bg-[#0b0615] rounded-2xl border border-purple-500/10">No activity logs recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Monthly Day Modal */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-md">
           <div className="bg-[#140d24] p-6 md:p-8 rounded-3xl w-full max-w-lg border border-purple-500/40 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl backdrop-blur-2xl">
              <div className="flex justify-between items-center mb-2 pb-4 border-b border-purple-500/20">
                  <h2 className="font-black text-xl text-white">Events for {selectedDay.toDateString()}</h2>
                  <button onClick={() => setSelectedDay(null)} className="text-purple-300 hover:text-white transition-colors bg-purple-600/20 p-2.5 rounded-2xl border border-purple-500/30"><X size={18}/></button>
              </div>
              {parties.filter(p => p.status === 'approved' && new Date(p.date).toDateString() === selectedDay.toDateString()).map(p => <EventCard key={p.id} p={p}/>)}
              {parties.filter(p => p.status === 'approved' && new Date(p.date).toDateString() === selectedDay.toDateString()).length === 0 && (
                  <p className="text-purple-400/60 text-sm text-center py-12 italic font-medium bg-[#0b0615] rounded-2xl border border-purple-500/10">No approved storyteller gatherings scheduled for this date.</p>
              )}
           </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-md">
           <form onSubmit={handleUpdate} className="bg-[#140d24] p-6 md:p-8 rounded-3xl w-full max-w-lg border border-purple-500/40 space-y-4 shadow-2xl backdrop-blur-2xl">
              <div className="flex justify-between items-center mb-2 pb-4 border-b border-purple-500/20">
                  <h2 className="font-black text-xl text-white flex items-center gap-2"><Edit size={20} className="text-purple-400"/> Edit Storyteller Gathering</h2>
                  <button type="button" onClick={() => setEditModal(null)} className="text-purple-300 hover:text-white bg-purple-600/20 p-2.5 rounded-2xl border border-purple-500/30"><X size={18}/></button>
              </div>
              
              <input required placeholder="Event Theme" className="w-full bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 placeholder:text-purple-400/40 focus:outline-none focus:border-purple-400 text-white text-sm transition-all shadow-inner" value={editModal.theme} onChange={e=>setEditModal({...editModal, theme: e.target.value})}/>
              <input required placeholder="Host Name (IMVU Username)" className="w-full bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 placeholder:text-purple-400/40 focus:outline-none focus:border-purple-400 text-white text-sm transition-all shadow-inner" value={editModal.hostName} onChange={e=>setEditModal({...editModal, hostName: e.target.value})}/>
              <input placeholder="Co-Host Name (Optional)" className="w-full bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 placeholder:text-purple-400/40 focus:outline-none focus:border-purple-400 text-white text-sm transition-all shadow-inner" value={editModal.coHost} onChange={e=>setEditModal({...editModal, coHost: e.target.value})}/>
              
              <select required className="w-full bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-purple-200 focus:outline-none focus:border-purple-400 text-sm transition-all shadow-inner" value={editModal.performers} onChange={e=>setEditModal({...editModal, performers: e.target.value})}>
                <option value="VU Storytellers">VU Storytellers</option>
                <option value="Guest Troupe">Guest Troupe</option>
                <option value="Special Feature">Special Feature</option>
              </select>
              
              <select required className="w-full bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-purple-200 focus:outline-none focus:border-purple-400 text-sm transition-all shadow-inner" value={editModal.startTime} onChange={e=>setEditModal({...editModal, startTime: e.target.value})}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <select required className="w-full bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-purple-200 focus:outline-none focus:border-purple-400 text-sm transition-all shadow-inner" value={editModal.duration || 120} onChange={e=>setEditModal({...editModal, duration: Number(e.target.value)})}>
                {DURATION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              
              <input required type="date" className="w-full bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-purple-200 focus:outline-none focus:border-purple-400 text-sm transition-all shadow-inner" value={editModal.date} onChange={e=>setEditModal({...editModal, date: e.target.value})}/>
              
              <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setEditModal(null)} className="bg-[#0b0615] border border-purple-500/30 flex-1 p-4 rounded-2xl flex items-center justify-center gap-2 font-black text-purple-200 hover:bg-purple-600/20 transition-all text-sm shadow">
                      CANCEL
                  </button>
                  <button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 flex-1 p-4 rounded-2xl flex items-center justify-center gap-2 font-black text-white hover:from-purple-500 hover:to-indigo-500 transition-all shadow-xl shadow-purple-950/60 text-sm border border-purple-400/40">
                      <Save size={18}/> SAVE
                  </button>
              </div>
           </form>
        </div>
      )}

      {/* Auth Gate Modal */}
      {showAuthGate && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-md">
           <div className="bg-[#140d24] p-8 rounded-3xl w-full max-w-sm border border-purple-500/40 shadow-2xl space-y-6 backdrop-blur-2xl">
              <div className="flex justify-between items-center">
                  <h2 className="font-black text-xl text-white flex items-center gap-2.5"><Shield size={22} className="text-purple-400"/> Sign-In</h2>
                  <button onClick={() => { setShowAuthGate(false); setLoginError(''); }} className="text-purple-300 hover:text-white bg-purple-600/20 p-2.5 rounded-2xl border border-purple-500/30"><X size={16}/></button>
              </div>

              {/* Notice for new users */}
              <div className="bg-purple-950/60 border border-purple-500/30 rounded-2xl p-4 text-center shadow-inner">
                <p className="text-xs font-black text-purple-200 tracking-wide uppercase">For New Users</p>
                <p className="text-[11px] text-purple-300/80 font-medium mt-1">Need an account? Contact an Admin to get access..</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <input placeholder="IMVU Username" value={gateU} onChange={e=>setGateU(e.target.value)} className="w-full bg-[#0b0615] border border-purple-500/30 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-purple-400 transition-all shadow-inner placeholder:text-purple-400/40"/>
                <div className="relative">
                    <input type={showPass ? "text" : "password"} placeholder="Password" value={gateP} onChange={e=>setGateP(e.target.value)} className="w-full bg-[#0b0615] border border-purple-500/30 rounded-2xl p-4 pr-12 text-white text-sm focus:outline-none focus:border-purple-400 transition-all shadow-inner placeholder:text-purple-400/40"/>
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-4 text-purple-300 hover:text-white transition-colors">{showPass ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
                </div>
                {loginError && <p className="text-rose-400 text-xs font-bold pt-1 bg-rose-950/50 p-3 rounded-xl border border-rose-500/30">{loginError}</p>}
                <button type="submit" className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 hover:from-purple-500 hover:to-indigo-500 transition-all py-4 rounded-2xl font-black text-white text-sm border border-purple-400/40 shadow-xl shadow-purple-950/60">Sign In</button>
              </form>
           </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 backdrop-blur-md">
           <form onSubmit={handleChangePassword} className="bg-[#140d24] p-8 rounded-3xl w-full max-w-sm border border-purple-500/40 space-y-4 shadow-2xl backdrop-blur-2xl">
              <div className="flex justify-between items-center mb-2">
                  <h2 className="font-black text-xl text-white">Storyteller Profile</h2>
                  <button type="button" onClick={()=>{ setShowProfileModal(false); setPwdMsg(null); setNewPass(''); }} className="text-purple-300 hover:text-white bg-purple-600/20 p-2.5 rounded-2xl border border-purple-500/30"><X size={16}/></button>
              </div>
              <div className="flex items-center gap-3.5 bg-[#0b0615] p-4 rounded-2xl border border-purple-500/20 shadow-inner">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white font-extrabold shadow-md">
                  {currentUser?.username?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-extrabold text-white text-base">{currentUser?.username}</p>
                  <p className="text-xs text-purple-300 font-mono capitalize">{currentUser?.role || 'host'} Account</p>
                </div>
              </div>

              {currentUser?.role !== 'owner' && (
                <>
                  <p className="text-xs text-purple-300/80 font-medium pt-2">Change your password below.</p>
                  <input type="password" placeholder="Enter new password" value={newPass} onChange={e=>setNewPass(e.target.value)} className="w-full bg-[#0b0615] p-4 rounded-2xl border border-purple-500/30 text-white text-sm placeholder:text-purple-400/40 focus:outline-none focus:border-purple-400 transition-all shadow-inner" />
                  {pwdMsg && <p className={`text-xs font-bold p-3 rounded-xl border ${pwdMsg.type === 'error' ? 'text-rose-400 bg-rose-950/40 border-rose-500/30' : 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30'}`}>{pwdMsg.text}</p>}
                  <button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 w-full p-4 rounded-2xl font-black text-white hover:from-purple-500 hover:to-indigo-500 transition-all shadow-xl shadow-purple-950/60 text-sm mt-2 border border-purple-400/40">UPDATE PASSWORD</button>
                </>
              )}
           </form>
        </div>
      )}

      {/* Custom Centered Alert Modal with Warning Icon */}
      {customAlert && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[120] backdrop-blur-md animate-fadeIn">
            <div className="bg-[#140d24] p-7 rounded-3xl w-full max-w-sm border border-amber-500/40 space-y-5 shadow-2xl text-center backdrop-blur-2xl">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)] animate-bounce">
                  <AlertTriangle size={28} />
                </div>
                <div>
                  <h2 className="font-black text-white text-xl">{customAlert.title || 'Notice'}</h2>
                  <p className="text-xs text-purple-200/90 mt-2 leading-relaxed font-medium">{customAlert.message}</p>
                </div>
                <button onClick={() => setCustomAlert(null)} className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 rounded-2xl font-black text-white text-xs uppercase tracking-wider hover:from-purple-500 hover:to-indigo-500 transition-all shadow-xl shadow-purple-950/60 border border-purple-400/40">
                    OK
                </button>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteQueue && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[100] backdrop-blur-md">
            <div className="bg-[#140d24] p-7 rounded-3xl w-full max-w-sm border border-rose-500/40 space-y-5 shadow-2xl backdrop-blur-2xl">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.4)]">
                  <Trash2 size={24} />
                </div>
                <div className="text-center">
                  <h2 className="font-black text-white text-xl">Confirm Deletion</h2>
                  <p className="text-xs text-purple-200/80 mt-2">Are you sure you want to delete <span className="text-white font-bold">{deleteQueue.theme}</span>?</p>
                </div>
                <div className="flex gap-3 pt-1">
                    <button onClick={() => setDeleteQueue(null)} className="flex-1 p-3.5 bg-[#0b0615] border border-purple-500/30 rounded-2xl font-bold text-purple-200 hover:bg-purple-600/20 transition-all text-sm shadow">Cancel</button>
                    <button onClick={handleExecuteDelete} className="flex-1 p-3.5 bg-rose-600 rounded-2xl font-bold text-white hover:bg-rose-500 transition-all shadow-xl shadow-rose-950/60 text-sm border border-rose-400/40">Yes, Delete</button>
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
    <div className={`bg-gradient-to-br from-[#140d24] to-[#10091d] border p-6 rounded-3xl mb-4 relative transition-all duration-300 shadow-xl backdrop-blur-xl group
      ${live 
        ? 'border-purple-400/80 shadow-[0_0_35px_rgba(168,85,247,0.4)] ring-2 ring-purple-500/50 bg-gradient-to-br from-[#1c1236] to-[#130b20]' 
        : 'border-purple-500/20 hover:border-purple-400/50 hover:shadow-[0_0_25px_rgba(168,85,247,0.2)]'
      }`}>
      
      {/* Header: Theme and Live Badge */}
      <div className="flex justify-between items-start mb-3.5">
        <div className="font-black text-white text-lg md:text-xl leading-snug flex items-center gap-2.5">
          <span className="bg-gradient-to-r from-white via-purple-100 to-fuchsia-200 bg-clip-text text-transparent">{p.theme}</span>
        </div>
        {live && (
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 text-[10px] font-black px-3 py-1.5 rounded-xl animate-pulse text-white uppercase tracking-wider shrink-0 ml-3 shadow-lg shadow-purple-950/80 flex items-center gap-1.5 border border-purple-300/40">
            <Radio size={12} className="text-white animate-spin" /> live now
          </div>
        )}
      </div>

      {/* Content: Host, Role, Date, Time */}
      <div className="flex flex-col gap-3 text-sm font-bold">
        <div className="flex justify-between items-center text-xs">
          <span className="tracking-wide flex items-center gap-2">
            <span className="text-purple-300/70 uppercase text-[10px] font-mono tracking-widest bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-500/20">Host</span>
            <span className="text-white font-extrabold text-sm">{p.hostName}</span>
          </span>
          
          <span className="bg-gradient-to-r from-purple-600/20 to-indigo-600/20 text-purple-200 px-3 py-1 rounded-xl text-[10px] border border-purple-500/30 uppercase tracking-wider font-mono font-black shadow-sm">
            {p.performers || 'VU Storytellers'}
          </span>
        </div>
        
        {/* Date and Time Row */}
        <div className="flex justify-between items-center mt-1 pt-3 border-t border-purple-500/15 text-xs">
          <div className="flex flex-col">
            <span className="text-[10px] text-purple-400/60 uppercase tracking-widest font-mono">Date</span>
            <span className="text-white font-extrabold text-sm mt-0.5">{formatDate(p.date)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-purple-400/60 uppercase tracking-widest font-mono">Time & Duration</span>
            <span className="text-white font-extrabold text-sm mt-0.5">{formatTime(p.startTime)} <span className="text-purple-300 font-normal">({duration / 60}h)</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
