const API_URL = "https://offlineform.onrender.com/candidates";

document.getElementById("candidateForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const titleValue = document.getElementById("title").value;

  const candidate = {
    fullName: document.getElementById("fullName").value,
    email: document.getElementById("email").value,
    phone: document.getElementById("phone").value,
    dob: document.getElementById("date").value,
    gender: document.querySelector('input[name="gender"]:checked')?.value,
    state: document.getElementById("state").value,
    city: document.getElementById("city").value,
    aadhaar: document.getElementById("aadhaar").value,
    bankAccount: document.getElementById("bankAccount").value,
    title: {
      id: Number(titleValue)
    }
  };

  // If ONLINE → send to server
  if (navigator.onLine) {
    sendToServer(candidate);
  } 
  // If OFFLINE → save locally
  else {
    saveOffline(candidate);
    showStatus("Saved offline. Will sync when internet is back.", "orange");
  }
});

/* ---------------- FUNCTIONS ---------------- */

function sendToServer(candidate) {
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(candidate)
  })
    .then(res => {
      if (!res.ok) throw new Error("Server error");
      return res.json();
    })
    .then(() => {
      showStatus("Saved successfully ✅", "green");
      document.getElementById("candidateForm").reset();
    })
    .catch(() => {
      saveOffline(candidate);
      showStatus("Saved offline (server unreachable)", "orange");
    });
}

function saveOffline(candidate) {
  let offlineData = JSON.parse(localStorage.getItem("offlineCandidates")) || [];
  offlineData.push(candidate);
  localStorage.setItem("offlineCandidates", JSON.stringify(offlineData));
}

function syncOfflineData() {
  let offlineData = JSON.parse(localStorage.getItem("offlineCandidates")) || [];
  if (offlineData.length === 0) return;

  offlineData.forEach(candidate => {
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate)
    })
    .then(res => {
      if (!res.ok) throw new Error();
    });
  });

  localStorage.removeItem("offlineCandidates");
  showStatus("Offline data synced successfully 🔄", "green");
}

function showStatus(message, color) {
  const status = document.getElementById("status");
  status.innerText = message;
  status.style.color = color;
}

/* Sync when internet comes back */
window.addEventListener("online", syncOfflineData);
