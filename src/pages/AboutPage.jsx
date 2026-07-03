const milestones = [
  {
    year: "2021",
    title: "Research roots",
    copy: "Clinical researchers partnered with ML engineers to prototype explainable imaging diagnostics.",
  },
  {
    year: "2023",
    title: "Pilot deployments",
    copy: "Deployed within three regional hospitals with on-prem inference clusters for radiology teams.",
  },
  {
    year: "2025",
    title: "Global scalability",
    copy: "Expanded to support multi-modal studies, structured reporting, and enterprise governance controls.",
  },
];

const pillars = [
  {
    icon: "fa-shield-halved",
    title: "Safety",
    copy: "We follow stringent QA gates, clinical review, and red teaming for every release cycle.",
  },
  {
    icon: "fa-people-group",
    title: "Collaboration",
    copy: "Design alongside care teams to ensure every workflow mirrors real exam room decisions.",
  },
  {
    icon: "fa-arrows-rotate",
    title: "Adaptability",
    copy: "Modular architecture supports on-prem, hybrid, or multi-cloud deployments without refactors.",
  },
];

export default function AboutPage() {
  return (
    <main>
      <section className="about-hero py-5">
        <div className="container py-4">
          <div className="row align-items-center g-5">
            <div className="col-lg-6">
              <div className="hero-badge text-uppercase mb-3">Our Mission</div>
              <h1 className="fw-bold mb-4">Responsible AI copilots for every radiology department</h1>
              <p className="lead text-white-50">
                IntelliHealth blends human-in-the-loop guardrails with transparent, auditable AI pipelines so clinicians can trust every recommendation.
              </p>
            </div>
            <div className="col-lg-5 offset-lg-1">
              <div className="glass-card">
                <p className="fw-semibold text-uppercase text-muted mb-2">Impact snapshots</p>
                <ul className="list-unstyled mb-0">
                  <li className="mb-3">
                    <span className="d-block h4 mb-0">48%</span>
                    Reduction in manual triage time
                  </li>
                  <li className="mb-3">
                    <span className="d-block h4 mb-0">30+</span>
                    Imaging modalities validated with QA datasets
                  </li>
                  <li>
                    <span className="d-block h4 mb-0">12</span>
                    Countries deploying localized bundles
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container">
          <div className="row g-4">
            {pillars.map((pillar) => (
              <div className="col-md-4" key={pillar.title}>
                <div className="about-card h-100">
                  <div className="icon-wrapper">
                    <i className={`fa-solid ${pillar.icon}`} />
                  </div>
                  <h5>{pillar.title}</h5>
                  <p>{pillar.copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-soft">
        <div className="container">
          <div className="row g-5 align-items-start">
            <div className="col-lg-6">
              <span className="eyebrow">Milestones</span>
              <h2 className="mb-4">Designing for accountability since day one</h2>
              <ul className="timeline-list">
                {milestones.map((item) => (
                  <li key={item.year}>
                    <span>{item.year}</span>
                    <h6 className="mb-1">{item.title}</h6>
                    <p className="text-muted mb-0">{item.copy}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="col-lg-6">
              <div className="about-card h-100">
                <h4 className="mb-3">Interdisciplinary team</h4>
                <p className="text-muted">
                  Our collective spans radiologists, data scientists, systems engineers, privacy lawyers, and implementation specialists working as one pod.
                </p>
                <ul className="list-unstyled d-flex flex-column gap-3 mb-0">
                  <li>
                    <i className="fa-solid fa-user-doctor me-2 text-primary" /> Clinical safety board reviews every model update.
                  </li>
                  <li>
                    <i className="fa-solid fa-network-wired me-2 text-primary" /> Observability dashboards surface drift, latency, and utilization in real time.
                  </li>
                  <li>
                    <i className="fa-solid fa-scale-balanced me-2 text-primary" /> Policy team ensures compliance with HIPAA, GDPR, and regional guidelines.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
