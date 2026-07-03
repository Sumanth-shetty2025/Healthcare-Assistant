export async function sendEmailNotification({
  idToken,
  to,
  subject,
  text,
  html,
  apiBaseUrl,
}) {
  const baseUrl =
    apiBaseUrl || process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";

  if (!idToken || !to || !subject) return;

  try {
    await fetch(`${baseUrl}/api/notifications/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        to,
        subject,
        text: text || "",
        html: html || "",
      }),
    });
  } catch (e) {
    // Email is best-effort; ignore failures in UI.
  }
}
