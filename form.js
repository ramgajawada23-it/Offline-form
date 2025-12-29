document.addEventListener("DOMContentLoaded", () => {
  restoreForm();

  document.getElementById("candidateForm").addEventListener("submit", submitForm);
});

async function submitForm(e) {
  e.preventDefault();

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
    title: { id: Number(document.getElementById("title").value) }
  };

  saveFormLocally(candidate);

  if (!navigator.onLine) {
    await saveOffline(candidate);
    alert("Form submitted. No internet");
    return;
  }

  sendToServer(candidate);
}

function sendToServer(candidate) {
  fetch("https://offlineform.onrender.com/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(candidate)
  })
    .then(() => {
      alert("Saved successfully");
      localStorage.removeItem("draft");
      clearForm();
    })
    .catch(async () => {
      await saveOffline(candidate);
      alert("Saved offline");
    });
}

window.addEventListener("online", async () => {
  const offlineData = await getOfflineData();

  for (const data of offlineData) {
    await fetch("https://offlineform.onrender.com/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }

  await clearOfflineData();
  alert("Internet back. Offline data synced!");
});

function saveFormLocally(data) {
  localStorage.setItem("draft", JSON.stringify(data));
}

function restoreForm() {
  const draft = localStorage.getItem("draft");
  if (!draft) return;

  const d = JSON.parse(draft);

  document.getElementById("fullName").value = d.fullName || "";
  document.getElementById("email").value = d.email || "";
  document.getElementById("phone").value = d.phone || "";
  document.getElementById("date").value = d.dob || "";
  document.getElementById("state").value = d.state || "";
  document.getElementById("city").value = d.city || "";
  document.getElementById("aadhaar").value = d.aadhaar || "";
  document.getElementById("bankAccount").value = d.bankAccount || "";
  document.getElementById("title").value = d.title?.id || "";

  if (d.gender) {
    document.querySelector(
      `input[name="gender"][value="${d.gender}"]`
    ).checked = true;
  }
}

function clearForm() {
  document.getElementById("candidateForm").reset();
}
