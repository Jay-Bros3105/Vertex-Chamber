const API_BASE_URL = "http://localhost:5000/api/v1";

async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "API error");
    }

    return data;
  } catch (error) {
    console.error("API Request Failed:", error);
    throw error;
  }
}
