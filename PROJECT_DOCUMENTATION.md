# Healthcare Assistant - Complete Project Documentation

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Authentication System](#authentication-system)
4. [Patient Workflow](#patient-workflow)
5. [Doctor Workflow](#doctor-workflow)
6. [Appointment System](#appointment-system)
7. [Backend API](#backend-api)
8. [Database Structure](#database-structure)
9. [Technology Stack](#technology-stack)

---

## Project Overview

**Healthcare Assistant** is an AI-powered medical diagnostic platform that analyzes medical images (Chest X-rays and Retina fundus images) using machine learning models and connects patients with specialized doctors for appointments.

### Key Features:
✅ Dual-modality AI analysis (Chest X-ray & Retina disease detection)  
✅ Real-time disease prediction with confidence scores  
✅ Doctor recommendation system based on predictions  
✅ Appointment booking system  
✅ Doctor dashboard for managing appointments  
✅ Patient appointment tracking with notifications  
✅ Secure Firebase authentication (Email/Google Sign-In)  
✅ Cloud storage for medical reports  
✅ Scanning report generation and sharing  

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                       │
├─────────────────────────────────────────────────────────────┤
│ • Authentication (Login/Signup)                              │
│ • Image Upload & Analysis                                    │
│ • Results Display                                             │
│ • Doctor Recommendation                                       │
│ • Appointment Booking                                         │
│ • Patient Dashboard                                           │
└──────────────┬──────────────────────────────────────────────┘
               │
               ├─────────────────────────────────┐
               │                                 │
               ▼                                 ▼
    ┌──────────────────────┐        ┌──────────────────────┐
    │  BACKEND (Flask)     │        │  FIREBASE            │
    ├──────────────────────┤        ├──────────────────────┤
    │ • ML Models          │        │ • Authentication     │
    │   - Chest X-ray      │        │ • Realtime Database  │
    │   - Retina Detection │        │ • Cloud Storage      │
    │ • Prediction API     │        │ • Firestore          │
    │ • RAG Engine         │        │                      │
    │   - Doctor Matching  │        │                      │
    │ • Image Processing   │        │                      │
    └──────────────────────┘        └──────────────────────┘
```

---

## Authentication System

### Step 1️⃣: Login Page (`LoginPage.jsx`)

**URL**: `/login`

**Features**:
- Role selection: **Patient** or **Doctor**
- Email/Password login
- Google Sign-In (OAuth)
- Dark mode toggle
- Password reset
- Form validation
- Error handling with helpful messages

**Process**:
```javascript
1. User selects role (Patient or Doctor)
2. Enters email and password
3. Clicks "Login"
4. AuthContext validates credentials against Firebase Auth
5. Checks user role in Firebase Database (/users/{uid} or /doctors/{uid})
6. Stores role in localStorage (role_{uid})
7. Redirects:
   - Patient → Home page (/)
   - Doctor → Doctor Dashboard (/doctor-dashboard)
```

**Firebase Setup**:
- Authentication: Email/Password enabled
- OAuth: Google Sign-In configured
- Database Rules: Allow read/write for authenticated users

---

### Step 2️⃣: Signup Page (`SignupPage.jsx`)

**URL**: `/signup`

**Features**:
- Create account as Patient or Doctor
- Email verification (optional)
- Password strength validation
- Terms & conditions acceptance
- Redirect to login after signup

**Process**:
```javascript
1. User fills signup form:
   - Email
   - Password (min 6 characters)
   - Display name
   - Role selection
2. Clicks "Create Account"
3. AuthContext creates Firebase Auth user
4. Stores role in Firebase Database:
   - Patient: /users/{uid} = { role: "patient", ... }
   - Doctor: /doctors/{uid} = { role: "doctor", ... }
5. Redirects to login page with success message
```

**Doctor Signup Page** (`DoctorSignupPage.jsx`):

**URL**: `/doctor-signup`

**Additional Fields**:
- Full Name (Doctor name)
- Specialization (Pulmonology, Ophthalmology, etc.)
- Hospital/Clinic name
- Location
- Years of experience
- Availability
- Contact number
- License number (optional)
- Bio/Description

**Process**:
```javascript
1. Fill all doctor profile fields
2. Uploads to Firebase Database:
   /doctors/{uid} = {
     doctorId: uid,
     role: "doctor",
     fullName: "Dr. Name",
     specialization: "Pulmonology",
     hospitalName: "Hospital Name",
     location: "City, State",
     yearsOfExperience: 10,
     availability: "9AM-5PM",
     phone: "1234567890",
     bio: "Bio text"
   }
3. Doctor account activated and ready to accept appointments
```

---

## Patient Workflow

### Step 3️⃣: Home Page (`HomePage.jsx`)

**URL**: `/`

**Features**:
- Hero section with project overview
- Feature highlights:
  - Multi-Model Detection (X-ray + Retina)
  - Disease identification
  - 24/7 availability
- Links to upload analysis
- Sample images
- Disease categories
- Statistics

**CTA Buttons**:
- "Upload & Predict" → `/upload`
- "View Results" → `/result`

---

### Step 4️⃣: Choose Analysis Pathway (`UploadPage.jsx`)

**URL**: `/upload`

**Two Options**:

#### Option A: Chest X-ray Analysis
**Route**: `/upload/chest`
**Specialization**: Pulmonology

#### Option B: Eye Disease Analysis
**Route**: `/upload/eye`
**Specialization**: Ophthalmology

---

### Step 5️⃣: Chest X-ray Analysis (`ChestXrayAnalysisPage.jsx`)

**URL**: `/upload/chest`

**Process**:

```
1. Upload X-ray Image
   ├─ Accepts: PNG, JPG, JPEG, TIFF
   ├─ Max size: 25MB
   └─ Shows preview

2. Click "Start Analysis"
   ├─ Sends image to Flask backend
   ├─ Backend loads medical_model.keras
   ├─ Runs inference (prediction)
   └─ Returns prediction + confidence

3. Analysis Results Include:
   ├─ Predicted disease (Normal, Pneumonia, Tuberculosis)
   ├─ Confidence percentage (0-100%)
   ├─ Top predictions list
   ├─ GradCAM visualization (attention map)
   └─ Timestamp
```

**Diseases Detected (X-ray)**:
- ✅ **Normal**: No significant thoracic abnormality
- 🫁 **Pneumonia**: Infectious lung opacity pattern
- 🫀 **Tuberculosis**: TB-related pulmonary changes

---

### Step 6️⃣: Eye Disease Analysis (`EyeAnalysisPage.jsx`)

**URL**: `/upload/eye`

**Process**: Same as chest X-ray but with retina fundus images

**Diseases Detected (Retina)**:
- ✅ **Normal Retina**: Healthy retinal structure
- 👁️ **Age-Related Macular Degeneration (AMD)**: Degenerative macular disease
- ☀️ **Cataract**: Lens opacity patterns
- 🩸 **Diabetic Retinopathy**: Diabetes-related vascular lesions
- 👓 **Myopia**: Myopic retinal changes
- 🌊 **Retinal Vein Occlusion (RVO)**: Venous blockage indicators

---

### Step 7️⃣: Scanning Report Page (`ScanningReportPage.jsx`)

**URL**: `/scan-report` or `/scanning-report`

**Features**:
- Displays uploaded image
- Shows AI prediction results
- Displays top predictions with probabilities
- Shows GradCAM visualization (heatmap showing AI attention)
- **"Generate Scanning Report"** button - creates detailed PDF report
- **"Find Doctor"** button - recommends doctors

**Report Generation**:
```javascript
// Scanning Report includes:
{
  patientInfo: {
    name: "Patient Name",
    email: "patient@email.com"
  },
  analysis: {
    modality: "chest-xray" or "retina-fundus",
    uploadedAt: "2026-04-17T10:30:00Z",
    predictedDisease: "Pneumonia",
    confidence: 87.5,
    topPredictions: [
      { label: "Pneumonia", confidence: 87.5 },
      { label: "Tuberculosis", confidence: 8.2 },
      { label: "Normal", confidence: 4.3 }
    ]
  },
  uploadedImage: "base64 encoded image",
  gradcam: "base64 encoded heatmap",
  report: "Detailed medical findings text"
}

// Stored in:
// - localStorage (client-side)
// - sessionStorage (current session)
```

---

### Step 8️⃣: Results Page (`ResultPage.jsx`)

**URL**: `/result`

**Displays**:
- Predicted disease name
- Confidence percentage (visual bar)
- Modality (X-ray or Retina)
- Top predictions (class probabilities)
- Uploaded image preview
- GradCAM visualization
- Report generation status
- Timestamps

**Actions**:
- "Generate Scanning Report" → `/scan-report`
- "Find Doctor" → `/doctor-details` (with prediction state)
- "Clear Results" → Remove prediction and start over

---

### Step 9️⃣: Doctor Details Page (`DoctorDetailsPage.jsx`)

**URL**: `/doctor-details`

**Features**:
- Displays prediction info
- Doctor summary (name, specialization, clinic)
- "Request Appointment" button

---

### Step 1️⃣0️⃣: Doctor Recommendation Page (`DoctorRecommendationPage.jsx`)

**URL**: `/doctor-recommendation`

**Process**:

```
1. Load Doctors from Firebase
   └─ All registered doctors in /doctors node
   
2. Match Doctors to Prediction
   ├─ Matching logic:
   │  ├─ Specialization matches disease
   │  └─ Hospital location + experience scored
   └─ Ranked by match score (highest first)

3. Display Doctor Cards
   ├─ Doctor name, specialization, clinic
   ├─ Location, experience, availability
   ├─ Bio/Description
   └─ "Book Appointment" button

4. Book Appointment Modal Opens
   ├─ Patient fills form:
   │  ├─ Name (pre-filled)
   │  ├─ Age
   │  ├─ Gender
   │  ├─ Contact number
   │  ├─ Disease (pre-filled from prediction)
   │  └─ Scanning Report (FILE UPLOAD - MANDATORY)
   │
   └─ Submit appointment request
```

**Appointment Submission** (`handleAppointmentSubmit`):

```javascript
// Step 1: Upload scanning report to Firebase Storage
  Upload path: scanning-reports/{patientUid}/{appointmentId}/{filename}
  
// Step 2: Get download URL
  Store in: appointment.scanningReportUrl
  
// Step 3: Save appointment to Realtime Database
  Path: appointments/{appointmentId}
  
  Data saved:
  {
    doctorId: "doctor_uid",
    doctorName: "Dr. Name",
    doctorSpecialization: "Pulmonology",
    hospital: "Hospital Name",
    location: "Location",
    
    patientId: "patient_uid",          // Multiple ID variants
    patientUid: "patient_uid",         // for compatibility
    userId: "patient_uid",
    uid: "patient_uid",
    
    patientEmail: "patient@email.com", // Email variants
    email: "patient@email.com",
    
    patientName: "Patient Name",
    age: 25,
    gender: "Male",
    phone: "1234567890",
    disease: "Pneumonia",
    diseaseName: "Pneumonia",
    modality: "xray",
    
    scanningReportUrl: "https://...",  // Report file URL
    retinaReportUrl: "https://...",    // Backup field for compatibility
    
    status: "pending",                 // Waiting for doctor response
    requestTime: "2026-04-17T10:30Z",
    createdAt: "2026-04-17T10:30Z"
  }

// Step 4: Show success message
  Alert: "Appointment request submitted successfully!"
```

**File Upload Features**:
- ✅ File size limit: 5MB (enforced)
- ✅ Retry logic: Up to 2 automatic retries on failure
- ✅ Progress tracking: Shows upload percentage (10% → 50% → 75% → 95% → 100%)
- ✅ Error handling: Clear error messages with specific reasons
- ✅ Format support: PDF, DOC, DOCX, JPG, JPEG, PNG

---

### Step 1️⃣1️⃣: Patient Appointments Page (`PatientAppointmentsPage.jsx`)

**URL**: `/my-appointments`

**Features**:
- Table of all patient's appointments
- Real-time updates from Firebase
- Status display: pending/accepted/rejected
- Appointment details:
  - Patient name, age, gender, contact
  - Disease/prediction result
  - Scanning report link (clickable)
  - Checkup date & time (when scheduled)
  - Doctor message
  - NEW badge for unread notifications

**Columns**:
| Column | Data | Status |
|--------|------|--------|
| Patient Name | patientName | - |
| Age | age | - |
| Gender | gender | - |
| Contact Number | phone/contactNumber | - |
| Disease | disease/diseaseName | - |
| Scanning Report | scanningReportUrl link | View Report |
| Status | status | pending/accepted/rejected |
| Checkup Date & Time | checkupDateTime (formatted) | Scheduled date |
| Doctor Message | patientNotification | Message text |

**Status Colors**:
- 🟡 **pending**: Yellow badge - Waiting for doctor
- 🟢 **accepted**: Green badge - Doctor accepted, checkup scheduled
- 🔴 **rejected**: Red badge - Doctor rejected

**Notifications**:
- NEW badge appears when doctor accepts with patientNotificationSeen: false
- "Mark all as read" button removes NEW badges
- Doctor message shows in last column

---

## Doctor Workflow

### Doctor Dashboard (`DoctorAppointmentsDashboard.jsx`)

**URL**: `/doctor-dashboard` (after doctor login)

**Features**:

#### 1. Welcome Header
```javascript
Display: "Welcome, Dr. {fullName}"
Subtitle: Doctor's specialization
Logout button
```

#### 2. Statistics Cards
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Total      │  │   Pending    │  │  Accepted    │  │  Rejected    │
│  Requests    │  │ Appointments │  │ Appointments │  │ Appointments │
│  Count: X    │  │  Count: X    │  │  Count: X    │  │  Count: X    │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

#### 3. Profile Summary
```javascript
// Displays doctor's profile
Clinic: "Hospital Name"
Location: "City, State"
Experience: "X years"
Availability: "9AM-5PM"
```

#### 4. Appointment Request Cards
```javascript
// For each appointment:
┌────────────────────────────────────────┐
│ Patient Name          [PENDING STATUS] │
│ patient@email.com                      │
│                                        │
│ Disease: Pneumonia                     │
│ Phone: 1234567890                      │
│ Age: 25 | Gender: Male                 │
│ Scanning Report: [View Report] (Link)  │
│                                        │
│ [Accept & Schedule] [Reject]           │
└────────────────────────────────────────┘
```

**Actions**:
- **Accept & Schedule**: Opens `/doctor-dashboard/appointment/{appointmentId}`
- **Reject**: Immediately rejects with notification sent to patient

---

### Doctor Appointment Review Page (`DoctorAppointmentReviewPage.jsx`)

**URL**: `/doctor-dashboard/appointment/{appointmentId}`

**Process**:

#### 1. Load Appointment Details
```javascript
// Fetch from Firebase:
appointments/{appointmentId}

// Validate:
- Appointment exists
- Current user (doctor) is the recipient
- Show full patient details
```

#### 2. Display Patient Information
```javascript
Full patient details displayed:
- Name, Age, Gender, Contact
- Disease/Prediction result
- Scanning Report (clickable link)
```

#### 3. Accept Appointment Form
```javascript
Required inputs:
├─ Checkup Date & Time (date/time picker)
└─ Doctor Message (textarea - optional)

If no message provided:
  Auto-message: "Doctor accepted your request. 
                Checkup is scheduled on [date and time]."
```

#### 4. Submit Acceptance
```javascript
// Update appointment in Firebase:
appointments/{appointmentId} updates:
{
  status: "accepted",                    // Changed from "pending"
  checkupDateTime: "2026-04-20T10:30Z",  // ISO format
  doctorMessage: "Message from doctor",  // Doctor's optional message
  patientNotification: "...",            // Patient sees this
  patientNotificationSeen: false,        // NEW badge triggers
  acceptedAt: "2026-04-17T10:45Z",       // Timestamp
  respondedAt: "2026-04-17T10:45Z"       // Timestamp
}

// Redirect to: /doctor-dashboard
```

---

### Reject Appointment

**From Dashboard**:
```javascript
Doctor clicks "Reject" button
  ↓
Confirms action
  ↓
Updates Firebase:
{
  status: "rejected",
  patientNotification: "Your appointment request was rejected by doctor.",
  patientNotificationSeen: false,
  respondedAt: "2026-04-17T10:45Z"
}
  ↓
Patient sees notification on My Appointments page
```

---

## Appointment System

### Complete Appointment Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: PATIENT SUBMITS APPOINTMENT                         │
├─────────────────────────────────────────────────────────────┤
│ • Fills form with: name, age, gender, contact, disease     │
│ • Uploads scanning report (mandatory, max 5MB)              │
│ • Clicks "Submit Appointment Request"                       │
│                                                              │
│ Firebase Entry Created:                                      │
│ status: "pending"                                            │
│ scanningReportUrl: "https://..."                            │
│ Notification: None (appointment pending)                    │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: DOCTOR VIEWS APPOINTMENT                            │
├─────────────────────────────────────────────────────────────┤
│ • Opens Doctor Dashboard                                     │
│ • Sees appointment in pending queue                         │
│ • Can view:                                                  │
│   - Patient details (name, age, gender, contact)            │
│   - Disease/Prediction result                               │
│   - Scanning report (clickable to view)                      │
│ • Clicks "Accept & Schedule"                                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: DOCTOR SCHEDULES APPOINTMENT                        │
├─────────────────────────────────────────────────────────────┤
│ • Selects checkup date and time                             │
│ • Optionally enters doctor message                          │
│ • Clicks "Accept Appointment"                               │
│                                                              │
│ Firebase Updated:                                            │
│ status: "accepted"                                           │
│ checkupDateTime: "2026-04-20T10:30Z"                        │
│ doctorMessage: "See you tomorrow at 10:30 AM"               │
│ patientNotificationSeen: false (NEW badge)                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: PATIENT SEES APPOINTMENT UPDATE                     │
├─────────────────────────────────────────────────────────────┤
│ • Refreshes "My Appointments" page                          │
│ • Sees appointment status: "ACCEPTED" (green badge)         │
│ • Sees checkup date & time: "Apr 20, 2026, 10:30 AM"       │
│ • Sees doctor message with NEW badge (red)                  │
│ • Can view scanning report link                             │
│ • Can click "Mark all as read" to remove NEW badge          │
└─────────────────────────────────────────────────────────────┘
```

### Status Tracking

**Patient Perspective**:

| Status | Meaning | Display | Color |
|--------|---------|---------|-------|
| pending | Waiting for doctor | Requesting... | Yellow |
| accepted | Appointment confirmed | Scheduled ✓ | Green |
| rejected | Doctor declined | Rejected ✗ | Red |

**Doctor Perspective**:

| Status | Action | Next Step |
|--------|--------|-----------|
| pending | Review patient + report | Accept or Reject |
| accepted | Appointment confirmed | Manage in schedule |
| rejected | Request declined | Closed |

---

## Backend API

### Flask Prediction Server (`app.py`)

**Base URL**: `http://localhost:5000`

#### Endpoint: `POST /predict`

**Request**:
```javascript
Content-Type: multipart/form-data

Body:
├─ image: <binary file>     // X-ray or Retina image
└─ modality: "xray" or "retina"
```

**Process**:
```
1. Receive image
2. Preprocess:
   ├─ Resize to 224x224 pixels
   ├─ Normalize pixel values
   └─ Convert to tensor
3. Load appropriate model:
   ├─ If modality="xray": medical_model.keras
   └─ If modality="retina": EfficientNetB0_ODIR_OfflineAug.h5
4. Run inference
5. Get predictions:
   ├─ Top class prediction
   ├─ Confidence score (0-100%)
   └─ Class probabilities for all diseases
6. Generate GradCAM visualization (attention map)
7. Return results
```

**Response**:
```json
{
  "prediction": "Pneumonia",
  "confidence_percent": 87.5,
  "top_predictions": [
    { "label": "Pneumonia", "confidence": 87.5 },
    { "label": "Tuberculosis", "confidence": 8.2 },
    { "label": "Normal", "confidence": 4.3 }
  ],
  "gradcam": "base64_encoded_image",
  "modality": "xray"
}
```

**Models Loaded**:
- **Chest X-ray**: `medical_model.keras` (TensorFlow Keras format)
- **Retina Fundus**: `EfficientNetB0_ODIR_OfflineAug.h5` (HDF5 format)

**Class Labels**:
- **X-ray** (`labels.json`): Normal, Pneumonia, Tuberculosis
- **Retina** (`retina_labels.json`): Normal, AMD, Cataract, Diabetic Retinopathy, Myopia, RVO

---

### RAG Engine (`rag_engine.py`)

**Purpose**: Matches doctors to patient predictions using embeddings and similarity search

**Features**:
- Doctor profile embeddings
- Disease-doctor matching
- Specialization scoring
- Hospital location relevance

---

## Database Structure

### Firebase Realtime Database

```
root/
├── users/                          # Patient user data
│   └── {patientUid}/
│       ├── email: "patient@email.com"
│       ├── displayName: "Patient Name"
│       ├── role: "patient"
│       └── createdAt: timestamp
│
├── doctors/                        # Doctor profiles
│   └── {doctorUid}/
│       ├── doctorId: "doctor_uid"
│       ├── email: "doctor@email.com"
│       ├── fullName: "Dr. Name"
│       ├── specialization: "Pulmonology"
│       ├── hospitalName: "Hospital XYZ"
│       ├── location: "City, State"
│       ├── yearsOfExperience: 10
│       ├── availability: "9AM-5PM"
│       ├── phone: "1234567890"
│       ├── bio: "Bio text"
│       ├── role: "doctor"
│       └── createdAt: timestamp
│
└── appointments/                   # All appointment records
    └── {appointmentId}/
        ├── doctorId: "doctor_uid"
        ├── doctorName: "Dr. Name"
        ├── doctorSpecialization: "Pulmonology"
        ├── hospital: "Hospital Name"
        ├── hospitalName: "Hospital Name"
        ├── location: "City, State"
        │
        ├── patientId: "patient_uid"        # ID variants
        ├── patientUid: "patient_uid"       # for redundancy
        ├── userId: "patient_uid"
        ├── uid: "patient_uid"
        │
        ├── patientEmail: "patient@email.com"  # Email variants
        ├── email: "patient@email.com"
        │
        ├── patientName: "Patient Name"
        ├── age: 25
        ├── gender: "Male"
        ├── phone: "1234567890"
        ├── contactNumber: "1234567890"
        │
        ├── disease: "Pneumonia"
        ├── diseaseName: "Pneumonia"
        ├── modality: "xray"
        │
        ├── scanningReportUrl: "https://..."
        ├── retinaReportUrl: "https://..."   # Backup field
        │
        ├── status: "pending"                # pending/accepted/rejected
        ├── requestTime: "2026-04-17T10:30Z"
        ├── createdAt: "2026-04-17T10:30Z"
        ├── acceptedAt: "2026-04-17T10:45Z"  # When doctor accepts
        ├── respondedAt: "2026-04-17T10:45Z" # When doctor responds
        │
        ├── checkupDateTime: "2026-04-20T10:30Z"  # Scheduled time
        ├── doctorMessage: "Doctor's message"
        ├── patientNotification: "Message for patient"
        ├── patientNotificationSeen: false   # NEW badge indicator
        └── notificationReadAt: "..."        # When patient marks read
```

### Firebase Cloud Storage

```
scanning-reports/
└── {patientUid}/
    └── {appointmentId}/
        └── {filename}           # Uploaded medical report/image
```

---

## Technology Stack

### Frontend
- **Framework**: React 18
- **Routing**: React Router v6
- **State Management**: React Hooks (useState, useContext, useMemo)
- **Authentication**: Firebase Authentication
- **Database**: Firebase Realtime Database
- **File Storage**: Firebase Cloud Storage
- **Icons**: FontAwesome, React Icons
- **CSS**: Bootstrap + Custom CSS
- **HTTP Client**: Fetch API

### Backend
- **Framework**: Flask (Python)
- **ML Framework**: TensorFlow/Keras
- **CORS**: Flask-CORS
- **Image Processing**: PIL/Pillow
- **Numerical Computing**: NumPy
- **RAG**: Chroma + LangChain (for doctor matching)

### Infrastructure
- **Backend Server**: Python Flask (localhost:5000)
- **Database**: Firebase Realtime Database
- **File Storage**: Firebase Cloud Storage
- **Authentication**: Firebase Auth
- **Models**: TensorFlow Keras format (.keras, .h5)

### Key Libraries
```
Frontend (package.json):
- react, react-dom
- react-router-dom
- firebase
- react-icons
- bootstrap (optional)
- axios/fetch

Backend (requirements.txt):
- flask
- flask-cors
- tensorflow
- pillow
- numpy
- chromadb (RAG)
- langchain (RAG)
```

---

## Key Features Summary

### 🔐 Authentication
- Email/Password login & signup
- Google OAuth sign-in
- Role-based access (Patient/Doctor)
- Password reset
- Session persistence

### 🏥 AI Diagnosis
- Real-time image analysis
- Two modalities: Chest X-ray + Retina fundus
- Confidence scoring
- Top predictions display
- Visual heatmaps (GradCAM)

### 👨‍⚕️ Doctor Recommendation
- AI-powered matching
- Specialty-based filtering
- Experience scoring
- Location relevance
- Ranked results

### 📅 Appointment System
- Secure booking with scanning reports
- Real-time status tracking
- Doctor scheduling
- Patient notifications
- Message delivery

### 👥 Multi-role Dashboard
- **Patient**: Upload analysis, find doctors, book appointments, track status
- **Doctor**: Review requests, schedule appointments, manage calendar

---

## User Journey Visual Flow

```
┌─────────┐
│  Start  │
└────┬────┘
     │
     ▼
┌──────────────┐
│ Not logged?  │  ├─→ Sign Up → Doctor Profile → Login
│ Login/Signup │  │
└────┬─────────┘  └─→ Login → Home Page
     │
     ▼
┌──────────────────┐
│ PATIENT PATH     │
├──────────────────┤
│ 1. Home Page     │
│ 2. Choose        │
│    Analysis Type │
│    (X-ray/Eye)   │
│ 3. Upload Image  │
│ 4. AI Analysis   │
│ 5. Results       │
│ 6. Generate      │
│    Report        │
│ 7. Find Doctor   │
│ 8. Book          │
│    Appointment   │
│ 9. Track Status  │
│10. See Updates   │
│    (When Doctor  │
│     Accepts)     │
└──────────────────┘

     VS

┌──────────────────┐
│ DOCTOR PATH      │
├──────────────────┤
│ 1. Doctor        │
│    Dashboard     │
│ 2. View Pending  │
│    Requests      │
│ 3. Review Patient│
│    + Report      │
│ 4. Accept/       │
│    Reject        │
│ 5. Schedule      │
│    Checkup       │
│ 6. Send Message  │
│ 7. Manage        │
│    Appointments  │
└──────────────────┘
```

---

## Configuration

### Environment Variables

**Frontend** (`.env`):
```
REACT_APP_API_ENDPOINT=http://localhost:5000/predict
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_PROJECT_ID=healthcare-assistant-app-3c14a
```

**Backend** (`.env` or `app.py`):
```
XRAY_MODEL_FILENAME=medical_model.keras
RETINA_MODEL_FILENAME=EfficientNetB0_ODIR_OfflineAug.h5
DEFAULT_IMAGE_SIZE=224
PREPROCESS_MODE=auto
SCALE_INPUT=true
```

---

## Deployment Checklist

✅ Backend Flask server running (http://localhost:5000)  
✅ Firebase project configured  
✅ ML models placed in `backend/model/` directory  
✅ CORS enabled for frontend URLs  
✅ Database rules configured in Firebase  
✅ Storage bucket created and accessible  
✅ Environment variables set  
✅ Frontend builds without errors  

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot reach prediction server" | Ensure Flask backend is running on port 5000 |
| "Firebase permission denied" | Check database rules in Firebase Console |
| "Model not found" | Place model files in `backend/model/` directory |
| "Upload timeout" | Check internet connection; retry upload |
| "Doctor not found" | Ensure doctor profile is complete in Firebase |
| "Appointment not saved" | Check Firebase database permissions |

---

## Future Enhancements

📌 Real-time notifications (WebSocket)  
📌 Video consultation scheduling  
📌 Prescription management  
📌 Medical history tracking  
📌 Payment integration  
📌 Multi-language support  
📌 Mobile app version  
📌 Advanced analytics dashboard  
📌 Email notifications  
📌 Appointment reminders  

---

**Version**: 1.0  
**Last Updated**: April 17, 2026  
**Status**: Production Ready ✅
