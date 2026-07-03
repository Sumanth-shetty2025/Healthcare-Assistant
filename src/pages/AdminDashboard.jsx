import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { database } from '../firebase';
import {
  get,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
  update,
} from 'firebase/database';

import {
  FaBars, FaTimes, FaTachometerAlt, FaUserMd, FaUserInjured, FaCalendarAlt, FaBrain, FaChartBar, FaBell, FaCog, FaSignOutAlt, FaSearch, FaMoon, FaSun, FaIdBadge, FaFileMedical, FaCheckCircle, FaTimesCircle, FaShieldAlt, FaHistory, FaQrcode
} from 'react-icons/fa';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import './../styles/adminDashboard.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const AdminDashboard = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [time, setTime] = useState(new Date());

  const [dbError, setDbError] = useState("");
  const [dbSuccess, setDbSuccess] = useState("");
  // debug state removed

  const [pendingDoctorRequests, setPendingDoctorRequests] = useState([]);
  const [acceptedDoctors, setAcceptedDoctors] = useState([]);
  const [rejectedDoctors, setRejectedDoctors] = useState([]);
  const [verificationSearch, setVerificationSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [specializationFilter, setSpecializationFilter] = useState('all');
  const [verificationActionId, setVerificationActionId] = useState('');

  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });

  const [pendingAllRequests, setPendingAllRequests] = useState([]);
  const [pendingOffset, setPendingOffset] = useState(0);
  const [hasMorePending, setHasMorePending] = useState(true);
  const [pendingLoading, setPendingLoading] = useState(false);

  const pendingOffsetRef = useRef(0);
  useEffect(() => {
    pendingOffsetRef.current = pendingOffset;
  }, [pendingOffset]);

  const toMillis = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRequest, setPreviewRequest] = useState(null);
  const [previewTab, setPreviewTab] = useState('license');
  const [adminNoteText, setAdminNoteText] = useState('');
  const [moreInfoText, setMoreInfoText] = useState('');

  const [activityLogs, setActivityLogs] = useState([]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleSidebar = () => setSidebarCollapsed(!sidebarCollapsed);
  const toggleDarkMode = () => setIsDark(!isDark);

  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const getDbErrorDetails = (err) => ({
    code: err?.code || err?.name || '',
    message: String(err?.message || err || 'Unknown database error'),
  });

  const warnNonCriticalDbError = (context, err) => {
    const { code, message } = getDbErrorDetails(err);
    // eslint-disable-next-line no-console
    console.warn(`[AdminDashboard] ${context} failed (non-critical): ${message}`, {
      code,
      message,
      err,
    });
  };

  const handleDbError = (err, context = 'Database') => {
    const { code, message } = getDbErrorDetails(err);
    const suffix = code ? ` (${code})` : "";
    // eslint-disable-next-line no-console
    console.error(`[AdminDashboard] ${context} error: ${message}`, {
      code,
      message,
      err,
    });
    setDbError(`${context}: ${message}${suffix}`);
  };

  const chartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Patient Analysis',
        data: [65, 59, 80, 81, 56, 55],
        fill: false,
        borderColor: '#14B8A6',
        tension: 0.4,
      },
    ],
  };

  const barChartData = {
    labels: ['Pneumonia', 'COVID-19', 'Normal', 'Tuberculosis'],
    datasets: [
      {
        label: 'Disease Predictions',
        data: [120, 90, 200, 45],
        backgroundColor: ['#2563EB', '#14B8A6', '#3B82F6', '#F59E0B'],
      },
    ],
  };

  const refreshCounts = async () => {
    const readCount = async (path, label) => {
      try {
        const snap = await get(ref(database, path));
        return snap.exists() ? Object.keys(snap.val() || {}).length : 0;
      } catch (err) {
        warnNonCriticalDbError(`${label} count read`, err);
        return null;
      }
    };

    const [pending, approved, rejected] = await Promise.all([
      readCount('pending_doctor_requests', 'Pending doctors'),
      readCount('verified_doctors', 'Accepted doctors'),
      readCount('rejected_doctors', 'Rejected doctors'),
    ]);

    setCounts((prev) => ({
      pending: pending ?? prev.pending,
      approved: approved ?? prev.approved,
      rejected: rejected ?? prev.rejected,
      total: (pending ?? prev.pending) + (approved ?? prev.approved) + (rejected ?? prev.rejected),
    }));
  };

  const fetchAllPendingRequests = async () => {
    const snapshot = await get(ref(database, 'pending_doctor_requests'));
    const value = snapshot.val() || {};
    const all = Object.entries(value)
      .map(([id, data]) => ({ id, ...(data || {}) }))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    setPendingAllRequests(all);
    return all;
  };

  const loadPendingPage = async ({ reset = false } = {}) => {
    if (pendingLoading) return;
    setPendingLoading(true);
    try {
      const pageSize = 15;
      let all = pendingAllRequests;
      if (reset || !all.length) {
        all = await fetchAllPendingRequests();
      }

      const nextOffset = reset ? pageSize : Math.min(pendingOffset + pageSize, all.length);
      setPendingOffset(nextOffset);
      setPendingDoctorRequests(all.slice(0, nextOffset));
      setHasMorePending(nextOffset < all.length);
    } catch (err) {
      handleDbError(err, 'Pending doctor requests');
      setHasMorePending(false);
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    setDbError("");
    setPendingOffset(0);
    refreshCounts();
    loadPendingPage({ reset: true });

    // Real-time subscriptions for verification workflow.
    // Keeps Pending/Accepted/Rejected sections and statistics updated without redesigning UI.
    const pageSize = 15;
    const unsubscribers = [];

    const pendingUnsub = onValue(
      ref(database, 'pending_doctor_requests'),
      (snapshot) => {
        // Debug: log raw snapshot and count
        // eslint-disable-next-line no-console
        console.log('[AdminDashboard] Pending Requests Snapshot:', snapshot.val());
        // eslint-disable-next-line no-console
        console.log('[AdminDashboard] Pending Requests Count:', Object.keys(snapshot.val() || {}).length);

        const value = snapshot.val() || {};
        const all = Object.entries(value)
          .map(([id, data]) => {
            const req = { id, ...(data || {}) };
            // eslint-disable-next-line no-console
            console.log('[AdminDashboard] Doctor Request Data:', req);
            // Also log status fields for diagnosis
            // eslint-disable-next-line no-console
            console.log('[AdminDashboard] fields status, verificationStatus:', req.status, req.verificationStatus);
            return req;
          })
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

        setPendingAllRequests(all);

        const desired = pendingOffsetRef.current || pageSize;
        const nextOffset = Math.min(desired, all.length);
        setPendingOffset(nextOffset);
        setPendingDoctorRequests(all.slice(0, nextOffset));
        setHasMorePending(nextOffset < all.length);
        setCounts((prev) => ({
          ...prev,
          pending: all.length,
          total: all.length + prev.approved + prev.rejected,
        }));
      },
      () => {
        // ignore here (existing UI already shows dbError via loadPendingPage)
      }
    );
    unsubscribers.push(pendingUnsub);

    const verifiedUnsub = onValue(
      ref(database, 'verified_doctors'),
      (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value)
          .map(([id, data]) => ({ id, ...(data || {}) }))
          .sort((a, b) => toMillis(b.approvedAt || b.updatedAt) - toMillis(a.approvedAt || a.updatedAt));
        setAcceptedDoctors(items);
        setCounts((prev) => ({
          ...prev,
          approved: items.length,
          total: prev.pending + items.length + prev.rejected,
        }));
      },
      () => {
        // ignore
      }
    );
    unsubscribers.push(verifiedUnsub);

    // appointments subscription intentionally not used on this verification page

    const rejectedUnsub = onValue(
      ref(database, 'rejected_doctors'),
      (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value)
          .map(([id, data]) => ({ id, ...(data || {}) }))
          .sort((a, b) => toMillis(b.rejectedAt || b.updatedAt) - toMillis(a.rejectedAt || a.updatedAt));
        setRejectedDoctors(items);
        setCounts((prev) => ({
          ...prev,
          rejected: items.length,
          total: prev.pending + prev.approved + items.length,
        }));
      },
      () => {
        // ignore
      }
    );
    unsubscribers.push(rejectedUnsub);

    // debug loaders removed

    const logsQuery = query(
      ref(database, 'admin_activity_logs'),
      orderByChild('createdAt'),
      limitToLast(10)
    );
    const unsubscribe = onValue(
      logsQuery,
      (snapshot) => {
        const value = snapshot.val() || {};
        const items = Object.entries(value)
          .map(([id, data]) => ({ id, ...(data || {}) }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setActivityLogs(items);
      },
      (err) => {
        warnNonCriticalDbError('Admin activity logs read', err);
      }
    );

    unsubscribers.push(unsubscribe);

    return () => {
      unsubscribers.forEach((u) => {
        try {
          if (typeof u === 'function') u();
        } catch (e) {
          // ignore
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const formatDateTime = (value) => {
    const ms = toMillis(value);
    if (!ms) return '—';
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return '—';
    }
  };

  const getDoctorRowId = (row) => row?.uid || row?.id;
  const getApprovedTime = (row) => toMillis(row?.approvedAt || row?.updatedAt);
  const getRejectedTime = (row) => toMillis(row?.rejectedAt || row?.updatedAt);
  const acceptedById = new Map(acceptedDoctors.map((row) => [getDoctorRowId(row), row]));
  const rejectedById = new Map(rejectedDoctors.map((row) => [getDoctorRowId(row), row]));
  const acceptedDoctorsForDisplay = acceptedDoctors.filter((row) => {
    const rejected = rejectedById.get(getDoctorRowId(row));
    return !rejected || getApprovedTime(row) >= getRejectedTime(rejected);
  });
  const rejectedDoctorsForDisplay = rejectedDoctors.filter((row) => {
    const accepted = acceptedById.get(getDoctorRowId(row));
    return !accepted || getRejectedTime(row) > getApprovedTime(accepted);
  });
  const processedDoctorIds = new Set([
    ...acceptedDoctorsForDisplay.map(getDoctorRowId),
    ...rejectedDoctorsForDisplay.map(getDoctorRowId),
  ].filter(Boolean));
  const pendingRequestsForReview = pendingDoctorRequests.filter((req) => {
    const uid = getDoctorRowId(req);
    return uid && !processedDoctorIds.has(uid);
  });

  const filteredPendingRequests = pendingRequestsForReview.filter((req) => {
    const s = verificationSearch.trim().toLowerCase();
    if (!s) return true;
    const haystack = [
      req.fullName,
      req.email,
      req.specialization,
      req.licenseNumber,
      req.hospitalName,
      req.location,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(s);
  }).filter((req) => {
    if (specializationFilter === 'all') return true;
    return String(req.specialization || '').toLowerCase() === specializationFilter;
  }).filter((req) => {
    if (statusFilter === 'all') return true;

    // Fix: make status filter resilient (avoid mismatch when fields are missing/typed differently)
    const vs = String(req.verificationStatus ?? req.status ?? "pending").toLowerCase();
    return vs === statusFilter;
  });

  // Debug: log counts before/after filters
  // eslint-disable-next-line no-console
  console.log('[AdminDashboard] pending_doctor_requests total fetched:', pendingDoctorRequests.length);
  // eslint-disable-next-line no-console
  console.log('[AdminDashboard] pending_doctor_requests after filtering (filteredPendingRequests):', filteredPendingRequests.length);

  const uniqueSpecializations = Array.from(
    new Set(pendingRequestsForReview.map((r) => String(r.specialization || '').trim()).filter(Boolean))
  ).sort();

  const logAdminActivity = async ({ action, targetUid, note, meta = {} }) => {
    const logRef = push(ref(database, 'admin_activity_logs'));
    const now = Date.now();
    await set(logRef, {
      action,
      targetUid,
      note: note || '',
      admin: {
        uid: user?.uid || null,
        email: user?.email || null,
      },
      meta,
      createdAt: now,
      createdAtIso: new Date(now).toISOString(),
    });
  };

  const notifyDoctor = async (uid, payload) => {
    const notifRef = push(ref(database, `doctor_notifications/${uid}/items`));
    const now = Date.now();
    await set(notifRef, {
      uid,
      title: payload?.title || 'Update',
      message: payload?.message || '',
      type: payload?.type || 'info',
      read: false,
      createdAt: now,
    });
  };

  const updateLicenseRegistryStatus = async (licenseKey, status, now) => {
    const cleanLicenseKey = String(licenseKey || '').trim();
    const invalidKeyChars = /[.#$[\]/]/;
    if (!cleanLicenseKey || invalidKeyChars.test(cleanLicenseKey)) return;

    try {
      await update(ref(database, `license_registry/${cleanLicenseKey}`), {
        status,
        updatedAt: now,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[AdminLicenseRegistry] Status update failed (non-critical)', {
        code: e?.code,
        message: e?.message,
        licenseKey: cleanLicenseKey,
        status,
      });
    }
  };

  const scrollToAcceptedDoctors = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    window.requestAnimationFrame(() => {
      document.getElementById('accepted-doctors')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const runOptionalDbStep = async (context, action) => {
    try {
      await action();
      return true;
    } catch (err) {
      warnNonCriticalDbError(context, err);
      return false;
    }
  };

  const handleApproveDoctor = async (request) => {
    const uid = request.uid || request.id;
    if (!uid) return;
    setVerificationActionId(uid);
    setDbError('');
    setDbSuccess('');
    try {
      // eslint-disable-next-line no-console
      console.groupCollapsed(`[AdminApprove] ${uid}`);
      const now = Date.now();

      // Always re-fetch from RTDB so we approve the latest request data.
      // eslint-disable-next-line no-console
      console.info('[AdminApprove] Fetching pending request', { path: `pending_doctor_requests/${uid}` });
      const pendingSnap = await get(ref(database, `pending_doctor_requests/${uid}`));
      if (!pendingSnap.exists()) {
        throw new Error('Pending doctor request not found (it may have been processed already).');
      }

      const fetched = pendingSnap.val() || {};
      const req = { id: uid, uid, ...(fetched || {}) };
      // eslint-disable-next-line no-console
      console.info('[AdminApprove] Pending data fetched', {
        uid,
        hasDocs: Boolean(req?.documents?.licenseDocumentUrl || req?.documents?.idDocumentUrl || req?.documents?.profilePhotoUrl),
        licenseKey: req?.licenseKey || null,
      });

      const nowIso = new Date(now).toISOString();
      const verifiedDoctor = {
        ...req,
        uid,
        role: 'doctor',
        status: 'approved',
        verificationStatus: 'approved',
        approvedAt: now,
        updatedAt: nowIso,
        approvedBy: {
          uid: user?.uid || null,
          email: user?.email || null,
        },
        adminMessage: 'Approved. Your doctor access has been enabled.',
      };
      const userProfilePatch = {
        email: req.email || '',
        role: 'doctor',
        status: 'approved',
        username: req.fullName || '',
        fullName: req.fullName || '',
        updatedAt: nowIso,
      };

      // 1) Move doctor into the single approved source of truth.
      // eslint-disable-next-line no-console
      console.info('[AdminApprove] Writing accepted doctor record', { path: `verified_doctors/${uid}` });
      await update(ref(database), {
        [`verified_doctors/${uid}`]: verifiedDoctor,
        [`pending_doctor_requests/${uid}`]: null,
        [`rejected_doctors/${uid}`]: null,
      });
      // eslint-disable-next-line no-console
      console.info('[AdminApprove] Accepted doctor record OK and other verification nodes cleaned');

      // This is required for strict role-based login. The accepted row alone is not enough.
      // eslint-disable-next-line no-console
      console.info('[AdminApprove] Updating user role', { path: `users/${uid}`, role: 'doctor', status: 'approved' });
      await update(ref(database, `users/${uid}`), userProfilePatch);
      // eslint-disable-next-line no-console
      console.info('[AdminApprove] User role update OK');

      // Update UI immediately after the accepted record is saved.
      setPendingDoctorRequests((prev) => prev.filter((r) => (r.uid || r.id) !== uid));
      setRejectedDoctors((prev) => prev.filter((r) => (r.uid || r.id) !== uid));
      setAcceptedDoctors((prev) => [{ id: uid, ...verifiedDoctor }, ...prev.filter((r) => (r.uid || r.id) !== uid)]);
      setPreviewOpen(false);
      setPreviewRequest(null);
      setDbSuccess('Doctor approved successfully. Moved to Accepted Doctors.');
      setTimeout(() => setDbSuccess(''), 3500);
      scrollToAcceptedDoctors();

      // Legacy cleanup only. Patient-facing doctor lists read verified_doctors, not doctors.
      await runOptionalDbStep(`Remove legacy doctor profile ${uid}`, () => set(ref(database, `doctors/${uid}`), null));
      await updateLicenseRegistryStatus(req.licenseKey, 'approved', now);

      // Non-critical
      try {
        await notifyDoctor(uid, {
          type: 'approval',
          title: 'Verification approved',
          message: 'Congratulations — your doctor verification has been approved. You can now access the Doctor Dashboard.',
        });
        // eslint-disable-next-line no-console
        console.info('[AdminApprove] Notification pushed');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[AdminApprove] Notification failed (non-critical)', { code: e?.code, message: e?.message });
      }

      // Non-critical
      try {
        await logAdminActivity({
          action: 'approve',
          targetUid: uid,
          note: adminNoteText.trim(),
          meta: { licenseKey: req.licenseKey || null, specialization: req.specialization || null },
        });
        // eslint-disable-next-line no-console
        console.info('[AdminApprove] Activity logged');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[AdminApprove] Activity log failed (non-critical)', { code: e?.code, message: e?.message });
      }

      // eslint-disable-next-line no-console
      console.info('[AdminApprove] Final success');

      await refreshCounts();
      await loadPendingPage({ reset: true });
    } catch (err) {
      handleDbError(err, `Approve doctor ${uid}`);
    } finally {
      setVerificationActionId('');
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  };

  const handleRejectDoctor = async (request) => {
    const uid = request.uid || request.id;
    if (!uid) return;
    setVerificationActionId(uid);
    setDbError('');
    setDbSuccess('');
    try {
      // eslint-disable-next-line no-console
      console.groupCollapsed(`[AdminReject] ${uid}`);
      const now = Date.now();

      // eslint-disable-next-line no-console
      console.info('[AdminReject] Fetching pending request', { path: `pending_doctor_requests/${uid}` });
      const pendingSnap = await get(ref(database, `pending_doctor_requests/${uid}`));
      if (!pendingSnap.exists()) {
        throw new Error('Pending doctor request not found (it may have been processed already).');
      }

      const fetched = pendingSnap.val() || {};
      const req = { id: uid, uid, ...(fetched || {}) };

      const nowIso = new Date(now).toISOString();
      const rejectedDoctor = {
        ...req,
        uid,
        role: 'doctor_rejected',
        status: 'rejected',
        verificationStatus: 'rejected',
        rejectedAt: now,
        updatedAt: nowIso,
        rejectedBy: {
          uid: user?.uid || null,
          email: user?.email || null,
        },
        adminMessage: 'Rejected. Please review your submitted details and contact support.',
      };
      const userProfilePatch = {
        email: req.email || '',
        role: 'doctor_rejected',
        status: 'rejected',
        updatedAt: nowIso,
      };

      // eslint-disable-next-line no-console
      console.info('[AdminReject] Writing rejected doctor record', { path: `rejected_doctors/${uid}` });
      await update(ref(database), {
        [`rejected_doctors/${uid}`]: rejectedDoctor,
        [`pending_doctor_requests/${uid}`]: null,
        [`verified_doctors/${uid}`]: null,
      });
      // eslint-disable-next-line no-console
      console.info('[AdminReject] Rejected doctor record OK and other verification nodes cleaned');

      // This is required for strict role-based login.
      // eslint-disable-next-line no-console
      console.info('[AdminReject] Updating user role', { path: `users/${uid}`, role: 'doctor_rejected', status: 'rejected' });
      await update(ref(database, `users/${uid}`), userProfilePatch);
      // eslint-disable-next-line no-console
      console.info('[AdminReject] User role update OK');

      // Legacy cleanup only. Patient-facing doctor lists read verified_doctors, not doctors.
      await runOptionalDbStep(`Remove legacy doctor profile ${uid}`, () => set(ref(database, `doctors/${uid}`), null));
      await updateLicenseRegistryStatus(req.licenseKey, 'rejected', now);

      // Non-critical
      try {
        await notifyDoctor(uid, {
          type: 'rejection',
          title: 'Verification rejected',
          message: 'Your doctor verification request was rejected. Please contact support or submit a new request with corrected details.',
        });
        // eslint-disable-next-line no-console
        console.info('[AdminReject] Notification pushed');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[AdminReject] Notification failed (non-critical)', { code: e?.code, message: e?.message });
      }

      // Non-critical
      try {
        await logAdminActivity({
          action: 'reject',
          targetUid: uid,
          note: adminNoteText.trim(),
          meta: { licenseKey: req.licenseKey || null, specialization: req.specialization || null },
        });
        // eslint-disable-next-line no-console
        console.info('[AdminReject] Activity logged');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[AdminReject] Activity log failed (non-critical)', { code: e?.code, message: e?.message });
      }

      setPendingDoctorRequests((prev) => prev.filter((r) => (r.uid || r.id) !== uid));
      setAcceptedDoctors((prev) => prev.filter((r) => (r.uid || r.id) !== uid));
      setRejectedDoctors((prev) => [{ id: uid, ...rejectedDoctor }, ...prev.filter((r) => (r.uid || r.id) !== uid)]);
      setPreviewOpen(false);
      setPreviewRequest(null);
      setDbSuccess('Doctor request rejected successfully.');
      setTimeout(() => setDbSuccess(''), 3500);
      // eslint-disable-next-line no-console
      console.info('[AdminReject] Final success');

      await refreshCounts();
      await loadPendingPage({ reset: true });
    } catch (err) {
      handleDbError(err, `Reject doctor ${uid}`);
    } finally {
      setVerificationActionId('');
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  };

  const handleOpenPreview = (request, tab = 'license') => {
    setPreviewRequest(request);
    setPreviewTab(tab);
    setAdminNoteText('');
    setMoreInfoText('');
    setPreviewOpen(true);
  };

  const handleAddNote = async () => {
    const uid = previewRequest?.uid || previewRequest?.id;
    const note = adminNoteText.trim();
    if (!uid || !note) return;
    try {
      const now = Date.now();
      const noteRef = push(ref(database, `pending_doctor_requests/${uid}/adminNotes`));
      await set(noteRef, {
        note,
        adminUid: user?.uid || null,
        adminEmail: user?.email || null,
        createdAt: now,
        createdAtIso: new Date(now).toISOString(),
      });
      await update(ref(database, `pending_doctor_requests/${uid}`), {
        updatedAt: now,
      });
      try {
        await logAdminActivity({ action: 'note', targetUid: uid, note });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[AdminNote] Activity log failed (non-critical)', { code: e?.code, message: e?.message });
      }
      setAdminNoteText('');
    } catch (err) {
      handleDbError(err, `Save admin note ${uid}`);
    }

    try {
      const snap = await get(ref(database, `pending_doctor_requests/${uid}`));
      if (snap.exists()) setPreviewRequest({ id: uid, ...(snap.val() || {}) });
    } catch (e) {
      // ignore
    }
  };

  const handleRequestMoreInfo = async () => {
    const uid = previewRequest?.uid || previewRequest?.id;
    if (!uid) return;
    const msg = moreInfoText.trim() || 'Please provide additional information for verification.';
    setVerificationActionId(uid);
    try {
      const now = Date.now();
      await update(ref(database, `pending_doctor_requests/${uid}`), {
        verificationStatus: 'needs_more_info',
        adminMessage: msg,
        needsMoreInfoAt: now,
        updatedAt: now,
      });
      try {
        await notifyDoctor(uid, {
          type: 'more_info',
          title: 'More information requested',
          message: msg,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[AdminMoreInfo] Notification failed (non-critical)', { code: e?.code, message: e?.message });
      }

      try {
        await logAdminActivity({ action: 'request_more_info', targetUid: uid, note: msg });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[AdminMoreInfo] Activity log failed (non-critical)', { code: e?.code, message: e?.message });
      }

      try {
        const snap = await get(ref(database, `pending_doctor_requests/${uid}`));
        if (snap.exists()) setPreviewRequest({ id: uid, ...(snap.val() || {}) });
      } catch (e) {
        // ignore
      }
    } catch (err) {
      handleDbError(err, `Request more info ${uid}`);
    } finally {
      setVerificationActionId('');
    }
  };

  const renderPreview = (url) => {
    if (!url) return <div style={{ color: '#6b7280', fontWeight: 700 }}>No document uploaded.</div>;
    const lower = String(url).toLowerCase();
    const isPdf = lower.includes('.pdf') || lower.includes('application/pdf');
    if (isPdf) {
      return (
        <iframe
          title="document preview"
          src={url}
          style={{ width: '100%', height: 420, border: '1px solid rgba(15,23,42,0.08)', borderRadius: 12 }}
        />
      );
    }
    return (
      <img
        alt="document preview"
        src={url}
        style={{ width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 12, border: '1px solid rgba(15,23,42,0.08)' }}
      />
    );
  };

  const previewNotes = (() => {
    const notes = previewRequest?.adminNotes;
    if (Array.isArray(notes)) return notes;
    if (!notes || typeof notes !== 'object') return [];
    return Object.entries(notes)
      .map(([id, n]) => ({ id, ...(n || {}) }))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  })();

  return (
    <div className={`admin-dashboard ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${isDark ? 'dark' : ''}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="brand-logo">IntelliHealth</h1>
          <button className="sidebar-toggle" onClick={toggleSidebar}>
            {sidebarCollapsed ? <FaBars /> : <FaTimes />}
          </button>
        </div>
        <nav className="sidebar-nav">
          <a href="#dashboard" className="nav-item active"><FaTachometerAlt /><span>Dashboard</span></a>
          <a href="#verification" className="nav-item"><FaUserMd /><span>Doctor Verification</span></a>
          <a href="#patients" className="nav-item"><FaUserInjured /><span>Patients</span></a>
          <a href="#appointments" className="nav-item"><FaCalendarAlt /><span>Appointments</span></a>
          <a href="#predictions" className="nav-item"><FaBrain /><span>AI Predictions</span></a>
          <a href="#reports" className="nav-item"><FaChartBar /><span>Reports & Analytics</span></a>
          <a href="#notifications" className="nav-item"><FaBell /><span>Notifications</span></a>
          <a href="#settings" className="nav-item"><FaCog /><span>Settings</span></a>
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="nav-item logout"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            <FaSignOutAlt />
            <span>Logout</span>
          </button>
        </div>

      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Top Navbar */}
        <header className="top-navbar">
          <div className="search-bar">
            <FaSearch />
            <input type="text" placeholder="Search..." />
          </div>
          <div className="navbar-right">
            <div className="time-display">{time.toLocaleTimeString()} - {time.toLocaleDateString()}</div>
            <button className="dark-mode-toggle" onClick={toggleDarkMode}>
              {isDark ? <FaSun /> : <FaMoon />}
            </button>
            <div className="notification-bell">
              <FaBell />
              <span className="notification-count">3</span>
            </div>
            <div className="admin-profile">
              <img src="https://randomuser.me/api/portraits/men/1.jpg" alt="Admin" />
              <div className="profile-info">
                <span className="profile-name">Sumanth</span>
                <span className="profile-role">Administrator</span>
              </div>
            </div>
          </div>
        </header>

        {dbError ? (
          <div
            style={{
              margin: '14px 0 18px',
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.10)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: isDark ? '#fecaca' : '#991b1b',
              fontWeight: 700,
            }}
          >
            {dbError}
          </div>
        ) : null}

        {dbSuccess ? (
          <div
            style={{
              margin: '14px 0 18px',
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(34, 197, 94, 0.10)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              color: isDark ? '#bbf7d0' : '#166534',
              fontWeight: 700,
            }}
          >
            {dbSuccess}
          </div>
        ) : null}

        {/* Dashboard Overview */}
        <section id="dashboard" className="dashboard-overview">
          {/* debug information removed */}

          {/* debug pending info removed */}
          <h2>Dashboard Overview</h2>
          <div className="overview-cards">
            <div className="card"><FaUserInjured /><div><h3>Total Patients</h3><span>1,256</span></div></div>
            <div className="card"><FaUserMd /><div><h3>Total Doctors</h3><span>{counts.total}</span></div></div>
            <div className="card"><FaIdBadge /><div><h3>Pending Approvals</h3><span>{pendingRequestsForReview.length}</span></div></div>
            <div className="card"><FaCheckCircle /><div><h3>Approved</h3><span>{acceptedDoctorsForDisplay.length}</span></div></div>
            <div className="card"><FaTimesCircle /><div><h3>Rejected</h3><span>{rejectedDoctorsForDisplay.length}</span></div></div>
            <div className="card"><FaCalendarAlt /><div><h3>Today's Appointments</h3><span>42</span></div></div>
            <div className="card"><FaBrain /><div><h3>AI Predictions</h3><span>789</span></div></div>
            <div className="card emergency"><FaBell /><div><h3>Emergency Alerts</h3><span>5</span></div></div>
          </div>
        </section>

        {/* Doctor Verification */}
        <section id="verification" className="doctor-verification">
          <h2>Doctor Verification</h2>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.75rem 0 0.5rem' }}>
            <h3 style={{ margin: 0, fontWeight: 900 }}>Pending Requests</h3>
            <span className="status pending" style={{ transition: 'opacity 0.25s ease' }}>
              {pendingRequestsForReview.length} Pending
            </span>
          </div>
          <div className="verification-search">
            <FaSearch />
            <input
              type="text"
              placeholder="Search by doctor name, email, license, specialization..."
              value={verificationSearch}
              onChange={(e) => setVerificationSearch(e.target.value)}
            />
          </div>

          {/* Appointment Requests UI removed from Doctor Verification page */}

          <div className="verification-filters">
            <div className="filter">
              <label>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="needs_more_info">Needs More Info</option>
              </select>
            </div>
            <div className="filter">
              <label>Specialization</label>
              <select value={specializationFilter} onChange={(e) => setSpecializationFilter(e.target.value)}>
                <option value="all">All</option>
                {uniqueSpecializations.map((s) => (
                  <option key={s.toLowerCase()} value={s.toLowerCase()}>{s}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="action-btn view-cert"
              onClick={() => loadPendingPage({ reset: true })}
              disabled={pendingLoading}
            >
              Refresh
            </button>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Specialization</th>
                  <th>Experience</th>
                  <th>License ID</th>
                  <th>Status</th>
                  <th>Certificate</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPendingRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '18px' }}>
                      No pending doctor verification requests.
                    </td>
                  </tr>
                ) : (
                  filteredPendingRequests.map((docReq) => {
                    const uid = docReq.uid || docReq.id;
                    const profilePhoto = docReq?.documents?.profilePhotoUrl;
                    const licenseDocUrl = docReq?.documents?.licenseDocumentUrl;
                    const busy = verificationActionId === uid;
                    const vs = String(docReq?.verificationStatus || 'pending').toLowerCase();
                    return (
                      <tr key={uid}>
                        <td>
                          <img
                            src={profilePhoto || 'https://via.placeholder.com/40'}
                            alt={docReq.fullName || 'Doctor'}
                            className="doctor-photo"
                          />
                          {docReq.fullName || '—'}
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>{docReq.email || ''}</div>
                        </td>
                        <td>{docReq.specialization || '—'}</td>
                        <td>{docReq.yearsOfExperience ? `${docReq.yearsOfExperience} yrs` : '—'}</td>
                        <td>{docReq.licenseNumber || '—'}</td>
                        <td>
                          <span className={`status ${vs === 'needs_more_info' ? 'pending' : 'pending'}`}>
                            {vs === 'needs_more_info' ? 'Needs Info' : 'Pending'}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="action-btn view-cert"
                              onClick={() => handleOpenPreview(docReq, 'license')}
                              disabled={busy}
                            >
                              <FaFileMedical /> Preview
                            </button>
                            {licenseDocUrl ? (
                              <a href={licenseDocUrl} target="_blank" rel="noreferrer" className="action-btn view-cert">
                                <FaFileMedical /> Open
                              </a>
                            ) : null}
                          </div>
                        </td>
                        <td className="action-buttons">
                          <button type="button" className="action-btn approve" disabled={busy} onClick={() => handleApproveDoctor(docReq)}>
                            <FaCheckCircle /> {busy ? 'Working...' : 'Approve'}
                          </button>
                          <button type="button" className="action-btn reject" disabled={busy} onClick={() => handleRejectDoctor(docReq)}>
                            <FaTimesCircle /> Reject
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="verification-pagination">
            <button
              type="button"
              className="action-btn view-cert"
              disabled={!hasMorePending || pendingLoading}
              onClick={() => loadPendingPage({ reset: false })}
            >
              {pendingLoading ? 'Loading...' : hasMorePending ? 'Load more' : 'No more results'}
            </button>
          </div>

          <div id="accepted-doctors" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '1.5rem 0 0.75rem' }}>
            <h3 style={{ margin: 0, fontWeight: 900 }}>Accepted Doctors</h3>
            <span className="status verified" style={{ transition: 'opacity 0.25s ease' }}>
              {acceptedDoctorsForDisplay.length} Approved
            </span>
          </div>

          <div className="table-container" style={{ transition: 'opacity 0.25s ease' }}>
            <table>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Specialization</th>
                  <th>Approved Date</th>
                  <th>License ID</th>
                  <th>Status</th>
                  <th>Documents</th>
                </tr>
              </thead>
              <tbody>
                {acceptedDoctorsForDisplay.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '18px' }}>
                      No accepted doctors yet.
                    </td>
                  </tr>
                ) : (
                  acceptedDoctorsForDisplay.map((doc) => {
                    const uid = doc.uid || doc.id;
                    const profilePhoto = doc?.documents?.profilePhotoUrl;
                    const licenseDocUrl = doc?.documents?.licenseDocumentUrl;
                    return (
                      <tr key={uid}>
                        <td>
                          <img
                            src={profilePhoto || 'https://via.placeholder.com/40'}
                            alt={doc.fullName || 'Doctor'}
                            className="doctor-photo"
                          />
                          {doc.fullName || '—'}
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>{doc.email || ''}</div>
                        </td>
                        <td>{doc.specialization || '—'}</td>
                        <td>{formatDateTime(doc.approvedAt || doc.updatedAt)}</td>
                        <td>{doc.licenseNumber || '—'}</td>
                        <td>
                          <span className="status verified">Approved</span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="action-btn view-cert"
                              onClick={() => handleOpenPreview(doc, 'license')}
                            >
                              <FaFileMedical /> Preview
                            </button>
                            {licenseDocUrl ? (
                              <a href={licenseDocUrl} target="_blank" rel="noreferrer" className="action-btn view-cert">
                                <FaFileMedical /> Open
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '1.5rem 0 0.75rem' }}>
            <h3 style={{ margin: 0, fontWeight: 900 }}>Rejected Doctors</h3>
            <span className="status rejected" style={{ transition: 'opacity 0.25s ease' }}>
              {rejectedDoctorsForDisplay.length} Rejected
            </span>
          </div>

          <div className="table-container" style={{ transition: 'opacity 0.25s ease' }}>
            <table>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Specialization</th>
                  <th>Rejected Date</th>
                  <th>License ID</th>
                  <th>Status</th>
                  <th>Message</th>
                  <th>Documents</th>
                </tr>
              </thead>
              <tbody>
                {rejectedDoctorsForDisplay.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '18px' }}>
                      No rejected doctors yet.
                    </td>
                  </tr>
                ) : (
                  rejectedDoctorsForDisplay.map((doc) => {
                    const uid = doc.uid || doc.id;
                    const profilePhoto = doc?.documents?.profilePhotoUrl;
                    const licenseDocUrl = doc?.documents?.licenseDocumentUrl;
                    const msg =
                      doc?.adminMessage ||
                      doc?.rejectionReason ||
                      doc?.reason ||
                      doc?.note ||
                      '—';

                    return (
                      <tr key={uid}>
                        <td>
                          <img
                            src={profilePhoto || 'https://via.placeholder.com/40'}
                            alt={doc.fullName || 'Doctor'}
                            className="doctor-photo"
                          />
                          {doc.fullName || '—'}
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>{doc.email || ''}</div>
                        </td>
                        <td>{doc.specialization || '—'}</td>
                        <td>{formatDateTime(doc.rejectedAt || doc.updatedAt)}</td>
                        <td>{doc.licenseNumber || '—'}</td>
                        <td>
                          <span className="status rejected">Rejected</span>
                        </td>
                        <td style={{ maxWidth: 420, whiteSpace: 'normal', lineHeight: 1.5, fontWeight: 700 }}>
                          {msg}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="action-btn view-cert"
                              onClick={() => handleOpenPreview(doc, 'license')}
                            >
                              <FaFileMedical /> Preview
                            </button>
                            {licenseDocUrl ? (
                              <a href={licenseDocUrl} target="_blank" rel="noreferrer" className="action-btn view-cert">
                                <FaFileMedical /> Open
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="activity-logs">
            <h3>Admin Activity Logs</h3>
            {activityLogs.length === 0 ? (
              <p style={{ color: '#6b7280', fontWeight: 700 }}>No activity yet.</p>
            ) : (
              <div className="activity-list">
                {activityLogs.map((log) => (
                  <div key={log.id} className="activity-item">
                    <div className="activity-action">{String(log.action || '').replace(/_/g, ' ')}</div>
                    <div className="activity-meta">
                      <span>{log.admin?.email || 'admin'}</span>
                      <span>•</span>
                      <span>{log.targetUid || ''}</span>
                    </div>
                    {log.note ? <div className="activity-note">{log.note}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {previewOpen && previewRequest && (
          <div className="verify-modal-overlay" role="dialog" aria-modal="true" aria-label="Doctor document preview">
            <div className="verify-modal">
              <div className="verify-modal-header">
                <div>
                  <h3>Verification Review</h3>
                  <p>{previewRequest.fullName} • {previewRequest.email}</p>
                </div>
                <button type="button" className="action-btn" onClick={() => setPreviewOpen(false)}>Close</button>
              </div>

              <div className="verify-modal-tabs">
                <button type="button" className={`tab ${previewTab === 'license' ? 'active' : ''}`} onClick={() => setPreviewTab('license')}>License</button>
                <button type="button" className={`tab ${previewTab === 'id' ? 'active' : ''}`} onClick={() => setPreviewTab('id')}>ID / Certificate</button>
              </div>

              <div className="verify-modal-body">
                <div className="verify-preview">
                  {previewTab === 'license'
                    ? renderPreview(previewRequest?.documents?.licenseDocumentUrl)
                    : renderPreview(previewRequest?.documents?.idDocumentUrl)}
                </div>

                <div className="verify-side">
                  <div className="side-card">
                    <h4>Verification Notes</h4>
                    <textarea
                      value={adminNoteText}
                      onChange={(e) => setAdminNoteText(e.target.value)}
                      placeholder="Add internal verification notes..."
                      rows={4}
                    />
                    <div className="action-buttons">
                      <button type="button" className="action-btn view-cert" onClick={handleAddNote} disabled={!adminNoteText.trim()}>
                        Save Note
                      </button>
                    </div>
                    {previewNotes.length ? (
                      <div className="notes-list">
                        {previewNotes.slice(0, 3).map((n, idx) => (
                          <div key={n.id || `${idx}-${n.createdAt}`} className="note-item">
                            <div className="note-meta">{n.adminEmail || 'admin'} • {n.createdAtIso || n.createdAt || ''}</div>
                            <div className="note-text">{n.note}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: '#6b7280', fontWeight: 700, marginTop: 10 }}>No notes yet.</p>
                    )}
                  </div>

                  <div className="side-card">
                    <h4>Request More Information</h4>
                    <textarea
                      value={moreInfoText}
                      onChange={(e) => setMoreInfoText(e.target.value)}
                      placeholder="Ask the doctor for additional details/documents..."
                      rows={3}
                    />
                    <button
                      type="button"
                      className="action-btn reject"
                      onClick={handleRequestMoreInfo}
                      disabled={verificationActionId === (previewRequest.uid || previewRequest.id)}
                    >
                      Request More Info
                    </button>
                  </div>

                  <div className="side-card">
                    <h4>Decision</h4>
                    <div className="action-buttons">
                      <button
                        type="button"
                        className="action-btn approve"
                        onClick={() => handleApproveDoctor(previewRequest)}
                        disabled={verificationActionId === (previewRequest.uid || previewRequest.id)}
                      >
                        <FaCheckCircle /> Approve
                      </button>
                      <button
                        type="button"
                        className="action-btn reject"
                        onClick={() => handleRejectDoctor(previewRequest)}
                        disabled={verificationActionId === (previewRequest.uid || previewRequest.id)}
                      >
                        <FaTimesCircle /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Analytics */}
        <section id="analytics" className="ai-analytics">
          <h2>AI Analytics & Reports</h2>
          <div className="charts-container">
            <div className="chart-card">
              <h3>Monthly Patient Analysis</h3>
              <Line data={chartData} />
            </div>
            <div className="chart-card">
              <h3>Disease Prediction Stats</h3>
              <Bar data={barChartData} />
            </div>
          </div>
        </section>

        {/* Security Features */}
        <section id="security" className="security-features">
            <h2>Security & Access</h2>
            <div className="security-cards">
                <div className="security-card">
                    <FaHistory className="security-icon" />
                    <h3>Admin Login Activity</h3>
                    <p>Last login: {new Date().toLocaleString()}</p>
                    <a href="#logs">View Logs</a>
                </div>
                <div className="security-card">
                    <FaQrcode className="security-icon" />
                    <h3>Two-Factor Authentication</h3>
                    <p className="status-enabled">Enabled</p>
                    <button>Manage</button>
                </div>
                <div className="security-card">
                    <FaShieldAlt className="security-icon" />
                    <h3>Role-Based Access</h3>
                    <p>Your Role: Administrator</p>
                    <a href="#roles">Manage Roles</a>
                </div>
            </div>
        </section>
      </main>
    </div>
  );
};

export default AdminDashboard;
