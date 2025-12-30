document.addEventListener("DOMContentLoaded", () => {
  restoreForm();

  document
    .getElementById("candidateForm")
    .addEventListener("submit", submitForm);
});

/* =========================
   SUBMIT FORM
========================= */
async function submitForm(e) {
  e.preventDefault();

  const candidate = {
    fullName: getValue("fullName"),
    email: getValue("email"),
    phone: getValue("phone"),
    dob: getValue("date"),
    gender: document.querySelector('input[name="gender"]:checked')?.value || "",
    state: getValue("state"),
    city: getValue("city"),
    aadhaar: getValue("aadhaar"),
    bankAccount: getValue("bankAccount"),
    title: { id: Number(getValue("title")) },

    // Family members
    familyMembers: getFamilyMembers()
  };

  saveFormLocally(candidate);

  if (!navigator.onLine) {
    await saveOffline(candidate);
    alert("Form saved offline (No Internet)");
    return;
  }

  sendToServer(candidate);
}

/* =========================
   SEND TO BACKEND
========================= */
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

/* =========================
   SYNC WHEN ONLINE
========================= */
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

/* =========================
   FAMILY TABLE
========================= */
function addFamilyRow(data = {}) {
  const tbody = document.getElementById("familyTableBody");
  const rowCount = tbody.children.length + 1;

  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${rowCount}</td>
    <td>
      <select>
        <option value="">Select</option>
        <option ${data.relationship === "Father" ? "selected" : ""}>Father</option>
        <option ${data.relationship === "Mother" ? "selected" : ""}>Mother</option>
        <option ${data.relationship === "Brother" ? "selected" : ""}>Brother</option>
        <option ${data.relationship === "Sister" ? "selected" : ""}>Sister</option>
        <option ${data.relationship === "Spouse" ? "selected" : ""}>Spouse</option>
      </select>
    </td>
    <td><input type="text" value="${data.name || ""}"></td>
    <td><input type="date" value="${data.dob || ""}"></td>
    <td>
      <select>
        <option value="">Select</option>
        <option ${data.dependent === "Yes" ? "selected" : ""}>Yes</option>
        <option ${data.dependent === "No" ? "selected" : ""}>No</option>
      </select>
    </td>
    <td><input type="text" value="${data.occupation || ""}"></td>
    <td><input type="number" value="${data.income || ""}"></td>
  `;

  tbody.appendChild(row);
}

function getFamilyMembers() {
  const rows = document.querySelectorAll("#familyTableBody tr");

  return Array.from(rows).map(row => {
    const cells = row.querySelectorAll("select, input");
    return {
      relationship: cells[0].value,
      name: cells[1].value,
      dob: cells[2].value,
      dependent: cells[3].value,
      occupation: cells[4].value,
      income: cells[5].value
    };
  });
}

/* =========================
   LOCAL STORAGE
========================= */
function saveFormLocally(data) {
  localStorage.setItem("draft", JSON.stringify(data));
}

function restoreForm() {
  const draft = localStorage.getItem("draft");
  if (!draft) return;

  const d = JSON.parse(draft);

  setValue("fullName", d.fullName);
  setValue("email", d.email);
  setValue("phone", d.phone);
  setValue("date", d.dob);
  setValue("state", d.state);
  setValue("city", d.city);
  setValue("aadhaar", d.aadhaar);
  setValue("bankAccount", d.bankAccount);
  setValue("title", d.title?.id);

  if (d.gender) {
    document.querySelector(
      `input[name="gender"][value="${d.gender}"]`
    ).checked = true;
  }

  if (Array.isArray(d.familyMembers)) {
    d.familyMembers.forEach(member => addFamilyRow(member));
  }
}

/* =========================
   HELPERS
========================= */
function clearForm() {
  document.getElementById("candidateForm").reset();
  document.getElementById("familyTableBody").innerHTML = "";
}

function getValue(id) {
  return document.getElementById(id)?.value || "";
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || "";
}






// document.addEventListener("DOMContentLoaded", () => {
//   restoreForm();

//   document.getElementById("candidateForm").addEventListener("submit", submitForm);
// });

// async function submitForm(e) {
//   e.preventDefault();

//   const candidate = {
//     fullName: document.getElementById("fullName").value,
//     email: document.getElementById("email").value,
//     phone: document.getElementById("phone").value,
//     dob: document.getElementById("date").value,
//     gender: document.querySelector('input[name="gender"]:checked')?.value,
//     state: document.getElementById("state").value,
//     city: document.getElementById("city").value,
//     aadhaar: document.getElementById("aadhaar").value,
//     bankAccount: document.getElementById("bankAccount").value,
//     title: { id: Number(document.getElementById("title").value) }
//   };

//   saveFormLocally(candidate);

//   if (!navigator.onLine) {
//     await saveOffline(candidate);
//     alert("Form submitted. No internet");
//     return;
//   }

//   sendToServer(candidate);
// }

// function sendToServer(candidate) {
//   fetch("https://offlineform.onrender.com/candidates", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(candidate)
//   })
//     .then(() => {
//       alert("Saved successfully");
//       localStorage.removeItem("draft");
//       clearForm();
//     })
//     .catch(async () => {
//       await saveOffline(candidate);
//       alert("Saved offline");
//     });
// }

// window.addEventListener("online", async () => {
//   const offlineData = await getOfflineData();

//   for (const data of offlineData) {
//     await fetch("https://offlineform.onrender.com/candidates", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(data)
//     });
//   }

//   await clearOfflineData();
//   alert("Internet back. Offline data synced!");
// });

// function saveFormLocally(data) {
//   localStorage.setItem("draft", JSON.stringify(data));
// }

// function restoreForm() {
//   const draft = localStorage.getItem("draft");
//   if (!draft) return;

//   const d = JSON.parse(draft);

//   document.getElementById("fullName").value = d.fullName || "";
//   document.getElementById("email").value = d.email || "";
//   document.getElementById("phone").value = d.phone || "";
//   document.getElementById("date").value = d.dob || "";
//   document.getElementById("state").value = d.state || "";
//   document.getElementById("city").value = d.city || "";
//   document.getElementById("aadhaar").value = d.aadhaar || "";
//   document.getElementById("bankAccount").value = d.bankAccount || "";
//   document.getElementById("title").value = d.title?.id || "";

//   if (d.gender) {
//     document.querySelector(
//       `input[name="gender"][value="${d.gender}"]`
//     ).checked = true;
//   }
// }

// function clearForm() {
//   document.getElementById("candidateForm").reset();
// }
