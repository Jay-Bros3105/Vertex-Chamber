document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("status");

  try {
    const data = await apiRequest("/health");
    statusEl.innerText = "✅ " + data.message;
  } catch (error) {
    statusEl.innerText = "❌ Backend not reachable";
    console.error(error);
  }
});
