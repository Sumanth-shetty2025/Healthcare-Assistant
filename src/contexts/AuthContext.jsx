import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, database } from "../firebase";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  deleteUser,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { get, push, ref, runTransaction, set, update } from "firebase/database";
import { uploadUnsignedToCloudinary } from "../utils/cloudinaryUpload";

const AuthContext = createContext();

const logFirebaseError = (scope, err, extra = {}) => {
  const details = {
    code: err?.code,
    name: err?.name,
    message: err?.message,
    ...extra,
  };
  // eslint-disable-next-line no-console
  console.error(`[AuthContext:${scope}]`, details);
};

const logNonCriticalWarning = (scope, err, extra = {}) => {
  const details = {
    code: err?.code,
    name: err?.name,
    message: err?.message,
    ...extra,
  };
  // eslint-disable-next-line no-console
  console.warn(`[AuthContext:${scope}] (non-critical)`, details);
};

const getRoleLabel = (role) => {
  if (role === "admin") return "admin";
  if (role === "doctor") return "doctor";
  if (role === "doctor_pending") return "doctor";
  if (role === "patient") return "patient";
  return "account";
};

const buildRoleMismatchError = (expectedRole, actualRole) => {
  const actualLabel = getRoleLabel(actualRole);
  const expectedLabel = getRoleLabel(expectedRole);
  return new Error(
    `This email is already registered as a ${actualLabel}. Please use your ${actualLabel} email to log in as a ${expectedLabel}.`
  );
};

const ALLOWED_DOC_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_DOC_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

const normalizeLicenseKey = (licenseNumber) => {
  return String(licenseNumber || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");
};

const validateUpload = (file, kind) => {
  if (!file) return;
  if (!ALLOWED_DOC_TYPES.has(file.type)) {
    throw new Error("Invalid file format. Allowed: PDF, JPG, PNG, WEBP.");
  }
  const max = kind === "photo" ? MAX_PHOTO_SIZE_BYTES : MAX_DOC_SIZE_BYTES;
  if (file.size > max) {
    throw new Error(`File too large. Max allowed is ${Math.round(max / (1024 * 1024))}MB.`);
  }
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userStatus, setUserStatus] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState(null);
  const googleProvider = new GoogleAuthProvider();

  const normalizeString = (value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : null;
  };

  const getRedirectTarget = (role) => {
    if (role === 'admin') return '/admin-dashboard';
    if (role === 'doctor') return '/doctor-dashboard';
    if (role === 'doctor_pending' || role === 'doctor_rejected') return '/doctor-verification-status';
    return '/home';
  };

  const getStatusMessage = (role) => {
    if (role === 'doctor_pending') return 'Your verification request is pending.';
    if (role === 'doctor_rejected') return 'Your verification request was rejected.';
    return null;
  };

  const getDecisionTime = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const resolveDoctorDecisionStatus = async (uid, role, status) => {
    const normalizedStatus = normalizeString(status);
    const roleCanUseDoctorDecision = ['doctor', 'doctor_pending', 'doctor_rejected'].includes(role);

    try {
      const [verifiedResult, rejectedResult] = await Promise.allSettled([
        get(ref(database, `verified_doctors/${uid}`)),
        get(ref(database, `rejected_doctors/${uid}`)),
      ]);
      const verifiedSnap = verifiedResult.status === 'fulfilled' ? verifiedResult.value : null;
      const rejectedSnap = rejectedResult.status === 'fulfilled' ? rejectedResult.value : null;
      const verified = verifiedSnap?.exists() ? verifiedSnap.val() || {} : null;
      const rejected = rejectedSnap?.exists() ? rejectedSnap.val() || {} : null;
      const approvedTime = getDecisionTime(verified?.approvedAt || verified?.updatedAt);
      const rejectedTime = getDecisionTime(rejected?.rejectedAt || rejected?.updatedAt);

      if (verified && (!rejected || approvedTime >= rejectedTime)) {
        try {
          await update(ref(database, `users/${uid}`), {
            role: 'doctor',
            status: 'approved',
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          logNonCriticalWarning('resolveDoctorDecisionStatus/users/approve', err, { uid });
        }
        return { role: 'doctor', status: 'approved' };
      }

      if (rejected) {
        try {
          await update(ref(database, `users/${uid}`), {
            role: 'doctor_rejected',
            status: 'rejected',
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          logNonCriticalWarning('resolveDoctorDecisionStatus/users/reject', err, { uid });
        }
        return { role: 'doctor_rejected', status: 'rejected' };
      }

      if (verifiedResult.status === 'rejected' || rejectedResult.status === 'rejected') {
        logNonCriticalWarning('resolveDoctorDecisionStatus/decision-read', verifiedResult.reason || rejectedResult.reason, { uid });
      }
    } catch (err) {
      logNonCriticalWarning('resolveDoctorDecisionStatus', err, { uid });
    }

    if (!roleCanUseDoctorDecision) {
      return { role, status };
    }

    if (role === 'doctor' && normalizedStatus === 'approved') {
      return { role: 'doctor', status: 'approved' };
    }

    if (role === 'doctor_rejected' || normalizedStatus === 'rejected') {
      return { role: 'doctor_rejected', status: 'rejected' };
    }

    return { role: 'doctor_pending', status: normalizedStatus || 'pending' };
  };

  const resolveUserProfile = async (user) => {
    const uid = user.uid;
    const authEmail = user.email || '';

    // eslint-disable-next-line no-console
    console.log('[Auth] Fetching user profile');
    let snapshot = null;
    let profileReadError = null;
    try {
      snapshot = await get(ref(database, `users/${uid}`));
    } catch (err) {
      profileReadError = err;
      logFirebaseError('users/read', err, { uid });
    }

    if (snapshot?.exists()) {
      const data = snapshot.val() || {};
      let role = normalizeString(data.role);
      let status = normalizeString(data.status);

      try {
        const adminSnap = await get(ref(database, `admins/${uid}`));
        if (adminSnap.exists()) {
          role = 'admin';
          status = status || 'active';
        }
      } catch (err) {
        logNonCriticalWarning('admins/read', err, { uid });
      }

      ({ role, status } = await resolveDoctorDecisionStatus(uid, role, status));

      // eslint-disable-next-line no-console
      console.log('[Auth] role fetched:', role);
      // eslint-disable-next-line no-console
      console.log('[Auth] status fetched:', status);

      return {
        uid,
        role,
        status,
        email: data.email || authEmail,
        raw: data,
      };
    }

    try {
      const adminSnap = await get(ref(database, `admins/${uid}`));
      if (adminSnap.exists()) {
        // eslint-disable-next-line no-console
        console.warn('[Auth] users node missing for admin; using admins fallback');
        return { uid, role: 'admin', status: 'active', email: authEmail, raw: null };
      }
    } catch (err) {
      logNonCriticalWarning('admins/read', err, { uid });
    }

    if (profileReadError) {
      // Do not throw here — falling back to decision checks is safer when RTDB reads are restricted.
      logNonCriticalWarning('resolveUserProfile/users/read-failed', profileReadError, { uid });
    }
    const doctorDecision = await resolveDoctorDecisionStatus(uid, 'doctor_pending', 'pending');
    // Defensive check: if there's an existing pending request, prefer doctor_pending
    try {
      const pendingSnap = await get(ref(database, `pending_doctor_requests/${uid}`));
      if (pendingSnap && pendingSnap.exists()) {
        // persist users/{uid} as doctor_pending to avoid creating a patient fallback
        try {
          const now = Date.now();
          await set(ref(database, `users/${uid}`), {
            uid,
            email: authEmail,
            role: 'doctor_pending',
            status: 'pending',
            createdAt: now,
            updatedAt: new Date(now).toISOString(),
          });
        } catch (err) {
          logNonCriticalWarning('resolveUserProfile/users/set-pending', err, { uid });
        }
        // eslint-disable-next-line no-console
        console.info('[Auth] Detected pending_doctor_requests; created users/{uid} as doctor_pending', { uid });
        return {
          uid,
          role: 'doctor_pending',
          status: 'pending',
          email: authEmail,
          raw: pendingSnap.val() || null,
        };
      }
    } catch (err) {
      logNonCriticalWarning('resolveUserProfile/pending-read', err, { uid });
    }
    // If admin approved -> create approved doctor user record.
    if (doctorDecision.role === 'doctor') {
      try {
        const now = Date.now();
        await set(ref(database, `users/${uid}`), {
          uid,
          email: authEmail,
          role: 'doctor',
          status: 'approved',
          createdAt: now,
          updatedAt: new Date(now).toISOString(),
        });
      } catch (err) {
        logNonCriticalWarning('users/create-approved-doctor', err, { uid });
      }

      return {
        uid,
        role: 'doctor',
        status: 'approved',
        email: authEmail,
        raw: null,
      };
    }

    // If there's a doctor decision indicating pending/rejected, persist that role instead
    if (doctorDecision.role && doctorDecision.role.startsWith('doctor')) {
      try {
        const now = Date.now();
        await set(ref(database, `users/${uid}`), {
          uid,
          email: authEmail,
          role: doctorDecision.role,
          status: doctorDecision.status || 'pending',
          createdAt: now,
          updatedAt: new Date(now).toISOString(),
        });
      } catch (err) {
        logNonCriticalWarning('users/create-doctor-decision', err, { uid, doctorDecision });
      }

      return {
        uid,
        role: doctorDecision.role,
        status: doctorDecision.status || 'pending',
        email: authEmail,
        raw: null,
      };
    }

    // Required centralized fallback for older patient accounts missing users/{uid}.
    // eslint-disable-next-line no-console
    console.warn('[Auth] users node missing; creating fallback patient account');
    const now = Date.now();
    await set(ref(database, `users/${uid}`), {
      uid,
      email: authEmail,
      role: 'patient',
      status: 'active',
      createdAt: now,
    });

    return {
      uid,
      role: 'patient',
      status: 'active',
      email: authEmail,
      raw: null,
    };
  };

  // Centralized: monitor auth session and fetch RTDB profile.
  useEffect(() => {
    let isMounted = true;

    setAuthLoading(true);
    setPersistence(auth, browserLocalPersistence).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('[Auth] persistence setup failed', { code: e?.code, message: e?.message });
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;

      // eslint-disable-next-line no-console
      console.groupCollapsed('[Auth] onAuthStateChanged');
      // eslint-disable-next-line no-console
      console.log('[Auth] Firebase session user:', user ? { uid: user.uid, email: user.email } : null);

      setAuthLoading(true);
      try {
        if (!user) {
          setCurrentUser(null);
          setUserRole(null);
          setUserStatus(null);
          return;
        }

        const profile = await resolveUserProfile(user);

        setCurrentUser(user);
        setUserRole(profile.role || null);
        setUserStatus(profile.status || null);
      } catch (err) {
        logFirebaseError('onAuthStateChanged/profile', err);
        try {
          await signOut(auth);
        } catch (e) {
          // ignore
        }
        setCurrentUser(null);
        setUserRole(null);
        setUserStatus(null);
      } finally {
        setAuthLoading(false);
        // eslint-disable-next-line no-console
        try { console.groupEnd(); } catch (e) { /* ignore */ }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signup function
  const signup = async (email, password, role, profileData = {}) => {
    try {
      setError(null);
      // eslint-disable-next-line no-console
      console.groupCollapsed('[AuthSignup] start');
      // eslint-disable-next-line no-console
      console.info('[AuthSignup] signup started', { email, role });

      const result = await createUserWithEmailAndPassword(auth, email, password);
      // eslint-disable-next-line no-console
      console.info('[AuthSignup] firebase auth signup success', { uid: result.user.uid, email: result.user.email });

      const normalizedProfile = typeof profileData === "string" ? { username: profileData } : (profileData || {});
      const cleanedUsername = String(normalizedProfile.username || normalizedProfile.fullName || "").trim();
      const cleanedFullName = String(normalizedProfile.fullName || cleanedUsername || "").trim();
      const cleanedPhoneNumber = String(normalizedProfile.phoneNumber || "").trim();
      const cleanedAge = String(normalizedProfile.age || "").trim();
      const cleanedGender = String(normalizedProfile.gender || "").trim();
      const cleanedBloodGroup = String(normalizedProfile.bloodGroup || "").trim();
      if (cleanedUsername) {
        await updateProfile(result.user, { displayName: cleanedUsername });
      }

      // Required: persist patient profile in RTDB for role-based login.
      if (role === 'patient') {
        const uid = result.user.uid;
        const now = Date.now();
        const fullName = cleanedFullName || result.user.displayName || '';

        try {
          // 1) users/{uid} (REQUIRED)
          await set(ref(database, `users/${uid}`), {
            uid,
            fullName,
            email,
            role: 'patient',
            status: 'active',
            phoneNumber: cleanedPhoneNumber,
            age: cleanedAge,
            gender: cleanedGender,
            bloodGroup: cleanedBloodGroup,
            createdAt: now,
          });
          // eslint-disable-next-line no-console
          console.info('[AuthSignup] users node write success', { path: `users/${uid}` });

          // 2) patients/{uid} (REQUIRED)
          await set(ref(database, `patients/${uid}`), {
            uid,
            fullName,
            email,
            phoneNumber: cleanedPhoneNumber,
            age: cleanedAge,
            gender: cleanedGender,
            bloodGroup: cleanedBloodGroup,
            createdAt: now,
          });
          // eslint-disable-next-line no-console
          console.info('[AuthSignup] patients node write success', { path: `patients/${uid}` });
        } catch (e) {
          logFirebaseError('patient_profile/set', e, { uid });

          // Prevent orphan auth accounts when DB writes fail.
          try {
            await deleteUser(result.user);
            // eslint-disable-next-line no-console
            console.warn('[AuthSignup] rolled back auth user due to RTDB write failure', { uid });
          } catch (deleteErr) {
            logNonCriticalWarning('patient_profile/deleteUser', deleteErr, { uid });
          }

          const code = e?.code || '';
          if (String(code).includes('permission') || String(code).includes('PERMISSION')) {
            throw new Error('Signup failed: Realtime Database rules blocked patient profile writes. Please update RTDB rules for users/{uid} and patients/{uid}.');
          }
          throw e;
        }

        setUserRole('patient');
        setUserStatus('active');
        // eslint-disable-next-line no-console
        console.info('[AuthSignup] patient signup completed', { uid, redirectTarget: '/home' });
        return result.user;
      }

      // Default behavior for other roles (legacy)
      await set(ref(database, `users/${result.user.uid}`), {
        email,
        role,
        username: cleanedUsername || result.user.displayName || "",
        fullName: cleanedFullName || result.user.displayName || "",
        phoneNumber: cleanedPhoneNumber,
        age: cleanedAge,
        gender: cleanedGender,
        bloodGroup: cleanedBloodGroup,
        createdAt: new Date().toISOString(),
      });

      if (role === "doctor") {
        const doctorProfileRef = ref(database, `doctors/${result.user.uid}`);
        const doctorProfileSnapshot = await get(doctorProfileRef);
        const existingDoctorProfile = doctorProfileSnapshot.exists() ? doctorProfileSnapshot.val() : {};

        await set(doctorProfileRef, {
          ...existingDoctorProfile,
          doctorId: result.user.uid,
          role: "doctor",
          doctorName: normalizedProfile.fullName || cleanedUsername || result.user.displayName || result.user.email.split("@")[0],
          email,
          qualification: existingDoctorProfile.qualification || "MBBS",
          tags: existingDoctorProfile.tags || [],
          licenseNumber: normalizedProfile.licenseNumber || "",
          specialization: normalizedProfile.specialization || "General Physician",
          hospital: normalizedProfile.hospitalName || "Community Clinic",
          experience: normalizedProfile.yearsOfExperience || "1 year",
          location: normalizedProfile.location || "Unknown",
          contact: normalizedProfile.phoneNumber || "",
          availability: normalizedProfile.availability || "Mon-Fri",
          bio: normalizedProfile.bio || "",
          createdAt: existingDoctorProfile.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      setUserRole(role);
      return result.user;
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        const friendlyError = new Error("This email is already registered. Please use your existing mail only.");
        setError(friendlyError.message);
        throw friendlyError;
      }

      setError(err.message);
      throw err;
    } finally {
      // eslint-disable-next-line no-console
      try { console.groupEnd(); } catch (e) { /* ignore */ }
    }
  };

  const uploadDoctorVerificationAsset = async (uid, file, key, options = {}) => {
    if (!file) return null;
    validateUpload(file, key === "profile_photo" ? "photo" : "doc");

    const cloudName = "dm8ozollp";
    const uploadPreset = "doctor_verification";
    const folder = `doctor_verification/${uid}`;

    // eslint-disable-next-line no-console
    console.info("[DoctorSignup] Cloudinary upload start", {
      uid,
      key,
      folder,
      name: file?.name,
      type: file?.type,
      size: file?.size,
    });

    const res = await uploadUnsignedToCloudinary({
      file,
      cloudName,
      uploadPreset,
      folder,
      tags: `doctor_verification,${key}`,
      context: `uid=${uid}|key=${key}`,
      onProgress: options?.onProgress,
    });

    // eslint-disable-next-line no-console
    console.info("[DoctorSignup] Cloudinary upload success", {
      uid,
      key,
      public_id: res?.public_id,
    });

    return res?.secure_url || null;
  };

  const createDoctorNotification = async (uid, payload) => {
    const notifRef = push(ref(database, `doctor_notifications/${uid}/items`));
    await set(notifRef, {
      uid,
      title: payload?.title || "Update",
      message: payload?.message || "",
      type: payload?.type || "info",
      read: false,
      createdAt: Date.now(),
    });
  };

  const reapplyDoctorVerificationRequest = async (uid, payload = {}, files = {}, options = {}) => {
    // Reapply flow for rejected doctors: reuse existing RTDB structure but do NOT touch auth.
    // payload: same shape as submitDoctorVerificationRequest's payload
    // files: may contain File objects for profilePhoto, licenseDocument, idDocument
    setError(null);

    const licenseNumber = String(payload?.licenseNumber || "").trim();
    if (!uid || !payload?.fullName || !payload?.email || !licenseNumber) {
      throw new Error('Missing required reapplication fields.');
    }

    try {
      const now = Date.now();

      // Upload any provided files, otherwise keep existing URLs from payload.documents
      let profilePhotoUrl = payload?.documents?.profilePhotoUrl || payload?.profilePhoto || null;
      let licenseDocumentUrl = payload?.documents?.licenseDocumentUrl || payload?.licenseDocument || null;
      let idDocumentUrl = payload?.documents?.idDocumentUrl || payload?.doctorCertificate || payload?.idDocument || null;

      const uploadQueue = [];
      if (files.licenseDocument) uploadQueue.push({ key: 'license_document', file: files.licenseDocument });
      if (files.idDocument) uploadQueue.push({ key: 'id_document', file: files.idDocument });
      if (files.profilePhoto) uploadQueue.push({ key: 'profile_photo', file: files.profilePhoto });

      for (const item of uploadQueue) {
        const url = await uploadDoctorVerificationAsset(uid, item.file, item.key, {
          onProgress: options?.onProgress,
        });
        if (item.key === 'profile_photo') profilePhotoUrl = url;
        if (item.key === 'license_document') licenseDocumentUrl = url;
        if (item.key === 'id_document') idDocumentUrl = url;
      }

      const requestDoc = {
        uid,
        fullName: String(payload?.fullName || '').trim(),
        email: String(payload?.email || '').trim(),
        licenseNumber,
        licenseKey: String((payload?.licenseKey) || licenseNumber).trim(),
        specialization: String(payload?.specialization || '').trim(),
        hospitalName: String(payload?.hospitalName || '').trim(),
        location: String(payload?.location || '').trim(),
        yearsOfExperience: String(payload?.yearsOfExperience || '').trim(),
        phoneNumber: String(payload?.phoneNumber || '').trim(),
        availability: String(payload?.availability || '').trim(),
        bio: String(payload?.bio || '').trim(),

        status: 'pending',
        verificationStatus: 'pending',
        emailVerificationSent: payload?.emailVerificationSent || false,
        emailVerified: Boolean(payload?.emailVerified),

        documents: {
          profilePhotoUrl,
          licenseDocumentUrl,
          idDocumentUrl,
        },

        profilePhoto: profilePhotoUrl,
        licenseDocument: licenseDocumentUrl,
        doctorCertificate: idDocumentUrl,

        createdAt: now,
        createdAtIso: new Date(now).toISOString(),
        updatedAt: now,
      };

      // Write pending request and remove rejected record
      const updates = {};
      updates[`pending_doctor_requests/${uid}`] = requestDoc;
      updates[`rejected_doctors/${uid}`] = null;

      await update(ref(database), updates);

      // Ensure users/{uid} indicates doctor_pending
      try {
        await update(ref(database, `users/${uid}`), {
          role: 'doctor_pending',
          status: 'pending',
          updatedAt: new Date().toISOString(),
        });
        // eslint-disable-next-line no-console
        console.log('Doctor UID:', uid);
        // eslint-disable-next-line no-console
        console.log('Saved Role:', 'doctor_pending');
      } catch (err) {
        // non-fatal
        logNonCriticalWarning('reapply/users/update', err, { uid });
      }

      // Send notification
      try {
        await createDoctorNotification(uid, {
          type: 'resubmission',
          title: 'Verification request resubmitted',
          message: 'Your verification request has been resubmitted for admin review.',
        });
      } catch (e) {
        logNonCriticalWarning('reapply/notification', e, { uid });
      }

      return { uid };
    } catch (err) {
      logFirebaseError('reapplyDoctorVerificationRequest', err, { uid });
      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      throw new Error(`Reapply failed: ${msg}`);
    }
  };

  const submitDoctorVerificationRequest = async (payload, files = {}, options = {}) => {
    // payload: { fullName, email, password, licenseNumber, specialization, hospitalName, location, yearsOfExperience, phoneNumber, availability, bio }
    setError(null);

    const email = String(payload?.email || "").trim();
    const password = String(payload?.password || "");
    const fullName = String(payload?.fullName || "").trim();
    const licenseNumber = String(payload?.licenseNumber || "").trim();
    const licenseKey = normalizeLicenseKey(licenseNumber);

    if (!email || !password || !fullName) {
      throw new Error("Missing required signup fields.");
    }

    if (!licenseNumber || !licenseKey) {
      throw new Error("Medical License / Registration Number is required.");
    }

    // Client-side upload validation (prevents large/invalid uploads early)
    validateUpload(files.licenseDocument, "doc");
    validateUpload(files.idDocument, "doc");
    if (files.profilePhoto) {
      validateUpload(files.profilePhoto, "photo");
    }

    // eslint-disable-next-line no-console
    console.info("[DoctorSignup] submitDoctorVerificationRequest start", {
      email,
      fullName,
      licenseKey,
      specialization: String(payload?.specialization || "").trim(),
      databaseURL: auth?.app?.options?.databaseURL,
      hasProfilePhoto: Boolean(files?.profilePhoto),
      hasLicenseDocument: Boolean(files?.licenseDocument),
      hasIdDocument: Boolean(files?.idDocument),
    });

    let result;
    try {
      result = await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      logFirebaseError("createUserWithEmailAndPassword", e, { email });
      throw e;
    }
    const uid = result.user.uid;

    // eslint-disable-next-line no-console
    console.log("Doctor UID:", uid);
    // eslint-disable-next-line no-console
    console.info("[DoctorSignup] Auth user created", { uid, email });

    if (fullName) {
      try {
        await updateProfile(result.user, { displayName: fullName });
      } catch (e) {
        logFirebaseError("updateProfile", e, { uid });
        throw e;
      }
    }

    // Send email verification (doctor still cannot access until approved).
    try {
      await sendEmailVerification(result.user);
    } catch (e) {
      // ignore; user can request again later
    }

    // Prevent duplicate license registration with a transactional registry lock (Realtime DB).
    const licenseRegistryRef = ref(database, `license_registry/${licenseKey}`);
    try {
      // eslint-disable-next-line no-console
      console.log("[DoctorSignup] Firebase write starting:", `license_registry/${licenseKey}`);
      const tx = await runTransaction(licenseRegistryRef, (current) => {
        if (current) {
          return; // abort
        }

        const now = Date.now();
        return {
          licenseKey,
          licenseNumber,
          uid,
          email,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
      });

      if (!tx.committed) {
        throw new Error(
          "This medical license number is already registered. Please contact support if this is an error."
        );
      }

      // eslint-disable-next-line no-console
      console.info("[DoctorSignup] License registry lock acquired", { uid, licenseKey });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[DoctorSignup] Firebase write failed:", `license_registry/${licenseKey}`, e);
      logFirebaseError("license_registry/runTransaction", e, { uid, licenseKey });
      try {
        await result.user.delete();
      } catch (deleteErr) {
        // ignore
      }
      throw e;
    }

    let profilePhotoUrl = null;
    let licenseDocumentUrl = null;
    let idDocumentUrl = null;

    try {
      const uploadQueue = [
        { key: "license_document", file: files.licenseDocument, label: "Medical license" },
        { key: "id_document", file: files.idDocument, label: "Doctor ID / certificate" },
        { key: "profile_photo", file: files.profilePhoto, label: "Profile photo" },
      ].filter((x) => Boolean(x.file));

      const totalUploads = uploadQueue.length;
      let completedUploads = 0;

      const reportProgress = (patch) => {
        if (typeof options?.onProgress === "function") {
          options.onProgress({
            stage: "upload",
            completedUploads,
            totalUploads,
            ...patch,
          });
        }
      };

      reportProgress({ message: totalUploads ? `Uploading 0/${totalUploads}` : "No uploads" });

      for (const item of uploadQueue) {
        reportProgress({ currentKey: item.key, message: `Uploading ${item.label}...` });
        const url = await uploadDoctorVerificationAsset(uid, item.file, item.key, {
          onProgress: (p) => {
            reportProgress({ currentKey: item.key, percent: p?.percent ?? null });
          },
        });
        if (item.key === "profile_photo") profilePhotoUrl = url;
        if (item.key === "license_document") licenseDocumentUrl = url;
        if (item.key === "id_document") idDocumentUrl = url;
        completedUploads += 1;
        reportProgress({
          currentKey: item.key,
          percent: 100,
          message: `Uploaded ${completedUploads}/${totalUploads}`,
        });
      }
    } catch (uploadErr) {
      logFirebaseError("uploadDoctorVerificationAsset", uploadErr, { uid, licenseKey });
      try {
        await update(licenseRegistryRef, { status: "failed", updatedAt: Date.now() });
      } catch (e) {
        // ignore
      }
      try {
        await result.user.delete();
      } catch (e) {
        // ignore
      }
      throw uploadErr;
    }

    const now = Date.now();
    const requestDoc = {
      uid,
      fullName,
      email,
      licenseNumber,
      licenseKey,
      specialization: String(payload?.specialization || "").trim(),
      hospitalName: String(payload?.hospitalName || "").trim(),
      location: String(payload?.location || "").trim(),
      yearsOfExperience: String(payload?.yearsOfExperience ?? "").trim(),
      phoneNumber: String(payload?.phoneNumber || "").trim(),
      availability: String(payload?.availability || "").trim(),
      bio: String(payload?.bio || "").trim(),

      role: "doctor_pending",
      status: "pending",
      verificationStatus: "pending",
      emailVerificationSent: true,
      emailVerified: Boolean(result.user.emailVerified),

      documents: {
        profilePhotoUrl,
        licenseDocumentUrl,
        idDocumentUrl,
      },

      // Alias fields (matches requested RTDB example structure)
      profilePhoto: profilePhotoUrl,
      licenseDocument: licenseDocumentUrl,
      doctorCertificate: idDocumentUrl,

      createdAt: now,
      createdAtIso: new Date(now).toISOString(),
      updatedAt: now,
    };

    const pendingRequestPath = `pending_doctor_requests/${uid}`;

    // Required debug logs for doctor verification request creation.
    // eslint-disable-next-line no-console
    console.log("Doctor UID:", uid);
    // eslint-disable-next-line no-console
    console.log("Doctor Data:", requestDoc);
    // eslint-disable-next-line no-console
    console.log("Creating pending_doctor_requests record");
    // eslint-disable-next-line no-console
    console.log("Firebase Path:", pendingRequestPath);
    // eslint-disable-next-line no-console
    console.log("Writing to:", pendingRequestPath);

    // eslint-disable-next-line no-console
    console.info("[DoctorSignup] Writing pending request", {
      uid,
      path: pendingRequestPath,
      hasDocs: Boolean(profilePhotoUrl || licenseDocumentUrl || idDocumentUrl),
    });

    try {
      await set(ref(database, pendingRequestPath), requestDoc);
      // eslint-disable-next-line no-console
      console.log("Write Success");
      // eslint-disable-next-line no-console
      console.info("[DoctorSignup] Pending request write OK", { uid });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Write Failed:", e);
      logFirebaseError("pending_doctor_requests/set", e, { uid });
      throw e;
    }

    try {
      const cleanupUpdates = {
        [`verified_doctors/${uid}`]: null,
        [`rejected_doctors/${uid}`]: null,
        [`doctors/${uid}`]: null,
      };
      // eslint-disable-next-line no-console
      console.log("[DoctorSignup] Firebase multi-path cleanup update starting:", cleanupUpdates);
      await update(ref(database), {
        [`verified_doctors/${uid}`]: null,
        [`rejected_doctors/${uid}`]: null,
        [`doctors/${uid}`]: null,
      });
      // eslint-disable-next-line no-console
      console.log("[DoctorSignup] Firebase multi-path cleanup update success");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[DoctorSignup] Firebase multi-path cleanup update failed:", e);
      logNonCriticalWarning("doctor_verification_cleanup", e, { uid });
    }

    // Optional sanity read-back (helps confirm correct DB instance/rules).
    try {
      const writtenSnap = await get(ref(database, pendingRequestPath));
      // eslint-disable-next-line no-console
      console.info("[DoctorSignup] Pending request read-back", { uid, exists: writtenSnap.exists() });
    } catch (e) {
      logFirebaseError("pending_doctor_requests/readback", e, { uid });
    }

    // Notification is helpful but not critical for signup completion.
    // If rules don't allow this write yet, don't fail the whole flow.
    try {
      await createDoctorNotification(uid, {
        type: "submission",
        title: "Verification request submitted",
        message: "Your verification request has been submitted successfully. Please wait for admin approval.",
      });
    } catch (e) {
      logNonCriticalWarning("doctor_notifications/set", e, { uid });
    }

    // Required: keep a minimal user record in Realtime DB (role intentionally NOT doctor yet).
    // eslint-disable-next-line no-console
    console.log("Creating users record");
    // eslint-disable-next-line no-console
    console.log("[DoctorSignup] Firebase write starting:", `users/${uid}`);
    try {
      await set(ref(database, `users/${uid}`), {
        uid,
        email,
        role: "doctor_pending",
        status: "pending",
        fullName,
        createdAt: Date.now(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[DoctorSignup] Firebase write failed:", `users/${uid}`, e);
      throw e;
    }
    // eslint-disable-next-line no-console
    console.info("[DoctorSignup] users/{uid} written", { uid, role: "doctor_pending" });
    // eslint-disable-next-line no-console
    console.log('Saved Role:', 'doctor_pending');

    // Ensure doctor is not logged-in/active right after request.
    try {
      await signOut(auth);
    } catch (e) {
      logFirebaseError("signOut", e, { uid });
      // don't block success on signOut
    }
    setCurrentUser(null);
    setUserRole(null);
    setUserStatus(null);
    try {
      // no-op
    } catch (e) {
      // ignore
    }

    return { uid, email };
  };

  // Login function
  const login = async (email, password, expectedRole = null) => {
    const rejectLogin = async (message) => {
      await signOut(auth);
      setCurrentUser(null);
      setUserRole(null);
      setUserStatus(null);
      throw new Error(message);
    };

    try {
      setError(null);
      // eslint-disable-next-line no-console
      console.groupCollapsed('[AuthLogin] start');
      // eslint-disable-next-line no-console
      console.log('[AuthLogin] login started', { email, expectedRole });

      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithEmailAndPassword(auth, email, password);
      // eslint-disable-next-line no-console
      console.log('[Auth] Firebase login success', { uid: result.user.uid, email: result.user.email });

      const profile = await resolveUserProfile(result.user);
      const { uid } = profile;
      const authEmail = profile.email || result.user.email || email || '';
      const role = profile.role || null;
      const status = profile.status || null;
      const normRole = normalizeString(role);

      let redirectTarget = null;

      if (expectedRole === 'doctor') {
        // Allow doctors to log in even if their verification is pending or rejected.
        // Decide redirect target by checking RTDB decision nodes.
        // Required debug logs below.
        console.log('[Login] Doctor login requested');
        console.log('Doctor UID:', uid);

        try {
          const [verifiedSnap, pendingSnap, rejectedSnap] = await Promise.all([
            get(ref(database, `verified_doctors/${uid}`)),
            get(ref(database, `pending_doctor_requests/${uid}`)),
            get(ref(database, `rejected_doctors/${uid}`)),
          ]);

          const verifiedExists = Boolean(verifiedSnap && verifiedSnap.exists());
          const pendingExists = Boolean(pendingSnap && pendingSnap.exists());
          const rejectedExists = Boolean(rejectedSnap && rejectedSnap.exists());

          console.log('Saved Role:', role);
          console.log('Pending Exists:', pendingExists);
          console.log('Verified Exists:', verifiedExists);
          console.log('Rejected Exists:', rejectedExists);
          console.log('User Role:', userRole);

          if (verifiedExists) {
            redirectTarget = '/doctor-dashboard';
          } else if (pendingExists || rejectedExists) {
            redirectTarget = '/doctor-verification-status';
          } else {
            redirectTarget = getRedirectTarget(role);
          }

          console.log('Redirect Target:', redirectTarget);
        } catch (e) {
          // If reads fail, fallback to existing role/status based redirect.
          console.log('Doctor UID:', uid);
          console.log('Pending Exists:', false);
          console.log('Verified Exists:', false);
          console.log('Rejected Exists:', false);
          redirectTarget = getRedirectTarget(role);
          console.log('Redirect Target:', redirectTarget);
        }
      } else if (expectedRole === 'patient') {
        if (normRole !== 'patient') {
          await rejectLogin('This account is not a patient account.');
        }
        redirectTarget = '/home';
      } else if (expectedRole === 'admin') {
        if (normRole !== 'admin') {
          await rejectLogin('Access Denied: You are not authorized to access the admin panel.');
        }
        redirectTarget = '/admin-dashboard';
      } else {
        redirectTarget = getRedirectTarget(role);
      }

      // eslint-disable-next-line no-console
      console.log("[Login] selectedRole:", expectedRole);
      // eslint-disable-next-line no-console
      console.log("[Login] fetched role:", role);
      // eslint-disable-next-line no-console
      console.log("[Login] fetched status:", status);
      // eslint-disable-next-line no-console
      console.log("[Login] redirect target:", redirectTarget);

      // eslint-disable-next-line no-console
      console.log('[Auth] Role:', role);
      // eslint-disable-next-line no-console
      console.log('[Auth] Status:', status);
      // eslint-disable-next-line no-console
      console.log('[Auth] Redirecting to:', redirectTarget);

      setCurrentUser(result.user);
      setUserRole(role);
      setUserStatus(status);

      return {
        uid,
        role,
        status,
        email: authEmail,
        redirectTarget,
        statusMessage: getStatusMessage(role),
      };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      // eslint-disable-next-line no-console
      try { console.groupEnd(); } catch (e) { /* ignore */ }
    }
  };

  const signInWithGoogle = async (expectedRole = "patient") => {
    if (expectedRole === 'admin') {
      const adminError = new Error("Admin accounts cannot be created or accessed via Google Sign-In.");
      setError(adminError.message);
      throw adminError;
    }
    try {
      setError(null);
      await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithPopup(auth, googleProvider);
      const uid = result.user.uid;
      const userRef = ref(database, `users/${uid}`);
      const snapshot = await get(userRef);

      const existingUserData = snapshot.exists() ? snapshot.val() : null;
      
      // If account already exists, enforce role match
      if (existingUserData && existingUserData.role && existingUserData.role !== expectedRole) {
        await signOut(auth);
        setCurrentUser(null);
        setUserRole(null);
        throw buildRoleMismatchError(expectedRole, existingUserData.role);
      }

      // Doctors must go through verification approval workflow.
      if (expectedRole === 'doctor') {
        const doctorProfileRef = ref(database, `doctors/${uid}`);
        const doctorProfileSnapshot = await get(doctorProfileRef);
        const doctorProfile = doctorProfileSnapshot.exists() ? doctorProfileSnapshot.val() : null;
        const isApprovedDoctor = Boolean(doctorProfile && doctorProfile.status !== 'pending');

        if (!(existingUserData?.role === 'doctor' && isApprovedDoctor)) {
          await signOut(auth);
          setCurrentUser(null);
          setUserRole(null);
          throw new Error(
            'Doctor access requires admin verification approval. Please submit a verification request using Doctor Sign Up and log in with email/password after approval.'
          );
        }
      }

      const role = existingUserData?.role || expectedRole;

      await set(userRef, {
        ...(existingUserData || {}),
        email: result.user.email || existingUserData?.email || "",
        username: existingUserData?.username || result.user.displayName || "",
        role,
        status: existingUserData?.status || (role === 'patient' ? 'active' : null),
        createdAt: existingUserData?.createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      });

      if (role === "doctor") {
        const doctorProfileRef = ref(database, `doctors/${uid}`);
        const doctorProfileSnapshot = await get(doctorProfileRef);
        const existingDoctorProfile = doctorProfileSnapshot.exists() ? doctorProfileSnapshot.val() : null;

        await set(doctorProfileRef, {
          ...(existingDoctorProfile || {}),
          doctorId: uid,
          role: "doctor",
          doctorName: existingDoctorProfile?.doctorName || result.user.displayName || result.user.email?.split("@")[0] || "",
          email: result.user.email || existingDoctorProfile?.email || "",
          specialization: existingDoctorProfile?.specialization || "General Physician",
          hospital: existingDoctorProfile?.hospitalName || "Community Clinic",
          location: existingDoctorProfile?.location || "Unknown",
          experience: existingDoctorProfile?.yearsOfExperience || "1 year",
          contact: existingDoctorProfile?.phoneNumber || "",
          qualification: existingDoctorProfile?.qualification || "MBBS",
          tags: existingDoctorProfile?.tags || [],
          createdAt: existingDoctorProfile?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      setCurrentUser(result.user);
      setUserRole(role);
      setUserStatus(existingUserData?.status || (role === 'patient' ? 'active' : null));

      return {
        uid,
        role,
        status: existingUserData?.status || (role === 'patient' ? 'active' : null),
        email: result.user.email || '',
        redirectTarget: getRedirectTarget(role),
      };
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const resetPassword = async (email) => {
    try {
      setError(null);
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      setError(null);
      await signOut(auth);
      setCurrentUser(null);
      setUserRole(null);
      setUserStatus(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const value = {
    currentUser,
    authLoading,
    // Backwards-compatible aliases (keep existing UI unchanged)
    user: currentUser,
    userRole,
    userStatus,
    loading: authLoading,
    error,
    signup,
    submitDoctorVerificationRequest,
    reapplyDoctorVerificationRequest,
    login,
    signInWithGoogle,
    resetPassword,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
