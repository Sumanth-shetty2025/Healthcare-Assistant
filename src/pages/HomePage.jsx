import { Link } from "react-router-dom";
import { Container, Row, Col, Card, Button } from "react-bootstrap";

const features = [
  {
    id: 1,
    icon: "fa-x-ray",
    title: "Chest X-ray Detection",
    description: "Fast disease screening for Normal, Pneumonia, and Tuberculosis with a focused radiology workflow.",
    color: "#0f9bd7",
  },
  {
    id: 2,
    icon: "fa-brain",
    title: "Grad-CAM Explainability",
    description: "Visual heatmaps show the regions that contributed most to each prediction.",
    color: "#08c8b1",
  },
  {
    id: 3,
    icon: "fa-file-medical",
    title: "Report and Referral",
    description: "Generate a scanning report and move directly into specialist booking after analysis.",
    color: "#f59e0b",
  },
];

const stats = [
  { number: "1", label: "Image Modality" },
  { number: "3", label: "Detected Conditions" },
  { number: "24/7", label: "Available" },
];

const xrayDiseases = [
  {
    name: "Normal Chest X-Ray",
    icon: "fa-heart",
    desc: "No significant thoracic abnormality",
    color: "#28a745",
  },
  {
    name: "Pneumonia",
    icon: "fa-viruses",
    desc: "Infectious lung opacity pattern",
    color: "#dc3545",
  },
  {
    name: "Tuberculosis",
    icon: "fa-lungs",
    desc: "TB-related pulmonary changes",
    color: "#ffc107",
  },
];

const xraySamples = [
  { id: 1, src: "/assets/samples/Chest_Xray%201.webp", alt: "Sample chest X-ray image 1" },
  { id: 2, src: "/assets/samples/Chest_Xray%202.jpg", alt: "Sample chest X-ray image 2" },
  { id: 3, src: "/assets/samples/Chest_Xray%203.jpg", alt: "Sample chest X-ray image 3" },
];

export default function HomePage() {
  return (
    <main>
      <header className="hero-section text-center text-lg-start">
        <Container className="py-5">
          <Row className="align-items-center">
            <Col lg={6}>
              <div className="hero-content">
                <h1 className="hero-title">Intelligent Healthcare Assistant for Chest X-ray Disease Prediction</h1>
                <p className="hero-subtitle">
                  Harness AI to identify diseases from chest X-ray images with fast, reliable, model-driven predictions, Grad-CAM visualization, and clinical reporting.
                </p>
                <div className="hero-buttons d-flex flex-wrap gap-3 mt-4 justify-content-center justify-content-lg-start">
                  <Button as={Link} to="/upload" variant="primary" size="lg">
                    <i className="fa-solid fa-syringe me-2" />
                    Upload Chest X-ray Image
                  </Button>
                  <Button as={Link} to="/result" variant="outline-secondary" size="lg">
                    <i className="fa-solid fa-chart-line me-2" />
                    View Results
                  </Button>
                </div>
              </div>
            </Col>
            <Col lg={6} className="mt-5 mt-lg-0">
              <div className="hero-image-wrapper">
                <Card className="floating-stat-card mx-auto">
                  <Card.Body>
                    <div className="stat-icon">
                      <i className="fa-solid fa-microscope" />
                    </div>
                    <Card.Title className="stat-text mt-3">Advanced AI Analysis</Card.Title>
                    <Card.Text className="stat-number">Real-Time Results</Card.Text>
                  </Card.Body>
                </Card>
              </div>
            </Col>
          </Row>
        </Container>
      </header>

      <section className="stats-section bg-light">
        <Container className="py-5">
          <Row className="text-center">
            {stats.map((stat) => (
              <Col md={4} key={stat.label}>
                <div className="stat-card mb-4 mb-md-0">
                  <p className="stat-value">{stat.number}</p>
                  <p className="stat-name">{stat.label}</p>
                </div>
              </Col>
            ))}
          </Row>
        </Container>
      </section>

      <section className="features-section">
        <Container className="py-5">
          <div className="section-header text-center mb-5">
            <h2 className="section-title">Why Choose Our Platform?</h2>
            <p className="section-subtitle">Focused features for chest X-ray analysis and follow-up care</p>
          </div>
          <Row className="g-4">
            {features.map((feature) => (
              <Col md={6} lg={4} key={feature.id}>
                <Card className="feature-card h-100" style={{ "--card-color": feature.color }}>
                  <Card.Body>
                    <div className="feature-icon" style={{ backgroundColor: feature.color }}>
                      <i className={`fa-solid ${feature.icon}`} />
                    </div>
                    <Card.Title as="h5" className="feature-title">{feature.title}</Card.Title>
                    <Card.Text className="feature-description">{feature.description}</Card.Text>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        </Container>
      </section>

      <section className="samples-section bg-light">
        <Container className="py-5">
          <div className="section-header text-center mb-5">
            <h2 className="section-title">Sample Chest X-ray Images</h2>
            <p className="section-subtitle">Reference examples for the supported chest workflow</p>
          </div>
          <Row className="g-4">
            {xraySamples.map((sample) => (
              <Col md={6} lg={4} key={`xray-${sample.id}`}>
                <Card className="sample-image-card">
                  <Card.Img variant="top" src={sample.src} alt={sample.alt} />
                  <div className="sample-image-label">Sample X-Ray</div>
                </Card>
              </Col>
            ))}
          </Row>
        </Container>
      </section>

      <section className="diseases-section">
        <Container className="py-5">
          <div className="section-header text-center mb-5">
            <h2 className="section-title">Detectable Conditions</h2>
            <p className="section-subtitle">Our AI model can identify these conditions from chest X-ray images</p>
          </div>
          <Row className="g-4">
            {xrayDiseases.map((disease) => (
              <Col md={6} lg={4} key={disease.name}>
                <Card className="disease-card h-100" style={{ "--card-color": disease.color }}>
                  <Card.Body>
                    <div className="disease-icon">
                      <i className={`fa-solid ${disease.icon}`} />
                    </div>
                    <Card.Title as="h5" className="disease-name">{disease.name}</Card.Title>
                    <Card.Text className="disease-desc">{disease.desc}</Card.Text>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        </Container>
      </section>
    </main>
  );
}
