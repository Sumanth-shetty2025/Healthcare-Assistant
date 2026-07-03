import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaEdit, FaSave, FaTimes } from "react-icons/fa";
import { get, ref } from "firebase/database";
import { database } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import "../styles/doctorReapplication.css";

function PreviewModal({ url, type, onClose }) {
  if (!url) return null;
  return (
    <div className="reapp-modal" onClick={onClose}>
      <div className="reapp-modal-inner" onClick={(e) => e.stopPropagation()}>
        <button className="reapp-modal-close" onClick={onClose}>Close</button>
        {type && type.startsWith("image") ? (
          <img src={url} alt="preview" className="reapp-preview-image" />
        ) : (
          <iframe title="preview" src={url} className="reapp-preview-iframe" />
        )}
      </div>
    </div>
  );
}

export default function DoctorReapplicationReviewPage() {
  const { currentUser, reapplyDoctorVerificationRequest } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [editing, setEditing] = useState({});
  const [form, setForm] = useState({});
  const [files, setFiles] = useState({});
  const [stagedDocs, setStagedDocs] = useState({});
  const [preview, setPreview] = useState({ url: null, type: null });
  const [submitting, setSubmitting] = useState(false);

  const uid = currentUser?.uid || (location.state && location.state.record && location.state.record.uid) || null;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!uid) return;
      setLoading(true);
      try {
        const snap = await get(ref(database, `rejected_doctors/${uid}`));
        const data = snap.exists() ? snap.val() : (location.state?.record || null);
        if (!mounted) return;
        setRecord(data);
        setForm({
          fullName: data?.fullName || "",
          email: data?.email || "",
          phoneNumber: data?.phoneNumber || "",
          licenseNumber: data?.licenseNumber || "",
          specialization: data?.specialization || "",
          hospitalName: data?.hospitalName || "",
          location: data?.location || "",
          yearsOfExperience: data?.yearsOfExperience || "",
          availability: data?.availability || "",
          bio: data?.bio || "",
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('reapplication/load', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [uid, location.state]);

  const documentUrls = useMemo(() => {
    if (!record) return {};
    return {
      profilePhoto: record?.documents?.profilePhotoUrl || record?.profilePhoto || record?.profilePhotoUrl || null,
      licenseDocument: record?.documents?.licenseDocumentUrl || record?.licenseDocument || record?.licenseDocumentUrl || null,
      idDocument: record?.documents?.idDocumentUrl || record?.doctorCertificate || record?.idDocument || null,
    };
  }, [record]);

  const toggleEdit = (section) => {
    setEditing((p) => ({ ...p, [section]: !p[section] }));
  };

  const handleChange = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const handleFileReplace = (key, file) => {
    if (!file) return;
    try {
      const previewUrl = URL.createObjectURL(file);
      setStagedDocs((p) => ({ ...p, [key]: { file, previewUrl, name: file.name } }));
      // also keep in files until user cancels; final upload happens on global submit
      setFiles((p) => ({ ...p, [key]: file }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('file/replace', e);
    }
  };

  const handlePreview = (url) => {
    if (!url) return;
    const lower = String(url).toLowerCase();
    const type = lower.endsWith('.pdf') ? 'application/pdf' : (lower.match(/\.(jpg|jpeg|png|webp)$/) ? 'image/*' : 'application/octet-stream');
    setPreview({ url, type });
  };

  const applyStagedDocument = (key) => {
    const staged = stagedDocs[key];
    if (!staged) return;
    // update local record documents preview so UI reflects saved change
    setRecord((r) => ({
      ...r,
      documents: {
        ...(r?.documents || {}),
        [`${key}Url`]: staged.previewUrl,
      },
    }));
    // clear staged entry but keep file in files for eventual upload
    setStagedDocs((p) => {
      const copy = { ...p };
      delete copy[key];
      return copy;
    });
  };

  const cancelStagedDocument = (key) => {
    const staged = stagedDocs[key];
    if (staged && staged.previewUrl) {
      try { URL.revokeObjectURL(staged.previewUrl); } catch (e) { /* ignore */ }
    }
    setStagedDocs((p) => {
      const copy = { ...p };
      delete copy[key];
      return copy;
    });
    setFiles((p) => {
      const copy = { ...p };
      delete copy[key];
      return copy;
    });
  };

  const handleCancel = (section) => {
    // revert any staged changes for that section
    if (!record) return;
    if (section === 'personal') {
      setForm((p) => ({ ...p, fullName: record.fullName || '', phoneNumber: record.phoneNumber || '' }));
      setFiles((p) => ({ ...p, profilePhoto: undefined }));
    }
    if (section === 'professional') {
      setForm((p) => ({ ...p,
        licenseNumber: record.licenseNumber || '',
        specialization: record.specialization || '',
        hospitalName: record.hospitalName || '',
        location: record.location || '',
        yearsOfExperience: record.yearsOfExperience || '',
      }));
      setFiles((p) => ({ ...p, licenseDocument: undefined }));
    }
    if (section === 'availability') {
      setForm((p) => ({ ...p, availability: record.availability || '', bio: record.bio || '' }));
    }
    setEditing((p) => ({ ...p, [section]: false }));
  };

  const handleSubmit = async () => {
    if (!uid || !reapplyDoctorVerificationRequest) return;
    setSubmitting(true);
    try {
      const payload = {
        ...record,
        fullName: form.fullName,
        email: record.email || form.email,
        phoneNumber: form.phoneNumber,
        licenseNumber: form.licenseNumber,
        specialization: form.specialization,
        hospitalName: form.hospitalName,
        location: form.location,
        yearsOfExperience: form.yearsOfExperience,
        availability: form.availability,
        bio: form.bio,
        documents: record.documents || {},
      };

      const uploadFiles = {};
      if (files.profilePhoto) uploadFiles.profilePhoto = files.profilePhoto;
      if (files.licenseDocument) uploadFiles.licenseDocument = files.licenseDocument;
      if (files.idDocument) uploadFiles.idDocument = files.idDocument;
      // debug info before submitting
      // eslint-disable-next-line no-console
      console.info('reapply/submit', { uid, payloadSummary: { fullName: payload.fullName, email: payload.email, licenseNumber: payload.licenseNumber }, uploadFilesSummary: { hasProfilePhoto: !!uploadFiles.profilePhoto, hasLicenseDocument: !!uploadFiles.licenseDocument, hasIdDocument: !!uploadFiles.idDocument } });

      await reapplyDoctorVerificationRequest(uid, payload, uploadFiles, {
        onProgress: (p) => {
          // eslint-disable-next-line no-console
          console.info('reapply/progress', p);
        },
      });

      // success
      navigate('/doctor-verification-status');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('reapply/submit', e);
      const message = (e && e.message) ? e.message : 'Unknown error during reapplication.';
      let details = '';
      try {
        details = JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
      } catch (err) {
        details = String(e);
      }
      alert(`Failed to resubmit reapplication: ${message}\n\nDetails:\n${details}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="reapp-shell">Loading reapplication...</div>;
  }

  if (!record) {
    return (
      <div className="reapp-shell">
        <div className="reapp-header sticky">Reapplication Review</div>
        <div className="reapp-empty">No rejected application found for your account.</div>
      </div>
    );
  }

  return (
    <div className="reapp-shell">
      <header className="reapp-header sticky">
        <div className="reapp-header-left">
          <h1>Reapplication Review</h1>
          <p>Review your previous application, edit only the sections you need, then resubmit.</p>
        </div>
      </header>

      <main className="reapp-main">
        <section className="reapp-card status-card">
          <div className="reapp-card-title">Application Status</div>
          <div className="reapp-status-badge rejected">Rejected</div>
          <div className="reapp-field">
            <label>Rejection Reason</label>
            <div className="reapp-text">{record.rejectionReason || record.reason || record.adminMessage || 'No detailed reason provided.'}</div>
          </div>
          <div className="reapp-info">Please update incorrect fields or replace documents, then click Reapply For Verification.</div>
        </section>

        <section className="reapp-card">
          <div className="reapp-card-header">
            <div className="reapp-card-title">Personal Information</div>
            <div className="reapp-card-actions">
              {!editing.personal ? (
                <button onClick={() => toggleEdit('personal')} className="btn-edit"><FaEdit /> Edit</button>
              ) : (
                <>
                  <button onClick={() => setEditing((p) => ({ ...p, personal: false }))} className="btn-save"><FaSave /> Save</button>
                  <button onClick={() => handleCancel('personal')} className="btn-cancel"><FaTimes /> Cancel</button>
                </>
              )}
            </div>
          </div>

          <div className="reapp-field"><label>Full Name</label>
            <input value={form.fullName} onChange={(e) => handleChange('fullName', e.target.value)} readOnly={!editing.personal} />
          </div>

          <div className="reapp-field"><label>Email Address</label>
            <input value={record.email || ''} readOnly />
            <div className="field-note">Email is read-only and cannot be changed here.</div>
          </div>

          <div className="reapp-field"><label>Phone Number</label>
            <input value={form.phoneNumber} onChange={(e) => handleChange('phoneNumber', e.target.value)} readOnly={!editing.personal} />
          </div>

          <div className="reapp-field doc-row">
            <label>Profile Photo</label>
            <div className="doc-actions">
              {stagedDocs.profilePhoto ? (
                <div className="staged-block">
                  <span className="doc-name-small">Selected: {stagedDocs.profilePhoto.name}</span>
                  <button onClick={() => handlePreview(stagedDocs.profilePhoto.previewUrl)} className="btn-action">Preview</button>
                  <button onClick={() => applyStagedDocument('profilePhoto')} className="btn-save">Save</button>
                  <button onClick={() => cancelStagedDocument('profilePhoto')} className="btn-cancel">Cancel</button>
                </div>
              ) : documentUrls.profilePhoto ? (
                <>
                  <button onClick={() => handlePreview(documentUrls.profilePhoto)} className="btn-action">Preview</button>
                </>
              ) : <span className="doc-missing">No photo uploaded</span>}

              {editing.personal && (
                <input type="file" accept="image/*" onChange={(e) => handleFileReplace('profilePhoto', e.target.files[0])} />
              )}
            </div>
          </div>
        </section>

        <section className="reapp-card">
          <div className="reapp-card-header">
            <div className="reapp-card-title">Professional Information</div>
            <div className="reapp-card-actions">
              {!editing.professional ? (
                <button onClick={() => toggleEdit('professional')} className="btn-edit"><FaEdit /> Edit</button>
              ) : (
                <>
                  <button onClick={() => setEditing((p) => ({ ...p, professional: false }))} className="btn-save"><FaSave /> Save</button>
                  <button onClick={() => handleCancel('professional')} className="btn-cancel"><FaTimes /> Cancel</button>
                </>
              )}
            </div>
          </div>

          <div className="reapp-field"><label>Medical License Number</label>
            <input value={form.licenseNumber} onChange={(e) => handleChange('licenseNumber', e.target.value)} readOnly={!editing.professional} />
          </div>
          <div className="reapp-field"><label>Specialization</label>
            <input value={form.specialization} onChange={(e) => handleChange('specialization', e.target.value)} readOnly={!editing.professional} />
          </div>
          <div className="reapp-field"><label>Hospital / Clinic</label>
            <input value={form.hospitalName} onChange={(e) => handleChange('hospitalName', e.target.value)} readOnly={!editing.professional} />
          </div>
          <div className="reapp-field"><label>Location / City</label>
            <input value={form.location} onChange={(e) => handleChange('location', e.target.value)} readOnly={!editing.professional} />
          </div>
          <div className="reapp-field"><label>Years of Experience</label>
            <input value={form.yearsOfExperience} onChange={(e) => handleChange('yearsOfExperience', e.target.value)} readOnly={!editing.professional} />
          </div>

          <div className="reapp-field doc-row">
            <label>Medical License Document</label>
            <div className="doc-actions">
              {stagedDocs.licenseDocument ? (
                <div className="staged-block">
                  <span className="doc-name-small">Selected: {stagedDocs.licenseDocument.name}</span>
                  <button onClick={() => handlePreview(stagedDocs.licenseDocument.previewUrl)} className="btn-action">Preview</button>
                  <button onClick={() => applyStagedDocument('licenseDocument')} className="btn-save">Save</button>
                  <button onClick={() => cancelStagedDocument('licenseDocument')} className="btn-cancel">Cancel</button>
                </div>
              ) : documentUrls.licenseDocument ? (
                <>
                  <button onClick={() => handlePreview(documentUrls.licenseDocument)} className="btn-action">Preview</button>
                </>
              ) : <span className="doc-missing">No document</span>}
              {editing.professional && (
                <input type="file" accept="application/pdf,image/*" onChange={(e) => handleFileReplace('licenseDocument', e.target.files[0])} />
              )}
            </div>
          </div>
        </section>

        <section className="reapp-card">
          <div className="reapp-card-header">
            <div className="reapp-card-title">Availability Information</div>
            <div className="reapp-card-actions">
              {!editing.availability ? (
                <button onClick={() => toggleEdit('availability')} className="btn-edit"><FaEdit /> Edit</button>
              ) : (
                <>
                  <button onClick={() => setEditing((p) => ({ ...p, availability: false }))} className="btn-save"><FaSave /> Save</button>
                  <button onClick={() => handleCancel('availability')} className="btn-cancel"><FaTimes /> Cancel</button>
                </>
              )}
            </div>
          </div>

          <div className="reapp-field"><label>Available Days / Time</label>
            <input value={form.availability} onChange={(e) => handleChange('availability', e.target.value)} readOnly={!editing.availability} placeholder="e.g. Mon-Fri, 10:00-16:00" />
          </div>
          <div className="reapp-field"><label>Bio / Description</label>
            <textarea value={form.bio} onChange={(e) => handleChange('bio', e.target.value)} readOnly={!editing.availability} rows={5} />
          </div>
        </section>

        <section className="reapp-card">
          <div className="reapp-card-header">
            <div className="reapp-card-title">Verification Documents</div>
          </div>

          <div className="reapp-doc-list">
            <div className="reapp-doc-item">
              <div className="doc-meta">
                <div className="doc-name">Profile Photo</div>
                <div className="doc-status">{documentUrls.profilePhoto ? 'Uploaded' : 'Missing'}</div>
              </div>
              <div className="doc-actions">
                {documentUrls.profilePhoto && <button onClick={() => handlePreview(documentUrls.profilePhoto)} className="btn-action">Preview</button>}
                <label className="btn-action replace">
                  Replace Document
                  <input type="file" accept="image/*" onChange={(e) => handleFileReplace('profilePhoto', e.target.files[0])} />
                </label>
              </div>
            </div>

            <div className="reapp-doc-item">
              <div className="doc-meta">
                <div className="doc-name">Medical License Document</div>
                <div className="doc-status">{documentUrls.licenseDocument ? 'Uploaded' : 'Missing'}</div>
              </div>
              <div className="doc-actions">
                {documentUrls.licenseDocument && <button onClick={() => handlePreview(documentUrls.licenseDocument)} className="btn-action">Preview</button>}
                <label className="btn-action replace">
                  Replace Document
                  <input type="file" accept="application/pdf,image/*" onChange={(e) => handleFileReplace('licenseDocument', e.target.files[0])} />
                </label>
              </div>
            </div>

            <div className="reapp-doc-item">
              <div className="doc-meta">
                <div className="doc-name">Doctor ID / Certificate</div>
                <div className="doc-status">{documentUrls.idDocument ? 'Uploaded' : 'Missing'}</div>
              </div>
              <div className="doc-actions">
                {stagedDocs.idDocument ? (
                  <div className="staged-block">
                    <span className="doc-name-small">Selected: {stagedDocs.idDocument.name}</span>
                    <button onClick={() => handlePreview(stagedDocs.idDocument.previewUrl)} className="btn-action">Preview</button>
                    <button onClick={() => applyStagedDocument('idDocument')} className="btn-save">Save</button>
                    <button onClick={() => cancelStagedDocument('idDocument')} className="btn-cancel">Cancel</button>
                  </div>
                ) : (
                  <>
                    {documentUrls.idDocument && <button onClick={() => handlePreview(documentUrls.idDocument)} className="btn-action">Preview</button>}
                    <label className="btn-action replace">
                      Replace Document
                      <input type="file" accept="application/pdf,image/*" onChange={(e) => handleFileReplace('idDocument', e.target.files[0])} />
                    </label>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="reapp-card review-card">
          <div className="reapp-card-title">Review & Submit</div>
          <div className="reapp-summary">
            <div><strong>Full Name:</strong> {form.fullName}</div>
            <div><strong>Email:</strong> {record.email}</div>
            <div><strong>License:</strong> {form.licenseNumber}</div>
            <div><strong>Specialization:</strong> {form.specialization}</div>
            <div><strong>Hospital:</strong> {form.hospitalName}</div>
          </div>

          <div className="reapp-actions">
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting...' : 'Reapply For Verification'}</button>
            <button className="btn-secondary" onClick={() => navigate('/doctor-verification-status')}>Cancel</button>
          </div>
        </section>
      </main>

      <PreviewModal url={preview.url} type={preview.type} onClose={() => setPreview({ url: null, type: null })} />
    </div>
  );
}
