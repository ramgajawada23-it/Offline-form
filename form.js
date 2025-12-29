const form = document.getElementById("candidateForm");

const fullName = document.querySelector('input[name="fullName"]');
const email = document.querySelector('input[name="email"]');
const phone = document.querySelector('input[name="phone"]');
const date = document.querySelector('input[name="dob"]');
const state = document.querySelector('select[name="state"]');
const city = document.querySelector('input[name="city"]');
const aadhaar = document.querySelector('input[name="aadhaar"]');
const bankAccount = document.querySelector('input[name="bankAccount"]');
const title = document.getElementById("title");

document.addEventListener("DOMContentLoaded", restoreForm);

form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const candidate = {
    fullName: fullName.value,
    email: email.value,
    phone: phone.value,
    dob: date.value,
    gender: document.querySelector('input[name="gender"]:checked')?.value,
    state: state.value,
    city: city.value,
    aadhaar: aadhaar.value,
    bankAccount: bankAccount.value,
    title: { id: Number(title.value) }
  };

  saveFormLocally(candidate);

  if (!navigator.onLine) {
    await saveOffline(candidate);
    alert("Form submitted. No internet");
    return;
  }

  sendToServer(candidate);
});

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

  fullName.value = d.fullName || "";
  email.value = d.email || "";
  phone.value = d.phone || "";
  date.value = d.dob || "";
  state.value = d.state || "";
  city.value = d.city || "";
  aadhaar.value = d.aadhaar || "";
  bankAccount.value = d.bankAccount || "";
  title.value = d.title?.id || "";

  if (d.gender) {
    document.querySelector(
      `input[name="gender"][value="${d.gender}"]`
    ).checked = true;
  }
}

function clearForm() {
  form.reset();
}
