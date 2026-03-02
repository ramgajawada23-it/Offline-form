// Login.js
function showToast(message, type = "online") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "online" ? "●" : "○";
  toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  // Wait 10ms for DOM registration before showing
  setTimeout(() => toast.classList.add("show"), 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

window.addEventListener("online", () => showToast("Connected", "online"));
window.addEventListener("offline", () => showToast("Working Offline", "offline"));

// Initial check
if (!navigator.onLine) {
  setTimeout(() => showToast("Working Offline", "offline"), 1000);
}

document.getElementById("loginForm").onsubmit = async (e) => {
  e.preventDefault();

  const mobile = document.getElementById("loginMobile").value.trim();
  const error = document.querySelector(".error-text");

  if (!/^\d{10}$/.test(mobile)) {
    error.innerText = "Enter valid 10-digit mobile number";
    return;
  }

  error.innerText = "";

  const API_BASE = "https://offlineform.onrender.com";

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile })
    });

    if (!res.ok) throw new Error("API error");

    const data = await res.json();

    sessionStorage.setItem("loggedInMobile", mobile);

    if (data.status === "DRAFT") {
      sessionStorage.setItem("serverDraft", JSON.stringify(data.draft));
      sessionStorage.setItem("formStatus", "DRAFT");
    } else if (data.status === "SUBMITTED") {
      sessionStorage.removeItem("serverDraft");
      sessionStorage.setItem("formStatus", "SUBMITTED");
    } else {
      sessionStorage.removeItem("serverDraft");
      sessionStorage.setItem("formStatus", "NEW");
    }

    window.location.href = "./index.html";

  } catch (err) {
    console.warn("Backend not ready, continuing frontend flow");

    // ✅ fallback so frontend still works
    sessionStorage.setItem("loggedInMobile", mobile);
    sessionStorage.setItem("formStatus", "NEW");
    window.location.href = "./index.html";
  }
};