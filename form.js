// form.js
let isOnline = navigator.onLine;
let realPan = "";
let realAadhaar = "";
let realBankAccount = "";
let isRestoring = false;
let autosaveActivated = false;
let maritalStatus, marriageDate, childrenCount, prolongedIllness, illnessName, illnessDuration;
let steps = [], stepperSteps = [], sidebarItems = [], currentStep = 0;
const API_BASE = "https://offlineform.onrender.com";

window.debouncedSaveDraft = function () {
  console.warn("debouncedSaveDraft called before initialization");
};

function getCandidateFullName() {
  const fn = document.getElementById("firstName")?.value || "";
  const ln = document.getElementById("lastName")?.value || "";
  return `${fn} ${ln}`.trim();
}
window.addEventListener("online", () => {
  isOnline = true;
  console.log("Back online");
  syncOfflineSubmissions();
});

window.addEventListener("offline", () => {
  isOnline = false;
  console.log("You are Offline. You can continue filling the form");
});

let lastDraftHash = "";

async function saveDraft(draft) {
  if (!draft?.formData) return;

  const hash = JSON.stringify(draft);
  if (hash === lastDraftHash) return;
  lastDraftHash = hash;

  // Always save locally
  try {
    const parsed = typeof draft.formData === "string"
      ? JSON.parse(draft.formData)
      : draft.formData;
    await saveDraftToDB(parsed);
  } catch {
    console.warn("Invalid formData JSON, skipping local save");
  }

  if (!navigator.onLine) return;

  try {
    await fetch(`${API_BASE}/api/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
  } catch {
    console.warn("Server draft save failed");
  }
}

/* ---------- MARITAL STATUS TOGGLE ---------- */
function toggleMaritalFields() {
  const show = maritalStatus?.value === "Married";

  if (marriageDate?.parentElement)
    marriageDate.parentElement.style.display = show ? "block" : "none";

  if (childrenCount?.parentElement)
    childrenCount.parentElement.style.display = show ? "block" : "none";

  if (!show) {
    marriageDate.value = "";
    childrenCount.value = "";
    clearError(marriageDate);
    clearError(childrenCount);
  }
}


function toggleIllnessFields() {
  const prolongedIllness = document.getElementById("illness");
  const illnessName = document.getElementById("illnessName");
  const illnessDuration = document.getElementById("illnessDuration");

  const show = prolongedIllness?.value === "Yes";

  if (illnessName?.parentElement)
    illnessName.parentElement.style.display = show ? "block" : "none";

  if (illnessDuration?.parentElement)
    illnessDuration.parentElement.style.display = show ? "block" : "none";

  if (!show) {
    if (illnessName) illnessName.value = "";
    if (illnessDuration) illnessDuration.value = "";
  }
}

function isVisible(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function collectFormData() {
  const data = {};
  document.querySelectorAll("input, select, textarea").forEach(el => {
    if (!el.name) return;

    if (el.type === "radio") {
      if (el.checked) data[el.name] = el.value;
    } else if (el.type === "checkbox") {
      data[el.name] = el.checked;
    } else {
      data[el.name] = el.value;
    }
  });
  return data;
}

// Consolidated Restore Function
async function restoreDraftState(data) {
  if (!data) return;

  isRestoring = true;

  try {
    // 1️⃣ Restore dynamic rows FIRST
    if (data.fields) {
      restoreFamilyRows(data.fields);
      restoreLanguageRows(data.fields);
    }

    // 2️⃣ Restore Form Fields
    if (data.fields) {
      restoreFormData(data.fields);
      restoreMaskedKYC(data.fields);
    }

    // 🔁 Recalculate derived / conditional fields
    recalculateAge();
    toggleIllnessFields();
    toggleMaritalFields();
    toggleExperienceDependentSections();
    validateStep3Languages(true);
    syncMediclaimVisibility();
    syncStep3Conditionals();
    syncInterviewVisibility();
    syncLoanVisibility();
    syncAllFamilyRows();
    updateFamilyRelationshipOptions();
    autoCalculateSalary();
    reorderFamilyRows();

    // Restore signature previews
    if (data.fields?.signatureBase64) {
      updateSignaturePreviews(data.fields.signatureBase64);
    }

    if (Array.isArray(data.educationRows)) {
      restoreEducationRows(data.educationRows);
    }

  } catch (err) {
    console.error("Restore failed:", err);
  } finally {
    isRestoring = false;
  }
}
function toggleExperienceDependentSections() {
  const years = parseInt(document.getElementById("expYears")?.value?.trim() || "0", 10);
  const months = parseInt(document.getElementById("expMonths")?.value?.trim() || "0", 10);

  const show = years > 0 || months > 0;

  const salarySection = document.getElementById("salarySection");
  const expSection = document.getElementById("experienceDetails");
  const assignments = document.getElementById("assignmentsHandled");
  const uanContainer = document.getElementById("uanContainer");

  if (salarySection) salarySection.style.display = show ? "block" : "none";
  if (expSection) expSection.style.display = show ? "block" : "none";
  if (assignments) assignments.style.display = show ? "block" : "none";

  if (uanContainer) {
    uanContainer.style.display = show ? "block" : "none";
    if (!show) {
      const uanInput = document.getElementById("uan");
      if (uanInput) {
        uanInput.value = "";
        if (typeof clearError === "function") clearError(uanInput);
      }
    }
  }
}

function restoreFamilyRows(fields) {
  const tbody = document.getElementById("familyTableBody");
  if (!tbody || !fields) return;

  // Clear existing rows to ensure exact state match
  tbody.innerHTML = "";

  // Count required rows based on keys like 'family[index][name]'
  let maxIndex = -1;
  Object.keys(fields).forEach(key => {
    const match = key.match(/^family\[(\d+)\]/);
    if (match) {
      maxIndex = Math.max(maxIndex, parseInt(match[1]));
    }
  });

  const requiredCount = maxIndex + 1;

  for (let i = 0; i < requiredCount; i++) {
    addFamilyRow();
  }

  // Update relationship options after restoring rows
  setTimeout(() => {
    updateFamilyRelationshipOptions();
    const tbody = document.getElementById("familyTableBody");
    if (tbody) tbody.querySelectorAll("tr").forEach(bindFamilyRowAutosave);
  }, 0);
}

function restoreLanguageRows(fields) {
  const tbody = document.querySelector("#languageTable tbody");
  if (!tbody || !fields) return;

  // Do NOT clear the tbody, keep English/Hindi
  // Instead, determine how many rows currently exist
  const existingRows = tbody.querySelectorAll("tr").length;

  let maxIndex = -1;
  Object.keys(fields).forEach(key => {
    const match = key.match(/^languages\[(\d+)\]/);
    if (match) {
      maxIndex = Math.max(maxIndex, parseInt(match[1]));
    }
  });

  // Only add extra rows if maxIndex >= current count
  for (let i = existingRows; i <= maxIndex; i++) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <input type="text" name="languages[${i}][name]">
      </td>
      <td>
        <input type="checkbox" name="languages[${i}][speak]">
      </td>
      <td>
        <input type="checkbox" name="languages[${i}][read]">
      </td>
      <td>
        <input type="checkbox" name="languages[${i}][write]">
      </td>
      <td>
        <input type="radio" name="motherTongue" value="${i}">
      </td>
    `;

    tbody.appendChild(tr);

    // Bind autosave safely
    tr.querySelectorAll("input").forEach(el => {
      el.addEventListener("input", window.debouncedSaveDraft);
      el.addEventListener("change", window.debouncedSaveDraft);
    });
  }
}



function restoreFormData(data) {
  if (!data) return;

  Object.entries(data).forEach(([key, value]) => {
    // PAN & Aadhaar & Bank Account handled separately by restoreMaskedKYC
    if (key === "pan" || key === "aadhaar" || key === "bankAccount") return;

    const field = document.querySelector(`[name="${key}"]`);
    if (field) {
      if (field.type === "radio") {
        const matching = document.querySelector(`input[name="${key}"][value="${value}"]`);
        if (matching) {
          matching.checked = true;
        }
      } else if (field.type === "checkbox") {
        field.checked = !!value;
      } else {
        field.value = value || "";
      }
      // 🔥 REMOVED target.dispatchEvent to prevent recursion
    }
  });

}

function restoreMaskedKYC(data) {
  if (!data) return;

  const panHidden = document.getElementById("pan");
  const panDisplay = document.getElementById("panDisplay");
  const aadhaarHidden = document.getElementById("aadhaar");
  const aadhaarDisplay = document.getElementById("aadhaarDisplay");
  const bankHidden = document.getElementById("bankAccount");
  const bankDisplay = document.getElementById("bankAccountDisplay");

  console.log("🔍 Restoring KYC data:", {
    pan: data.pan,
    aadhaar: data.aadhaar,
    bankAccount: data.bankAccount
  });

  // PAN
  if (data.pan && panHidden && panDisplay) {
    realPan = data.pan;
    panHidden.value = data.pan;

    // Only mask if it's a valid PAN format (10 chars)
    if (data.pan.length === 10) {
      panDisplay.value = data.pan.slice(0, 2) + "****" + data.pan.slice(6);
      console.log("✅ PAN restored and masked");
    } else {
      panDisplay.value = data.pan;
      console.log("⚠️ PAN restored but not masked (invalid length)");
    }
  }

  // Aadhaar
  if (data.aadhaar && aadhaarHidden && aadhaarDisplay) {
    realAadhaar = data.aadhaar;
    aadhaarHidden.value = data.aadhaar;

    // Only mask if it's a valid Aadhaar format (12 digits)
    if (data.aadhaar.length === 12) {
      aadhaarDisplay.value = "XXXXXXXX" + data.aadhaar.slice(-4);
      console.log("✅ Aadhaar restored and masked");
    } else {
      aadhaarDisplay.value = data.aadhaar;
      console.log("⚠️ Aadhaar restored but not masked (invalid length)");
    }
  }

  // Bank Account
  if (data.bankAccount && bankHidden && bankDisplay) {
    realBankAccount = data.bankAccount;
    bankHidden.value = data.bankAccount;

    // Only mask if it's at least 8 digits
    if (data.bankAccount.length >= 8) {
      bankDisplay.value = "XXXXXX" + data.bankAccount.slice(-4);
      console.log("✅ Bank Account restored and masked");
    } else {
      bankDisplay.value = data.bankAccount;
      console.log("⚠️ Bank Account restored but not masked (invalid length)");
    }
  }
}


function recalculateAge() {
  const dob = document.getElementById("dob")?.value;
  const ageEl = document.getElementById("age");

  if (!dob || !ageEl) return;

  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  ageEl.value = age;
}

function updateSignaturePreviews(b64) {
  const base64Input = document.getElementById("signatureBase64");
  const step5Preview = document.getElementById("step5SigPreview");
  const step6Preview = document.getElementById("step6SigPreview");
  const step5Box = document.getElementById("step5SigBox");
  const step6Box = document.getElementById("step6SigBox");

  if (base64Input) base64Input.value = b64 || "";

  if (b64) {
    if (step5Preview) {
      step5Preview.src = b64;
      step5Preview.style.display = "block";
      if (step5Box) {
        const placeholder = step5Box.querySelector(".placeholder-text");
        if (placeholder) placeholder.style.display = "none";
      }
    }
    if (step6Preview) {
      step6Preview.src = b64;
      step6Preview.style.display = "block";
      if (step6Box) {
        const placeholder = step6Box.querySelector(".placeholder-text");
        if (placeholder) placeholder.style.display = "none";
      }
    }
  } else {
    // Reset if empty
    if (step5Preview) {
      step5Preview.src = "";
      step5Preview.style.display = "none";
      if (step5Box) {
        const placeholder = step5Box.querySelector(".placeholder-text");
        if (placeholder) placeholder.style.display = "block";
      }
    }
    if (step6Preview) {
      step6Preview.src = "";
      step6Preview.style.display = "none";
      if (step6Box) {
        const placeholder = step6Box.querySelector(".placeholder-text");
        if (placeholder) placeholder.style.display = "block";
      }
    }
  }
}

function autoCalculateSalary() {
  const step5 = steps[4];
  if (!step5) return;

  const rows = step5.querySelectorAll("#salarySection .family-table tbody tr");
  let a = 0, b = 0, c = 0;

  rows.forEach(row => {
    const nums = row.querySelectorAll("input[type='number']");
    if (nums[0]?.value) a += +nums[0].value || 0;
    if (nums[1]?.value) b += +nums[1].value || 0;
    if (nums[2]?.value) c += +nums[2].value || 0;
  });

  const totalA = document.getElementById("totalA");
  const totalB = document.getElementById("totalB");
  const totalC = document.getElementById("totalC");
  const monthly = document.getElementById("monthlyTotal");
  const annual = document.getElementById("annualTotal");

  if (totalA) totalA.value = a || "";
  if (totalB) totalB.value = b || "";
  if (totalC) totalC.value = c || "";
  if (monthly) monthly.value = (a + b + c) || "";
  if (annual) annual.value = (a + b + c) ? (a + b + c) * 12 : "";
}

function isAlphaOnly(value) {
  return /^[A-Za-z\s.]+$/.test(value.trim());
}

function isYear(value) {
  const y = Number(value);
  return /^\d{4}$/.test(value) && y >= 1900 && y <= 2099;
}

async function syncOfflineSubmissions() {
  if (!navigator.onLine) return;

  const pending = await loadOfflineSubmissions();
  if (!pending?.length) return;

  console.log(`Syncing ${pending.length} offline submissions...`);

  for (const payload of pending) {
    try {
      const res = await fetch(`${API_BASE}/api/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await removeOfflineSubmission(payload.id);
      }
    } catch (e) {
      console.warn("Sync failed for one entry", e);
    }
  }
  console.log("Offline sync completed");
}

const isFutureDate = d => d && new Date(d) > new Date();
const minLen = (v, l) => v && v.trim().length >= l;
const val = el => el?.value?.trim() || "";

const isValidPersonName = v =>
  typeof v === "string" &&
  v.trim().length >= 2 &&
  /^[A-Za-z .'-]+$/.test(v.trim());


const isValidBankOrBranch = v =>
  typeof v === "string" &&
  v.trim().length >= 3 &&
  /^[A-Za-z .'-]+$/.test(v.trim());

const heightPattern = /^[1-8]'([0-9]|1[01])$/;
const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const aadhaarPlain = /^\d{12}$/;


window.addFamilyRow = () => {
  const tbody = document.getElementById("familyTableBody");

  if (!tbody) return;

  const index = tbody.children.length;
  const tr = document.createElement("tr");
  tr.innerHTML = `
      <td class="center">
        <button type="button" class="btn-delete" onclick="removeFamilyRow(this)">
          <svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align: middle;"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg>
        </button>
      </td>
      <td>
        <select name="family[${index}][relationship]">
          <option value="">Select</option>
          <option>Father</option>
          <option>Mother</option>
          <option>Brother</option>
          <option>Sister</option>
          <option>Spouse</option>
          <option>Son</option>
          <option>Daughter</option>
        </select>
      </td>
      <td><input type="text" name="family[${index}][name]"></td>
      <td><input type="date" name="family[${index}][dob]" max="${new Date().toISOString().split("T")[0]}"></td>
      <td>
        <select name="family[${index}][dependent]">
          <option value="">Select</option>
          <option>Yes</option>
          <option>No</option>
        </select>
      </td>
      <td><input type="text" name="family[${index}][occupation]"></td>
      <td><input type="number" name="family[${index}][income]" min="0"></td>
    `;
  tbody.appendChild(tr);

  // ✅ Limit income to 6 digits
  const incomeInput = tr.querySelector("input[name*='income']");
  incomeInput.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 6) v = v.slice(0, 6);
    e.target.value = v;
  });

  const rel = tr.querySelector("select[name*='relationship']");
  rel.addEventListener("change", () => {
    syncFamilyRow(tr);
    updateFamilyRelationshipOptions();
    reorderFamilyRows();
  });
  bindFamilyRowAutosave(tr);
};

function bindFamilyRowAutosave(row) {
  row.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", window.debouncedSaveDraft);
    el.addEventListener("change", window.debouncedSaveDraft);
  });
}

window.removeFamilyRow = (btn) => {
  const tr = btn.closest("tr");
  if (!tr) return;
  const tbody = tr.parentElement;
  tr.remove();
  reorderFamilyRows();
  updateFamilyRelationshipOptions();
  window.debouncedSaveDraft();
};

function reindexFamilyRows(tbody) {
  if (!tbody) return;
  const rows = tbody.querySelectorAll("tr");
  rows.forEach((row, i) => {
    row.querySelectorAll("input, select").forEach(el => {
      const name = el.name;
      if (name && name.startsWith("family[")) {
        el.name = name.replace(/family\[\d+\]/, `family[${i}]`);
      }
    });
  });
}

function reorderFamilyRows() {
  const tbody = document.getElementById("familyTableBody");
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll("tr"));

  rows.sort((a, b) => {
    const valA = a.querySelector("select[name*='relationship']")?.value || "";
    const valB = b.querySelector("select[name*='relationship']")?.value || "";

    const priority = { "Father": 1, "Mother": 2 };
    const pA = priority[valA] || 99;
    const pB = priority[valB] || 99;

    return pA - pB;
  });

  rows.forEach(row => tbody.appendChild(row));
  reindexFamilyRows(tbody);
}

function syncFamilyRow(row) {
  const rel = row.querySelector("select[name*='relationship']");
  const nameInput = row.querySelector("input[name*='name']");
  const dobInputRow = row.querySelector("input[name*='dob']");

  if (!rel || !nameInput || !dobInputRow) return;

  const fatherName = document.getElementById("fatherName")?.value?.trim() || "";
  const motherName = document.getElementById("motherName")?.value?.trim() || "";

  // 🔴 ALWAYS reset first
  nameInput.readOnly = false;

  if (rel.value === "Father") {
    nameInput.value = fatherName || "";
    nameInput.readOnly = true;
  } else if (rel.value === "Mother") {
    nameInput.value = motherName || "";
    nameInput.readOnly = true;
  } else {
    if (
      (fatherName && nameInput.value === fatherName) ||
      (motherName && nameInput.value === motherName)
    ) {
      nameInput.value = "";
    }
  }
  dobInputRow.readOnly = false;
}

function updateFamilyRelationshipOptions() {
  const rows = document.querySelectorAll("#familyTableBody tr");

  let fatherUsed = false;
  let motherUsed = false;

  // First pass → detect used relations
  rows.forEach(row => {
    const rel = row.querySelector("select[name*='relationship']");
    if (!rel) return;
    if (rel.value === "Father") fatherUsed = true;
    if (rel.value === "Mother") motherUsed = true;
  });

  // Second pass → disable options accordingly
  rows.forEach(row => {
    const rel = row.querySelector("select[name*='relationship']");
    if (!rel) return;

    rel.querySelectorAll("option").forEach(opt => {
      if (opt.value === "Father") {
        opt.disabled = fatherUsed && rel.value !== "Father";
      }
      if (opt.value === "Mother") {
        opt.disabled = motherUsed && rel.value !== "Mother";
      }
    });
  });
}

function syncMediclaimVisibility() {
  const yes = document.getElementById("mediclaimYes");
  const no = document.getElementById("mediclaimNo");
  const details = document.getElementById("mediclaimDetails");
  const hidden = document.getElementById("mediclaimConsent");

  if (!yes || !no || !details || !hidden) return;

  const isYes = hidden.value === "Yes";
  const isNo = hidden.value === "No";

  details.style.display = isYes ? "block" : "none";
  yes.checked = isYes;
  no.checked = isNo;

  // Toggle required attribute for inputs inside details
  const inputs = details.querySelectorAll("input, select");
  inputs.forEach(el => {
    if (!el.hasAttribute("readonly")) {
      el.required = isYes;
    }
  });
}

function setupMediclaimRequiredLogic() {
  const yes = document.getElementById("mediclaimYes");
  const no = document.getElementById("mediclaimNo");
  const hidden = document.getElementById("mediclaimConsent");

  if (!yes || !no || !hidden) return;

  yes.addEventListener("change", () => {
    hidden.value = "Yes";
    syncMediclaimVisibility();
  });

  no.addEventListener("change", () => {
    hidden.value = "No";
    syncMediclaimVisibility();
  });

  // Initial sync
  syncMediclaimVisibility();
}

function syncStep3Conditionals() {
  const step3 = steps[2];
  if (!step3) return;
  step3.querySelectorAll("textarea.conditional-details").forEach(textarea => {
    const select = textarea.previousElementSibling;
    if (select && select.tagName === "SELECT") {
      textarea.style.display = (select.value === "Yes") ? "block" : "none";
    }
  });
}

function setupStep3Conditionals() {
  const step3 = steps[2];
  if (!step3) return;
  step3.querySelectorAll("textarea.conditional-details").forEach(textarea => {
    const select = textarea.previousElementSibling;
    if (select && select.tagName === "SELECT") {
      select.addEventListener("change", syncStep3Conditionals);
    }
  });
  syncStep3Conditionals();
}

function syncInterviewVisibility() {
  const interviewDropdown = document.getElementById("interviewedBefore");
  const interviewDetails = document.getElementById("interviewDetails");
  if (!interviewDropdown || !interviewDetails) return;

  if (interviewDropdown.value.toLowerCase() === "yes") {
    interviewDetails.style.display = "block";
  } else {
    interviewDetails.style.display = "none";
    if (!isRestoring) {
      interviewDetails.querySelectorAll("input").forEach(input => {
        input.value = "";
      });
    }
  }
}

function setupInterviewLogic() {
  const interviewDropdown = document.getElementById("interviewedBefore");
  if (!interviewDropdown) return;
  interviewDropdown.addEventListener("change", syncInterviewVisibility);
  syncInterviewVisibility();
}

function syncLoanVisibility() {
  const loanDropdown = document.getElementById("loanAvailed");
  const loanFields = document.getElementById("loanFields");
  if (!loanDropdown || !loanFields) return;

  if (loanDropdown.value.toLowerCase() === "yes") {
    loanFields.style.display = "";
  } else {
    loanFields.style.display = "none";
    if (!isRestoring) {
      loanFields.querySelectorAll("input").forEach(input => {
        input.value = "";
      });
    }
  }
}

function setupLoanLogic() {
  const loanDropdown = document.getElementById("loanAvailed");
  if (!loanDropdown) return;
  loanDropdown.addEventListener("change", syncLoanVisibility);
  syncLoanVisibility();
}

function syncAllFamilyRows() {
  document.querySelectorAll("#familyTableBody tr").forEach(syncFamilyRow);
}

function fillMediclaimEmployeeDetails() {
  const map = {
    "firstName lastName": () => {
      const fn = document.getElementById("firstName")?.value || "";
      const ln = document.getElementById("lastName")?.value || "";
      return `${fn} ${ln}`.trim();
    },
    dob: () => {
      const val = document.getElementById("dob")?.value;
      if (!val) return "";
      const [y, m, d] = val.split("-");
      return `${d}/${m}/${y}`;
    },
    employeeId: () => document.getElementById("employeeId")?.value || "",
    today: () => {
      const now = new Date();
      const d = String(now.getDate()).padStart(2, '0');
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const y = now.getFullYear();
      return `${d}/${m}/${y}`;
    }
  };
  document.querySelectorAll("[data-bind]").forEach(el => {
    const key = el.dataset.bind;
    if (map[key]) el.textContent = map[key]();
  });
}
// --- UI Update Helpers ---
function updateStepperUI() {
  if (stepperSteps && stepperSteps.length > 0) {
    stepperSteps.forEach((circle, i) => {
      circle.classList.toggle("active", i === currentStep);
      circle.classList.toggle("completed", i < currentStep);
    });

    // Update progress line
    const progressLine = document.querySelector(".stepper-line");
    if (progressLine) {
      const percent = (currentStep / (stepperSteps.length - 1)) * 100;
      progressLine.style.background = `linear-gradient(to right, #47749b ${percent}%, #d1d5db ${percent}%)`;
    }
  }
}

function updateSidebarUI() {
  if (sidebarItems && sidebarItems.length > 0) {
    sidebarItems.forEach((li, i) => {
      li.classList.toggle("active", i === currentStep);
      li.classList.toggle("completed", i < currentStep);
    });
  }
}

function fillMediclaimFamilyDetails(sourceData = null) {
  const tbody = document.getElementById("mediclaimFamilyBody");
  if (!tbody) return;

  tbody.innerHTML = "";
  let sno = 1;

  let familyRows = [];

  if (sourceData) {
    // Determine family rows from provided data object
    const indices = Object.keys(sourceData)
      .filter(k => k.startsWith("family["))
      .map(k => parseInt(k.match(/\[(\d+)\]/)?.[1]))
      .filter((v, i, a) => !isNaN(v) && a.indexOf(v) === i);

    familyRows = indices.map(idx => ({
      relationship: sourceData[`family[${idx}][relationship]`] || "",
      name: sourceData[`family[${idx}][name]`] || "",
      dob: sourceData[`family[${idx}][dob]`] || ""
    }));
  } else {
    // Read directly from DOM (original logic)
    document.querySelectorAll("#familyTableBody tr").forEach(row => {
      familyRows.push({
        relationship: row.querySelector("select[name*='relationship']")?.value || "",
        name: row.querySelector("input[name*='name']").value || "",
        dob: row.querySelector("input[name*='dob']").value || ""
      });
    });
  }

  familyRows.forEach(row => {
    let { relationship, name, dob } = row;
    if (!relationship || !name) return;

    // Date formatting (DD/MM/YYYY)
    if (dob && dob.includes("-")) {
      const [year, month, day] = dob.split("-");
      dob = `${day}/${month}/${year}`;
    }

    // Automatic Gender Generation
    let gender = "";
    switch (relationship) {
      case "Father":
      case "Brother":
      case "Son":
        gender = "Male";
        break;
      case "Mother":
      case "Sister":
      case "Daughter":
        gender = "Female";
        break;
      case "Spouse":
        const candidateGender = document.querySelector("input[name='gender']:checked")?.value ||
          (sourceData ? sourceData.gender : "");
        if (candidateGender === "Male") gender = "Female";
        else if (candidateGender === "Female") gender = "Male";
        break;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sno++}</td>
      <td>${relationship}</td>
      <td>${gender}</td>
      <td>${name}</td>
      <td>${dob}</td>
    `;
    tbody.appendChild(tr);
  });
}

function populateMediclaimStep(data) {
  if (!data) return;

  // Header / simple bindings
  document.querySelectorAll("[data-bind]").forEach(el => {
    const key = el.dataset.bind;
    if (key === "today") {
      const now = new Date();
      el.textContent = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    } else if (key === "firstName lastName") {
      el.textContent = `${data.firstName || ""} ${data.lastName || ""}`;
    } else if (key === "dob" && data[key]) {
      const [y, m, d] = data[key].split("-");
      el.textContent = (y && m && d) ? `${d}/${m}/${y}` : data[key];
    } else if (data[key]) {
      el.textContent = data[key];
    }
  });

  fillMediclaimFamilyDetails(data);
}


// Single source of truth for step transitions
function showStep(index) {
  if (index < 0 || index >= (steps?.length || 0)) return;

  // 🔥 THIS LINE IS MANDATORY FOR SYNC
  currentStep = index;

  /* 1. Toggle Step Visibility */
  steps.forEach((step, i) => {
    step.classList.toggle("active", i === index);
  });

  /* 2. Update Indicators */
  updateSidebarUI();
  updateStepperUI();

  /* 3. Update Navigation Buttons */
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const submitBtn = document.getElementById("submitBtn");

  if (prevBtn) prevBtn.style.display = index === 0 ? "none" : "inline-block";
  if (nextBtn) nextBtn.style.display = index === (steps.length - 1) ? "none" : "inline-block";
  if (submitBtn) submitBtn.style.display = index === (steps.length - 1) ? "inline-block" : "none";

  /* 4. Logic for specific steps */
  if (index === 5) { // Step‑6 (Mediclaim)
    fillMediclaimEmployeeDetails();
    fillMediclaimFamilyDetails();
  }
}

// ✅ FIX: Renamed internal navigation function to avoid conflict with window.goToStep override
function navigateToStep(stepIndex) {
  if (
    typeof stepIndex !== "number" ||
    stepIndex < 0 ||
    stepIndex >= (steps?.length || 0)
  ) return;

  if (stepIndex === currentStep) return;

  showStep(stepIndex);
}

function initFamilyRow(row) {
  const rel = row.querySelector("select[name*='relationship']");
  if (!rel) return;

  rel.addEventListener("change", () => {
    syncFamilyRow(row);
    updateFamilyRelationshipOptions();
  });

  // initial state sync
  syncFamilyRow(row);
  updateFamilyRelationshipOptions();
}

function ensureVisibleError(step) {
  const err = step.querySelector(".error");
  if (!err) {
    console.warn("Validation failed but no field marked error");
    shakeCurrentStep();
  }
}

const candidateForm = document.getElementById("candidateForm");

candidateForm?.addEventListener("change", e => {
  if (e.target.closest("#familyTableBody")) {
    fillMediclaimFamilyDetails();
  }
});




candidateForm?.addEventListener("change", e => {
  if (!e.target.matches("select[name*='relationship']")) return;

  if (e.target.value === "Spouse") {
    const spouses = [
      ...document.querySelectorAll("select[name*='relationship']")
    ].filter(s => s.value === "Spouse");

    if (spouses.length > 1) {
      alert("Only one spouse is allowed");
      e.target.value = "";
    }
  }
});



function allowOnlyYear(input) {
  input.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 4);

    if (v.length === 4) {
      const year = Number(v);
      if (year < 1900) v = "1900";
      if (year > 2099) v = "2099";
    }

    e.target.value = v;
  });
}

function allowOnlyAlphabets(input) {
  input.addEventListener("input", e => {
    e.target.value = e.target.value.replace(/[^A-Za-z .]/g, "");
  });
}

function isSkippable(el) {
  if (!el) return true;
  if (el.disabled || el.readOnly || el.offsetParent === null) return true;

  const optionalIds = new Set([
    "pan", "aadhaar", "bankAccount",
    "monthlyOthers", "statutoryOthers",
    "totalA", "totalB", "totalC",
    "monthlyTotal", "annualTotal"
  ]);

  const optionalNames = new Set([
    "monthlyOthers", "statutoryOthers"
  ]);

  // Make all specific salary breakup fields optional (they default to 0 in calculations)
  if (el.name && el.name.startsWith("salary_")) return true;

  return optionalIds.has(el.id) || optionalNames.has(el.name);
}

let serverDraft = null;

async function loadDraft(mobile) {
  try {
    const response = await fetch(
      `${API_BASE}/api/drafts?mobile=${encodeURIComponent(mobile)}`
    );

    if (response.status === 204) {
      return null; // no draft found
    }

    if (!response.ok) return null;

    serverDraft = await response.json();
    return serverDraft;
  } catch {
    return null;
  }
}

function clearError(el) {
  if (!el) return;
  el.classList.remove("input-error");
  const msg = el.parentElement?.querySelector(".error-msg");
  if (msg) msg.remove();
}

function markError(field, msgText = "This field is required") {
  if (!field) return;
  field.classList.add("input-error");

  let msg = field.parentElement.querySelector(".error-msg");
  if (!msg) {
    msg = document.createElement("div");
    msg.className = "error-msg";
    msg.innerText = msgText;
    field.parentElement.appendChild(msg);
  }
}

function clearAllErrors() {
  document.querySelectorAll(".input-error").forEach(el =>
    el.classList.remove("input-error")
  );
  document.querySelectorAll(".error-msg").forEach(el =>
    el.remove()
  );
  document.querySelectorAll(".step-error").forEach(el => el.remove());
}

function showError(el, msg, silent = false) {
  if (silent || !el) return;
  console.log("Validation error on field:", el.name || el.id, "Message:", msg);
  markError(el, msg);
}

// Global validateStep3Languages function
function validateStep3Languages(silent = false) {
  let ok = true;
  const motherTongues = document.querySelectorAll(
    'input[name="motherTongue"]:checked'
  );

  if (motherTongues.length !== 1) {
    const radios = document.querySelectorAll(
      'input[name="motherTongue"]'
    );

    radios.forEach(r => r.closest("td")?.classList.add("input-error"));

    if (!silent) {
      const step = steps[2];
      showSummaryError(step, "Select exactly one Mother Tongue");
    }
    ok = false;
  }
  return ok;
}

function showSummaryError(step, msg) {
  step.querySelector(".step-error")?.remove();

  const div = document.createElement("div");
  div.className = "step-error";
  div.innerText = msg;

  const title = step.querySelector(".section-title");

  if (title && title.parentNode) {
    title.parentNode.insertBefore(div, title);
  } else {
    step.prepend(div);
  }
}



/* =========================================================
  MAIN STATE & INITIALIZATION
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  steps = document.querySelectorAll(".form-step");
  stepperSteps = document.querySelectorAll(".stepper-step");
  sidebarItems = document.querySelectorAll(".step-menu li");

  // Prevent future dates on all date inputs
  const todayStr = new Date().toISOString().split("T")[0];
  document.querySelectorAll('input[type="date"]').forEach(el => {
    el.setAttribute("max", todayStr);
  });

  // Stepper click
  stepperSteps.forEach((circle, index) => {
    circle.addEventListener("click", () => {
      navigateToStep(index);
    });
  });

  // Sidebar click
  sidebarItems.forEach((item, index) => {
    item.addEventListener("click", () => {
      navigateToStep(index);
    });
  });

  // 🔥 FORCE CLEAN INITIAL STATE
  steps.forEach(step => step.classList.remove("active"));
  stepperSteps.forEach(step => {
    step.classList.remove("active");
    step.classList.remove("completed");
  });
  sidebarItems.forEach(item => {
    item.classList.remove("active");
    item.classList.remove("completed");
  });

  // Always start from Step 0 visually
  showStep(0);
  toggleExperienceDependentSections();

  const loggedInMobile =
    sessionStorage.getItem("loggedInMobile") ||
    localStorage.getItem("loggedInMobile");

  if (!loggedInMobile) {
    window.location.href = "login.html";
    return;
  }

  (async function restoreDraftFlow() {
    try {
      await openDB();

      // 1️⃣ Try server first
      serverDraft = await loadDraft(loggedInMobile);

      if (serverDraft?.formData) {
        const parsed = typeof serverDraft.formData === "string"
          ? JSON.parse(serverDraft.formData)
          : serverDraft.formData;

        await restoreDraftState(parsed);

        // ✅ FIX: Use navigateToStep (internal) instead of goToStep (which may run validators)
        const stepToRestore = !isNaN(parsed.step) ? Number(parsed.step) : 0;
        navigateToStep(stepToRestore);
        toggleExperienceDependentSections();
        activateAutosave();
        return;
      }

      // 2️⃣ Fallback to IndexedDB
      const localDraft = await loadDraftFromDB();
      if (localDraft) {
        await restoreDraftState(localDraft);

        // ✅ FIX: Use navigateToStep (internal) instead of goToStep
        const stepToRestore = !isNaN(localDraft.step) ? Number(localDraft.step) : 0;
        navigateToStep(stepToRestore);
        toggleExperienceDependentSections();
        activateAutosave();
        return;
      }

      // 3️⃣ New Form - Just activate autosave
      activateAutosave();
    } catch (err) {
      console.error("Draft restore failed:", err);
    }
  })();

  document.getElementById("addEducationBtn")
    ?.addEventListener("click", () => {
      addEducationRow({});
      debouncedSaveDraft();
    });

  let isSubmitting = false;

  window._debugCurrentStep = () => currentStep;

  const formStatus = sessionStorage.getItem("formStatus");


  function addEducationRow(data = {}) {
    const tbody =
      document.querySelector("#extraGraduations table tbody") ||
      document.querySelector(".graduation-wrapper table tbody");
    if (!tbody) return;

    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td><input type="text" name="grad_college[]" value="${data.college || ""}"></td>
    <td><input type="text" name="grad_board[]" value="${data.board || ""}"></td>
    <td><input type="text" name="grad_degree[]" value="${data.degree || ""}"></td>
    <td><input type="text" name="grad_stream[]" value="${data.stream || ""}"></td>
    <td><input type="number" name="grad_joining[]" value="${data.joining || ""}"></td>
    <td><input type="number" name="grad_leaving[]" value="${data.leaving || ""}"></td>
    <td><input type="number" name="grad_aggregate[]" value="${data.aggregate || ""}"></td>
    <td>
      <button type="button" class="deleteRow">Delete</button>
    </td>
  `;

    tr.querySelector(".deleteRow").addEventListener("click", function () {
      const totalRows = document.querySelectorAll(
        ".graduation-wrapper table tbody tr, #extraGraduations table tbody tr"
      ).length;

      if (totalRows <= 1) {
        alert("At least one education record is required");
        return;
      }

      tr.remove();
      debouncedSaveDraft();
    });

    tbody.appendChild(tr);
  }

  function getEducationRowsData() {
    const rows = [];
    const allGradRows = document.querySelectorAll(
      ".graduation-wrapper table tbody tr, #extraGraduations table tbody tr"
    );

    allGradRows.forEach(tr => {
      const inputs = tr.querySelectorAll("input");
      if (inputs.length >= 7) {
        rows.push({
          college: inputs[0].value,
          board: inputs[1].value,
          degree: inputs[2].value,
          stream: inputs[3].value,
          joining: inputs[4].value,
          leaving: inputs[5].value,
          aggregate: inputs[6].value
        });
      }
    });

    return rows;
  }

  window.restoreEducationRows = function (saved = []) {
    if (!Array.isArray(saved) || saved.length === 0) return;

    // Restore first row
    const firstGrad = document.querySelector(".graduation-wrapper table tbody tr");
    if (firstGrad && saved[0]) {
      const inputs = firstGrad.querySelectorAll("input");
      inputs[0].value = saved[0].college || "";
      inputs[1].value = saved[0].board || "";
      inputs[2].value = saved[0].degree || "";
      inputs[3].value = saved[0].stream || "";
      inputs[4].value = saved[0].joining || "";
      inputs[5].value = saved[0].leaving || "";
      inputs[6].value = saved[0].aggregate || "";
    }

    // Restore extra rows
    for (let i = 1; i < saved.length; i++) {
      addEducationRow(saved[i]);
    }
  };


  ["loanAmount", "loanBalance", "loanSalary"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 8);
    });
  });

  const joiningDays = document.getElementById("joiningDays");
  if (joiningDays) {
    joiningDays.addEventListener("input", function () {
      let v = this.value.replace(/\D/g, "");
      if (v.length > 2) v = v.slice(0, 2);
      this.value = v;
    });
  }


  function stopAutosave() {
    // No-op: Interval removed in favor of event-based saving
  }

  if (loggedInMobile) {
    const mobile1 = document.getElementById("mobile1");
    const mobile2 = document.getElementById("mobile2");

    if (mobile1) {
      mobile1.value = loggedInMobile;
      mobile1.readOnly = true;
    }

    if (mobile2) {
      mobile2.value = loggedInMobile;
      mobile2.readOnly = true;
    }
  }

  const mainForm = document.getElementById("candidateForm");
  if (!mainForm) {
    console.warn("mainForm not found in DOM");
    return;
  }

  if (formStatus === "SUBMITTED") {
    document.body.innerHTML = `
    <div class="user-submitted-message" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f7f9;">
      <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); max-width: 500px;">
        <div style="font-size: 50px; color: #4CAF50; margin-bottom: 20px;">✓</div>
        <h2 style="color: #333; margin-bottom: 15px;">You have already submitted the form</h2>
        <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 25px;">Your application has been received and is currently being processed. You cannot edit a submitted form.</p>
        <button onclick="window.location.href='login.html'" style="background: #47749b; color: white; border: none; padding: 12px 30px; border-radius: 6px; font-size: 16px; cursor: pointer; transition: background 0.2s;">Back to Login</button>
      </div>
    </div>`;
    return; // ⛔ Stop form JS execution
  }

  setupMediclaimRequiredLogic();
  setupStep3Conditionals();
  setupInterviewLogic();
  setupLoanLogic();

  document
    .querySelectorAll("#familyTableBody tr")
    .forEach(initFamilyRow);



  const nextBtn = document.getElementById("nextBtn");
  const prevBtn = document.getElementById("prevBtn");
  const submitBtn = document.getElementById("submitBtn");

  let draftTimer;
  function debouncedSaveDraft() {
    if (isSubmitting) return;
    if (isRestoring || !loggedInMobile) return;
    if (typeof saveDraft !== "function") return;

    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const data = collectFormData();
      const educationalParams = getEducationRowsData();

      saveDraft({
        mobile: loggedInMobile,
        formData: JSON.stringify({
          step: currentStep,
          fields: {
            ...data,
            // Explicitly prefer real values for masked fields
            pan: realPan || data.pan || "",
            aadhaar: realAadhaar || data.aadhaar || "",
            bankAccount: realBankAccount || data.bankAccount || ""
          },
          educationRows: educationalParams
        })
      });

    }, 500);
  }
  window.debouncedSaveDraft = debouncedSaveDraft;



  document.getElementById("fatherName")
    ?.addEventListener("input", syncAllFamilyRows);

  document.getElementById("motherName")
    ?.addEventListener("input", syncAllFamilyRows);



  document.querySelectorAll("input[name='gender']").forEach(radio => {
    radio.addEventListener("change", () => {
      const group = document.querySelector(".gender-group");
      clearError(group);
    });
  });

  const languageTableBody = document.querySelector("#languageTable tbody");
  const addLanguageBtn = document.getElementById("addLanguageBtn");

  addLanguageBtn?.addEventListener("click", () => {
    const index = languageTableBody.querySelectorAll("tr").length;

    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>
      <input type="text" name="languages[${index}][name]" placeholder="Language">
    </td>
    <td>
      <input type="checkbox" name="languages[${index}][speak]">
    </td>
    <td>
      <input type="checkbox" name="languages[${index}][read]">
    </td>
    <td>
      <input type="checkbox" name="languages[${index}][write]">
    </td>
    <td>
      <input type="radio" name="motherTongue" value="${index}">
    </td>
  `;

    languageTableBody.appendChild(tr);

    // Bind autosave for new row
    tr.querySelectorAll("input").forEach(el => {
      el.addEventListener("input", debouncedSaveDraft);
      el.addEventListener("change", debouncedSaveDraft);
    });

  });

  // YEARS
  document.getElementById("expYears")?.addEventListener("input", toggleExperienceDependentSections);

  // MONTHS
  const monthsEl = document.getElementById("expMonths");
  monthsEl?.addEventListener("input", e => {
    let v = +e.target.value || 0;
    if (v > 11) v = 11;
    if (v < 0) v = 0;
    e.target.value = v;
    toggleExperienceDependentSections();
  });

  /* ================= SIGNATURE UPLOAD LOGIC ================= */
  const sigFileInput = document.getElementById("signatureFile");
  const step5Box = document.getElementById("step5SigBox");
  const step6Box = document.getElementById("step6SigBox");

  sigFileInput?.addEventListener("change", function (e) {
    const file = e.target.files[0];
    const container = document.querySelector(".signature-upload-container");

    container?.classList.remove("input-error");
    const sigError = document.getElementById("signatureError");
    if (sigError) sigError.style.display = "none";

    if (!file) return;

    // 1️⃣ Format Validation
    const validTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      alert("Invalid format! Accepted: PNG, JPG, JPEG");
      sigFileInput.value = "";
      return;
    }

    // 2️⃣ Size Validation (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert("File too large! Max size: 2MB");
      sigFileInput.value = "";
      return;
    }

    // 3️⃣ Read & Preview
    const reader = new FileReader();
    reader.onload = function (e) {
      updateSignaturePreviews(e.target.result);
      debouncedSaveDraft();
    };
    reader.readAsDataURL(file);
  });

  // Since Step 6 box is also a label for sigFileInput, it works automatically if label for is correct.
  // But safety trigger:
  step6Box?.addEventListener("click", () => sigFileInput?.click());


  function activateAutosave() {
    if (autosaveActivated) return; // ✅ prevent duplicate binding
    autosaveActivated = true;

    ["input", "change"].forEach(evt => {
      mainForm.addEventListener(evt, () => {
        if (isRestoring) return;
        debouncedSaveDraft();
      });
    });

    console.log("✅ Autosave Activated (once)");
  }

  mainForm.addEventListener("input", e => {
    const el = e.target;
    // Clear error on input
    clearError(el);

    if (
      el.placeholder === "Joining Year" ||
      el.placeholder === "Leaving Year"
    ) {
      const yearPattern = /^\d{4}$/;
      if (yearPattern.test(el.value)) {
        clearError(el);
      }
    }
  });

  const newFormBtn = document.getElementById("newFormBtn");
  if (newFormBtn) {
    newFormBtn.onclick = async () => {
      await fetch("/api/new-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: sessionStorage.getItem("loggedInMobile")
        })
      });

      sessionStorage.setItem("formStatus", "NEW");
      sessionStorage.removeItem("serverDraft");
      window.location.reload();
    };
  }

  function allowOnlyDigits(input, maxLength) {
    input.addEventListener("input", e => {
      let v = e.target.value.replace(/\D/g, ""); // remove non-digits
      if (v.length > maxLength) v = v.slice(0, maxLength);
      e.target.value = v;
    });
  }

  // UAN – exactly 12 digits
  const uanInput = document.getElementById("uan");
  if (uanInput) {
    allowOnlyDigits(uanInput, 12);
  }

  // Account Number – max 18 digits
  const accountInput = document.getElementById("bankAccount");
  if (accountInput) {
    allowOnlyDigits(accountInput, 18);
  }

  /* ================= ERROR HELPERS ================= */
  function clearStepErrors(step) {
    step?.querySelectorAll(".input-error")?.forEach(e =>
      e.classList.remove("input-error")
    );
    step?.querySelectorAll(".error-msg")?.forEach(e => e.remove());
    step?.querySelector(".step-error")?.remove();
  }


  function showStepError(step, msg, silent = false) {
    if (silent) return;
    const d = document.createElement("div");
    d.className = "step-error";
    d.innerText = msg;
    step?.prepend(d);
  }

  function focusFirstError(step) {
    const el = step?.querySelector(".input-error");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
  }

  function shakeCurrentStep() {
    const step = steps[currentStep];
    if (!step) return;

    step.classList.remove("shake"); // reset if already applied
    void step.offsetWidth;          // force reflow
    step.classList.add("shake");
  }


  document.getElementById("monthlyTotal")?.addEventListener("keydown", e => {
    e.preventDefault();
  });
  document.getElementById("annualTotal")?.addEventListener("keydown", e => {
    e.preventDefault();
  });

  document.querySelectorAll(".mobile-input").forEach(input => {
    input.addEventListener("input", e => {
      // Digits only
      let v = e.target.value.replace(/\D/g, "");

      // Limit to exactly 10 digits
      if (v.length > 10) v = v.slice(0, 10);

      e.target.value = v;

      // Auto-clear error when valid
      if (v.length === 10) {
        clearError(e.target);
      }
    });
  });

  const isBlank = v => !v || !v.trim();
  const isAlpha = v => typeof v === "string" && /^[A-Za-z ]+$/.test(v.trim());
  const isDigits = v => /^\d+$/.test(v);
  const inRange = (v, min, max) => Number(v) >= min && Number(v) <= max;

  const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;


  /* =========================================================
    PAN + AADHAAR
  ========================================================= */
  const panInput = document.getElementById("panDisplay");
  const panHidden = document.getElementById("pan");
  const aadhaarInput = document.getElementById("aadhaarDisplay");
  const aadhaarHidden = document.getElementById("aadhaar");

  // ===== PAN =====
  panInput?.addEventListener("input", e => {
    if (isRestoring) return;

    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (v.length > 10) v = v.slice(0, 10);

    if (panPattern.test(v)) {
      realPan = v;
      panHidden.value = v; // Sync hidden
      e.target.value = v.slice(0, 2) + "****" + v.slice(6);
      clearError(panInput);
    } else {
      realPan = "";
      panHidden.value = "";
      e.target.value = v;
    }
  });

  panInput?.addEventListener("focus", () => {
    if (realPan) panInput.value = realPan;
  });

  panInput?.addEventListener("blur", () => {
    if (realPan && panPattern.test(realPan)) {
      panInput.value = realPan.slice(0, 2) + "****" + realPan.slice(6);
    }
  });


  // ===== AADHAAR =====
  aadhaarInput?.addEventListener("input", e => {
    if (isRestoring) return;

    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 12) v = v.slice(0, 12);

    if (aadhaarPlain.test(v)) {
      realAadhaar = v;
      aadhaarHidden.value = v; // Sync hidden
      e.target.value = "XXXXXXXX" + v.slice(8);
      clearError(aadhaarInput);
    } else {
      realAadhaar = "";
      aadhaarHidden.value = "";
      e.target.value = v;
    }
  });

  aadhaarInput?.addEventListener("focus", () => {
    if (realAadhaar) aadhaarInput.value = realAadhaar;
  });

  aadhaarInput?.addEventListener("blur", () => {
    if (realAadhaar && aadhaarPlain.test(realAadhaar)) {
      aadhaarInput.value = "XXXXXXXX" + realAadhaar.slice(8);
    }
  });


  /* =========================================================
   BANK ACCOUNT
 ========================================================= */

  const bankAccInput = document.getElementById("bankAccountDisplay");
  const bankAccHidden = document.getElementById("bankAccount");

  // While typing → allow up to 18 digits, show real value
  bankAccInput?.addEventListener("input", e => {
    if (isRestoring) return;

    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 18) v = v.slice(0, 18);

    realBankAccount = v;
    bankAccHidden.value = v;

    // Show real value while typing (NOT masked)
    e.target.value = v;
  });

  // On focus → show real number
  bankAccInput?.addEventListener("focus", () => {
    if (realBankAccount) {
      bankAccInput.value = realBankAccount;
    }
  });

  // On blur → mask if valid length (8-18 digits)
  bankAccInput?.addEventListener("blur", () => {
    if (realBankAccount.length >= 8) {
      bankAccInput.value = "XXXXXX" + realBankAccount.slice(-4);
    }
  });

  /* =========================================================
    STEP 1 – PERSONAL
  ========================================================= */
  const dobInput = document.getElementById("dob");
  const ageInput = document.getElementById("age");

  // Assign to higher-scope variables
  maritalStatus = document.getElementById("maritalStatus");
  marriageDate = document.getElementById("marriageDate");
  childrenCount = document.getElementById("childrenCount");
  prolongedIllness = document.getElementById("illness");
  illnessName = document.getElementById("illnessName");
  illnessDuration = document.getElementById("illnessDuration");
  const savedEmail =
    localStorage.getItem("email") || sessionStorage.getItem("email");

  if (savedEmail) {
    document.getElementById("email").value = savedEmail;
  }

  document.getElementById("permanentAddress")?.addEventListener("input", e => {
    if (e.target.value.length > 25) {
      e.target.value = e.target.value.slice(0, 25);
    }
  });

  /* ---------- DOB → AGE ---------- */
  dobInput?.addEventListener("change", () => {
    if (!dobInput.value) {
      ageInput.value = "";
      if (marriageDate) marriageDate.removeAttribute("min");
      return;
    }
    const dob = new Date(dobInput.value);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    if (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate())) {
      age--;
    }
    ageInput.value = age >= 0 ? age : "";

    // Set min marriage date (DOB + 18 years)
    if (marriageDate) {
      const minMarriage = new Date(dob);
      minMarriage.setFullYear(minMarriage.getFullYear() + 18);
      marriageDate.min = minMarriage.toISOString().split("T")[0];
    }
  });

  maritalStatus?.addEventListener("change", toggleMaritalFields);

  prolongedIllness?.addEventListener("change", toggleIllnessFields);

  function syncMaskedKYC() {
    if (
      !realPan &&
      panInput.value &&
      panPattern.test(panInput.value)
    ) {
      realPan = panInput.value;
    }

    if (
      !realAadhaar &&
      aadhaarInput.value &&
      /^\d{12}$/.test(aadhaarInput.value)
    ) {
      realAadhaar = aadhaarInput.value;
    }
  }

  function validateKYC(silent = false) {
    syncMaskedKYC();
    let ok = true;

    clearError(panInput);
    clearError(aadhaarInput);

    // ✅ PAN
    if (!realPan) {
      showError(panInput, "PAN is required", silent);
      ok = false;
    } else if (!panPattern.test(realPan)) {
      showError(panInput, "Invalid PAN format", silent);
      ok = false;
    }

    // ✅ Aadhaar
    if (!realAadhaar) {
      showError(aadhaarInput, "Aadhaar is required", silent);
      ok = false;
    } else if (!aadhaarPlain.test(realAadhaar)) {
      showError(aadhaarInput, "Aadhaar must be 12 digits", silent);
      ok = false;
    }

    return ok;
  }


  function validateStep1(silent = false) {
    if (isRestoring) return true; // ✅ Skip validation during restore
    const step = steps[0];
    if (!silent) clearStepErrors(step);
    let ok = true;

    const fn = step.querySelector("#firstName");
    const ln = step.querySelector("#lastName");
    const dob = step.querySelector("#dob");
    const age = step.querySelector("#age");

    // ----- Religion / Nationality / Parents (REQUIRED) -----
    const religion = step.querySelector("#religion");
    const nationality = step.querySelector("#nationality");
    const father = step.querySelector("#fatherName");
    const mother = step.querySelector("#motherName");

    if (religion && !religion.value?.trim()) {
      showError(religion, "Religion is required", silent);
      ok = false;
    }

    if (nationality && !nationality.value?.trim()) {
      showError(nationality, "Nationality is required", silent);
      ok = false;
    }

    if (father && !isValidPersonName(father.value)) {
      showError(father, "Valid father's name required", silent);
      ok = false;
    }

    if (mother && !isValidPersonName(mother.value)) {
      showError(mother, "Valid mother's name required", silent);
      ok = false;
    }

    if (dob && (!dob.value || isFutureDate(dob.value))) {
      showError(dob, "Invalid DOB", silent);
      ok = false;
    }

    if (age && +age.value < 18) {
      showError(age, "Age must be ≥ 18", silent);
      ok = false;
    }

    if (fn && (!minLen(fn.value, 2) || !isAlpha(fn.value))) {
      showError(fn, "Invalid first name", silent);
      ok = false;
    }

    if (ln && (!minLen(ln.value, 1) || !isAlpha(ln.value))) {
      showError(ln, "Invalid last name", silent);
      ok = false;
    }

    if (maritalStatus && !maritalStatus.value) {
      showError(maritalStatus, "Marital status is required", silent);
      ok = false;
    }

    if (maritalStatus?.value === "Married") {
      if (marriageDate && !marriageDate.value) {
        showError(marriageDate, "Marriage date required", silent);
        ok = false;
      }
      if (childrenCount && (childrenCount.value === "" || +childrenCount.value < 0)) {
        showError(childrenCount, "Enter valid children count", silent);
        ok = false;
      }
    }

    if (prolongedIllness && !prolongedIllness.value) {
      showError(prolongedIllness, "Please select illness status", silent);
      ok = false;
    }

    if (!validateKYC(silent)) ok = false;

    if (prolongedIllness?.value === "Yes") {
      if (illnessName && !illnessName.value.trim()) {
        showError(illnessName, "Illness name required", silent);
        ok = false;
      }
      if (illnessDuration && !illnessDuration.value.trim()) {
        showError(illnessDuration, "Duration required", silent);
        ok = false;
      }
    }

    const disability = step.querySelector("#disability");
    if (!disability?.value) {
      showError(disability, "Please select physical disability status", silent);
      ok = false;
    }

    ["mobile1", "mobile2"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!/^\d{10}$/.test(el.value)) {
        showError(el, "Enter 10 digit mobile number", silent);
        ok = false;
      }
    });

    // ----- Gender -----
    const genderGroup = step.querySelector(".gender-group");
    const genderChecked = step.querySelector("input[name='gender']:checked");

    if (!genderChecked) {
      if (genderGroup) {
        clearError(genderGroup);
        showError(genderGroup, "Required", silent);
      }
      ok = false;
    }
    // ----- Place of Birth  -----
    const pob = step.querySelector("#placeOfBirth");

    if (isBlank(pob.value)) {
      showError(pob, "Place of birth is required", silent);
      ok = false;
    } else if (!isAlpha(pob.value)) {
      showError(pob, "Alphabets only", silent);
      ok = false;
    }

    const state = step.querySelector("#state");
    if (!state?.value) {
      showError(state, "State is required", silent);
      ok = false;
    }
    // ----- Marriage Date ≤ Today & Minimum Age 18 -----
    if (maritalStatus.value === "Married" && marriageDate.value) {
      if (isFutureDate(marriageDate.value)) {
        showError(marriageDate, "Marriage date cannot be future", silent);
        ok = false;
      } else if (dob.value) {
        const dobVal = new Date(dob.value);
        const mDateVal = new Date(marriageDate.value);
        let mAge = mDateVal.getFullYear() - dobVal.getFullYear();
        if (mDateVal < new Date(mDateVal.getFullYear(), dobVal.getMonth(), dobVal.getDate())) {
          mAge--;
        }
        if (mAge < 18) {
          showError(marriageDate, "Minimum age for marriage is 18", silent);
          ok = false;
        }
      }
    }

    // ----- Address Length -----
    ["permanentAddress"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (
        isBlank(el.value) ||
        el.value.trim().length < 10 ||
        el.value.trim().length > 25
      ) {
        showError(el, "Address must be 10–25 characters", silent);
        ok = false;
      }
    });

    // ----- Height / Weight -----
    const feet = document.getElementById("heightFeet");
    const weight = document.getElementById("weight");


    if (isBlank(feet.value)) {
      showError(feet, "Height is required", silent);
      ok = false;
    } else if (!heightPattern.test(feet.value.trim())) {
      showError(
        feet,
        "Enter height in feet'inches format (e.g. 5'8, 6'2)",
        silent
      );
      ok = false;
    }

    if (isBlank(weight.value)) {
      showError(weight, "Weight is required", silent);
      ok = false;
    } else if (!inRange(weight.value, 30, 300)) {
      showError(weight, "Weight must be 30–300 kg", silent);
      ok = false;
    }

    if (!realBankAccount || !/^\d{8,18}$/.test(realBankAccount)) {
      showError(bankAccInput, "Required Account number(8-18 digits)", silent);
      ok = false;
    }



    // ----- Bank Name -----
    const bankName = step.querySelector("#bankName");

    if (!isValidBankOrBranch(bankName?.value)) {
      showError(bankName, "Enter valid bank name", silent);
      ok = false;
    }

    // ----- Branch Name -----
    const branch = step.querySelector("#branch");

    if (!isValidBankOrBranch(branch?.value)) {
      showError(branch, "Enter valid branch name", silent);
      ok = false;
    }

    const ifsc = document.getElementById("ifsc");
    if (!ifscPattern.test(ifsc.value)) {
      showError(ifsc, "Invalid IFSC Code", silent);
      ok = false;
    }

    // ----- Email -----
    const email = step.querySelector("#email");

    if (isBlank(email.value)) {
      showError(email, "Email is required", silent);
      ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      showError(email, "Enter a valid email address", silent);
      ok = false;
    }

    if (isRestoring) return true;

    if (!ok && !silent) {
      showSummaryError(
        step,
        "Please correct the highlighted errors before continuing"
      );

      // Try focusing first error
      const firstError = step.querySelector(".input-error") || step.querySelector(".error");
      if (firstError) {
        focusFirstError(step);
      } else {
        shakeCurrentStep();
      }
    }
    return ok;
  }


  /* =========================================================
    STEP 2 – FAMILY
  ========================================================= */

  function validateStep2(silent = false) {
    if (isRestoring) return true; // ✅ Skip
    const step = steps[1];
    if (!silent) clearStepErrors(step);
    let ok = true;

    const tbody = document.getElementById("familyTableBody");
    const rows = tbody?.querySelectorAll("tr") || [];

    if (!rows.length) {
      showStepError(step, "Add at least one family member", silent);
      return false;
    }

    const seen = new Set();

    rows.forEach(row => {

      const rel = row.querySelector("select[name*='relationship']");
      const name = row.querySelector("input[name*='name']");
      const dob = row.querySelector("input[name*='dob']");
      const dep = row.querySelector("select[name*='dependent']");
      const occupation = row.querySelector("input[name*='occupation']");
      const income = row.querySelector("input[name*='income']");

      if (!rel?.value) {
        showError(rel, "Relationship required", silent);
        ok = false;
      }

      if (!isAlpha(name?.value)) {
        showError(name, "Valid name required", silent);
        ok = false;
      }

      if (!dob?.value || isFutureDate(dob.value)) {
        showError(dob, "Invalid DOB", silent);
        ok = false;
      }

      // Occupation required
      if (!occupation || occupation.value.trim().length === 0) {
        showError(occupation, "Occupation is required", silent);
        ok = false;
      }


      if (!income || income.value === "") {
        showError(income, "Income is required", silent);
        ok = false;
      }

      if (!dep?.value) {
        showError(dep, "Dependent status required", silent);
        ok = false;
      }

      if (income && Number(income.value) < 0) {
        showError(income, "Income cannot be negative", silent);
        ok = false;
      }

      // Only one Father / Mother / Spouse
      if (["Father", "Mother", "Spouse"].includes(rel?.value)) {
        if (seen.has(rel.value)) {
          showError(rel, `Only one ${rel.value} allowed`, silent);
          ok = false;
        }
        seen.add(rel.value);
      }

      // ✅ Parent age validation
      if (
        (rel?.value === "Father" || rel?.value === "Mother") &&
        dob?.value &&
        dobInput?.value
      ) {
        const parentDOB = new Date(dob.value);
        const candidateDOB = new Date(dobInput.value);

        if (parentDOB >= candidateDOB) {
          showError(dob, "Parent must be older than candidate", silent);
          ok = false;
        }
      }

    });

    if (!ok && !silent) {
      showSummaryError(step, "Please correct the highlighted errors before continuing");
      focusFirstError(step);
    }
    return ok;
  }

  /* =========================================================
    STEP 3 – EDUCATION
  ========================================================= */

  function validateStep3(silent = false) {
    if (isRestoring) return true; // ✅ Skip
    const step = steps[2];
    if (!step) return true;

    if (!silent) clearStepErrors(step);

    let ok = true;
    let firstError = null;

    /* ======================================================
       1️⃣ GRADUATION VALIDATION
    ====================================================== */

    const gradRows = document.querySelectorAll(
      ".graduation-wrapper table tbody tr, #extraGraduations table tbody tr"
    );

    if (!gradRows.length) {
      showStepError(step, "At least one education record is required", silent);
      return false;
    }

    gradRows.forEach((row, index) => {
      const college = row.querySelector("input[name='grad_college[]']");
      const board = row.querySelector("input[name='grad_board[]']");
      const degree = row.querySelector("input[name='grad_degree[]']");
      const stream = row.querySelector("input[name='grad_stream[]']");
      const joining = row.querySelector("input[name='grad_joining[]']");
      const leaving = row.querySelector("input[name='grad_leaving[]']");
      const percent = row.querySelector("input[name='grad_aggregate[]']");

      const isFirstRow = index === 0;

      const anyFilled = [
        college, board, degree, stream,
        joining, leaving, percent
      ].some(el => el && el.value.trim() !== "");

      // First row mandatory OR partially filled row must be complete
      if (isFirstRow || anyFilled) {

        [college, board, degree, stream, joining, leaving, percent]
          .forEach(el => {
            if (!el || !el.value.trim()) {
              markError(el, "Required");
              if (!firstError) firstError = el;
              ok = false;
            }
          });

        // Joining year
        if (joining?.value && !/^\d{4}$/.test(joining.value)) {
          markError(joining, "Enter valid 4-digit year");
          if (!firstError) firstError = joining;
          ok = false;
        }

        // Leaving year
        if (leaving?.value && !/^\d{4}$/.test(leaving.value)) {
          markError(leaving, "Enter valid 4-digit year");
          if (!firstError) firstError = leaving;
          ok = false;
        }

        // Year comparison
        if (joining?.value && leaving?.value) {
          if (parseInt(leaving.value) <= parseInt(joining.value)) {
            markError(leaving, "Leaving year must be after joining year");
            if (!firstError) firstError = leaving;
            ok = false;
          }
        }

        // Percentage validation
        if (percent?.value) {
          const p = parseFloat(percent.value);
          if (isNaN(p) || p < 0 || p > 100) {
            markError(percent, "Percentage must be 0–100");
            if (!firstError) firstError = percent;
            ok = false;
          }
        }
      }
    });

    /* ======================================================
       1.1️⃣ INTERMEDIATE VALIDATION
    ====================================================== */

    const interFields = [
      "inter_college", "inter_board", "inter_stream",
      "inter_joining", "inter_leaving", "inter_aggregate"
    ];

    interFields.forEach(name => {
      const el = document.querySelector(`input[name="${name}"]`);
      if (!el) return;
      if (!el.value.trim()) {
        markError(el, "Required");
        if (!firstError) firstError = el;
        ok = false;
      } else {
        // Numerical / Year specific checks
        if (name.includes("joining") || name.includes("leaving")) {
          if (!/^\d{4}$/.test(el.value)) {
            markError(el, "Enter valid 4-digit year");
            if (!firstError) firstError = el;
            ok = false;
          }
        }
        if (name.includes("aggregate")) {
          const p = parseFloat(el.value);
          if (isNaN(p) || p < 0 || p > 100) {
            markError(el, "Percentage 0–100");
            if (!firstError) firstError = el;
            ok = false;
          }
        }
      }
    });

    // Intermediate Year Comparison
    const interJoin = document.querySelector('input[name="inter_joining"]');
    const interLeave = document.querySelector('input[name="inter_leaving"]');
    if (interJoin?.value && interLeave?.value) {
      if (parseInt(interLeave.value) <= parseInt(interJoin.value)) {
        markError(interLeave, "Leaving year must be after joining year");
        if (!firstError) firstError = interLeave;
        ok = false;
      }
    }

    /* ======================================================
       1.2️⃣ 10TH / SCHOOLING VALIDATION
    ====================================================== */

    const schoolFields = [
      "school_name", "school_board", "school_joining",
      "school_leaving", "school_aggregate"
    ];

    schoolFields.forEach(name => {
      const el = document.querySelector(`input[name="${name}"]`);
      if (!el) return;
      if (!el.value.trim()) {
        markError(el, "Required");
        if (!firstError) firstError = el;
        ok = false;
      } else {
        if (name.includes("joining") || name.includes("leaving")) {
          if (!/^\d{4}$/.test(el.value)) {
            markError(el, "Enter valid 4-digit year");
            if (!firstError) firstError = el;
            ok = false;
          }
        }
        if (name.includes("aggregate")) {
          const p = parseFloat(el.value);
          if (isNaN(p) || p < 0 || p > 100) {
            markError(el, "Percentage 0–100");
            if (!firstError) firstError = el;
            ok = false;
          }
        }
      }
    });

    // School Year Comparison
    const schJoin = document.querySelector('input[name="school_joining"]');
    const schLeave = document.querySelector('input[name="school_leaving"]');
    if (schJoin?.value && schLeave?.value) {
      if (parseInt(schLeave.value) <= parseInt(schJoin.value)) {
        markError(schLeave, "Leaving year must be after joining year");
        if (!firstError) firstError = schLeave;
        ok = false;
      }
    }

    /* ======================================================
       1.3️⃣ CROSS-VALIDATION OF EDUCATION YEARS
    ====================================================== */
    const interJoinVal = interJoin?.value ? parseInt(interJoin.value) : null;
    const interLeaveVal = interLeave?.value ? parseInt(interLeave.value) : null;
    const schLeaveVal = schLeave?.value ? parseInt(schLeave.value) : null;

    if (schLeaveVal) {
      if (interJoinVal && interJoinVal < schLeaveVal) {
        markError(interJoin, "Must be >= 10th leaving year");
        if (!firstError) firstError = interJoin;
        ok = false;
      }
      if (interLeaveVal && interLeaveVal <= schLeaveVal) {
        markError(interLeave, "Must be > 10th leaving year");
        if (!firstError) firstError = interLeave;
        ok = false;
      }
    }

    if (interLeaveVal) {
      gradRows.forEach(row => {
        const gJoinEl = row.querySelector("input[name='grad_joining[]']");
        const gLeaveEl = row.querySelector("input[name='grad_leaving[]']");
        const gJoinVal = gJoinEl?.value ? parseInt(gJoinEl.value) : null;
        const gLeaveVal = gLeaveEl?.value ? parseInt(gLeaveEl.value) : null;

        if (gJoinVal && gJoinVal < interLeaveVal) {
          markError(gJoinEl, "Must be >= Inter leaving year");
          if (!firstError) firstError = gJoinEl;
          ok = false;
        }
        if (gLeaveVal && gLeaveVal <= interLeaveVal) {
          markError(gLeaveEl, "Must be > Inter leaving year");
          if (!firstError) firstError = gLeaveEl;
          ok = false;
        }
      });
    }

    /* ======================================================
       2️⃣ LANGUAGE VALIDATION
    ====================================================== */

    const languageRows = document.querySelectorAll("#languageTable tbody tr");

    languageRows.forEach(row => {
      const langInput = row.querySelector("input[type='text']");
      const speak = row.querySelector("input[name*='speak']");
      const read = row.querySelector("input[name*='read']");
      const write = row.querySelector("input[name*='write']");

      const anySkill = speak?.checked || read?.checked || write?.checked;

      if (!langInput.value.trim() && !anySkill) return;

      if (!langInput.value.trim()) {
        markError(langInput, "Language required");
        if (!firstError) firstError = langInput;
        ok = false;
      }
      if (!anySkill) {
        markError(langInput, "Select any of them");
        if (!firstError) firstError = langInput;
        ok = false;
      }
    });

    /* ======================================================
       3️⃣ MOTHER TONGUE VALIDATION
    ====================================================== */

    const motherChecked = document.querySelectorAll(
      'input[name="motherTongue"]:checked'
    );

    if (motherChecked.length !== 1) {
      document
        .querySelectorAll('input[name="motherTongue"]')
        .forEach(r => r.closest("td")?.classList.add("input-error"));

      if (!firstError) {
        firstError = document.querySelector('input[name="motherTongue"]');
      }

      ok = false;
    }

    /* ======================================================
       4️⃣ STRENGTHS / WEAKNESSES / VALUES VALIDATION
    ====================================================== */

    ["strengths", "Weaknesses", "Values"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!el.value.trim()) {
        markError(el, "This field is required");
        if (!firstError) firstError = el;
        ok = false;
      }
    });

    /* ======================================================
       5️⃣ PROFESSIONAL BODY & HONORS VALIDATION
    ====================================================== */

    ["memberOfProfessionalBody", "specialHonors"].forEach(name => {
      const el = document.querySelector(`select[name="${name}"]`);
      if (!el) return;

      if (!el.value) {
        markError(el, "Please select an option");
        if (!firstError) firstError = el;
        ok = false;
      } else if (el.value === "Yes") {
        const details = el.parentElement.querySelector("textarea");
        if (details && !details.value.trim()) {
          markError(details, "Details are required if YES is selected");
          if (!firstError) firstError = details;
          ok = false;
        }
      }
    });

    /* ======================================================
       FINAL ERROR HANDLING
    ====================================================== */

    if (!ok && !silent) {
      showSummaryError(
        step,
        "Please correct the highlighted errors before continuing"
      );

      if (firstError) {
        firstError.scrollIntoView({ behavior: "smooth", block: "center" });
        firstError.focus();
      } else {
        shakeCurrentStep();
      }
    }

    return ok;
  }


  /* =========================================================
    STEP 4 – EXPERIENCE
  ========================================================= */

  function validateStep4(silent = false) {
    if (isRestoring) return true; // ✅ Skip
    const step = steps[3];
    if (!silent) clearStepErrors(step);

    let ok = true;

    const yearsEl = step.querySelector("#expYears");
    const monthsEl = step.querySelector("#expMonths");

    const years = Number(yearsEl.value);
    const months = Number(monthsEl.value);

    /* ================= TOTAL EXPERIENCE (REQUIRED) ================= */

    if (yearsEl.value.trim() === "" || years < 0) {
      showError(yearsEl, "Experience years is required", silent);
      ok = false;
    }

    if (monthsEl.value.trim() === "" || months < 0 || months > 11) {
      showError(monthsEl, "Experience months is required (0–11)", silent);
      ok = false;
    }

    const hasExperience = years > 0 || months > 0;

    /* ================= EXPERIENCE DATE VALIDATION ================= */
    const fromDateEl = step.querySelector("#expFrom");
    const toDateEl = step.querySelector("#expTo");

    if (hasExperience && fromDateEl && toDateEl) {
      if (!fromDateEl.value) {
        showError(fromDateEl, "From date is required", silent);
        ok = false;
      } else if (isFutureDate(fromDateEl.value)) {
        showError(fromDateEl, "From date cannot be in the future", silent);
        ok = false;
      }

      if (!toDateEl.value) {
        showError(toDateEl, "To date is required", silent);
        ok = false;
      } else if (isFutureDate(toDateEl.value)) {
        showError(toDateEl, "To date cannot be in the future", silent);
        ok = false;
      }

      if (fromDateEl.value && toDateEl.value) {

        const fromDate = new Date(fromDateEl.value);
        const toDate = new Date(toDateEl.value);

        if (toDate <= fromDate) {
          showError(toDateEl, "To Date must be greater than From Date", silent);
          ok = false;
        }
      }
    }

    /* ================= UAN (REQUIRED IF EXPERIENCED) ================= */
    const uan = document.getElementById("uan");
    if (hasExperience && uan) {
      if (!/^\d{12}$/.test(uan.value)) {
        showError(uan, "UAN must be exactly 12 digits", silent);
        ok = false;
      }
    }

    if (hasExperience) {

      /* ================= EMPLOYMENT HISTORY ================= */
      step
        .querySelectorAll("#experienceDetails input, #experienceDetails textarea")
        .forEach(el => {
          if (isSkippable(el)) return;

          if (!el.value.trim()) {
            showError(el, "This field is required", silent);
            ok = false;
          }
        });


      /* ================= ASSIGNMENTS HANDLED ================= */
      step
        .querySelectorAll("#assignmentsHandled input, #assignmentsHandled textarea")
        .forEach(el => {
          if (isSkippable(el)) return;

          if (!el.value.trim()) {
            showError(el, "This field is required", silent);
            ok = false;
          }
        });

    }
    if (!ok && !silent) {
      if (hasExperience) {
        showSummaryError(
          step,
          "Please fill all the fields"
        );
      } else {
        showSummaryError(
          step,
          "Please enter valid Total Experience details"
        );
      }
      focusFirstError(step);
    }
    return ok;
  }

  /* =========================================================
  STEP 5
  ========================================================= */
  const step5 = steps[4];

  const loanAvailed = document.getElementById("loanAvailed");
  const loanFields = document.getElementById("loanFields");

  const loanPurpose = document.getElementById("loanPurpose");
  const loanAmount = document.getElementById("loanAmount");
  const loanBalance = document.getElementById("loanBalance");
  const loanSalary = document.getElementById("loanSalary");


  function toggleLoanFields() {
    const show = loanAvailed?.value === "Yes";

    if (loanFields) loanFields.style.display = show ? "grid" : "none";

    if (!show) {
      [loanPurpose, loanAmount, loanBalance, loanSalary].forEach(el => {
        if (el) {
          el.value = "";
          clearError(el);
        }
      });
    }
  }




  // ================= EVENT LISTENERS =================

  // Loan toggle
  loanAvailed?.addEventListener("change", toggleLoanFields);
  toggleLoanFields(); // initial UI sync

  // Salary auto calculation
  step5
    ?.querySelectorAll("#salarySection .family-table input[type='number']")
    .forEach(i => {
      i.addEventListener("input", e => {
        if (+e.target.value < 0) e.target.value = 0;
        autoCalculateSalary();
      });
    });

  // ================= STEP 5 – VALIDATION =================
  function validateStep5(silent = false) {
    if (isRestoring) return true; // ✅ Skip
    const step = steps[4];
    let ok = true;

    if (!silent) clearStepErrors(step);

    /* ===== Interview Conditional Validation ===== */
    const interviewDropdown = step.querySelector("#interviewedBefore");
    const interviewDate = step.querySelector("#interviewDate");
    const interviewPlace = step.querySelector("#interviewPlace");
    const interviewerName = step.querySelector("#interviewerName");
    const interviewPost = step.querySelector("#interviewPost");

    if (!interviewDropdown?.value) {
      showError(interviewDropdown, "Please select an option", silent);
      ok = false;
    }

    if (interviewDropdown?.value === "Yes") {

      if (!interviewDate?.value) {
        showError(interviewDate, "Interview date is required", silent);
        ok = false;
      }

      if (!interviewPlace?.value.trim()) {
        showError(interviewPlace, "Place is required", silent);
        ok = false;
      }

      if (!interviewerName?.value.trim()) {
        showError(interviewerName, "Interviewer name is required", silent);
        ok = false;
      }

      if (!interviewPost?.value.trim()) {
        showError(interviewPost, "Post is required", silent);
        ok = false;
      }
    }

    const years = Number(document.getElementById("expYears")?.value || 0);
    const months = Number(document.getElementById("expMonths")?.value || 0);
    const hasExperience = years > 0 || months > 0;

    /* ===== ALWAYS REQUIRED ===== */
    const declaration = step.querySelector("#declaration");
    const declDate = step.querySelector("#declDate");
    const declPlace = step.querySelector("#declPlace");

    if (!declaration?.checked) {
      showError(declaration, "Declaration is required", silent);
      ok = false;
    }

    if (!declDate?.value) {
      showError(declDate, "Date required", silent);
      ok = false;
    }

    if (!declPlace?.value?.trim()) {
      showError(declPlace, "Place required", silent);
      ok = false;
    }

    /* ===== SIGNATURE VALIDATION ===== */
    const sigBase64 = document.getElementById("signatureBase64")?.value;
    if (!sigBase64) {
      const container = document.querySelector(".signature-upload-container");
      const sigError = document.getElementById("signatureError");
      if (container) container.classList.add("input-error");
      if (sigError && !silent) {
        sigError.textContent = "Signature is required";
        sigError.style.display = "block";
      }
      ok = false;
    }

    /* ===== LOAN AVAILED (MANDATORY SELECTION) ===== */
    if (!loanAvailed?.value) {
      showError(loanAvailed, "Please select Loan Availed (Yes / No)", silent);
      ok = false;
    }

    /* ===== IF YES → LOAN DETAILS REQUIRED ===== */
    if (loanAvailed?.value === "Yes") {
      loanFields && (loanFields.style.display = "grid");

      if (!loanPurpose?.value.trim()) {
        showError(loanPurpose, "Loan purpose is required", silent);
        ok = false;
      }

      if (!(+loanAmount?.value > 0)) {
        showError(loanAmount, "Enter valid loan amount", silent);
        ok = false;
      }

      if (
        loanBalance?.value === "" ||
        +loanBalance.value < 0 ||
        +loanBalance.value > +loanAmount.value
      ) {
        showError(
          loanBalance,
          "Balance must be between 0 and Loan Amount",
          silent
        );
        ok = false;
      }

      if (!(+loanSalary?.value > 0)) {
        showError(loanSalary, "Enter salary amount", silent);
        ok = false;
      }
    }


    /* ================= EXPERIENCE DEPENDENT ================= */
    if (hasExperience) {

      // ✅ Ensure sections visible
      const salarySection = document.getElementById("salarySection");
      const referenceSection = document.getElementById("referenceSection");
      const otherSection = document.getElementById("otherParticulars");

      if (salarySection) salarySection.style.display = "block";
      if (referenceSection) referenceSection.style.display = "block";
      if (otherSection) otherSection.style.display = "block";


      /* ================= PRESENT SALARY (REQUIRED) ================= */
      step.querySelectorAll("#salarySection input").forEach(el => {
        // Skip explicitly allowed optional fields
        if (isSkippable(el)) return;

        // // FINAL OVERRIDE for "Others" fields - Ensure they are NEVER required
        // if (el.id === "monthlyOthers" || el.name === "monthlyOthers" || 
        //     el.id === "statutoryOthers" || el.name === "statutoryOthers") {
        //   return;
        // }

        if (!el.value.trim()) {
          showError(el, "This field is required", silent);
          ok = false;
        }
      });



      /* ================= OTHER PARTICULARS (REQUIRED) ================= */
      otherSection
        ?.querySelectorAll("input, select, textarea")
        .forEach(el => {
          if (el.offsetParent === null) return;
          if (isSkippable(el)) return;

          if (el.id === "joiningDays") {
            const val = parseInt(el.value);
            if (!el.value.trim()) {
              showError(el, "Required", silent);
              ok = false;
            } else if (isNaN(val) || val < 0 || val > 99) {
              showError(el, "Must be between 0 and 99", silent);
              ok = false;
            }
            return;
          }

          if (!el.value.trim()) {
            showError(el, "Required", silent);
            ok = false;
          }
        });

      /* ================= REFERENCES  ================= */
      const refTable = step5.querySelector(".family-table");
      if (refTable) refTable.style.display = "table";

      const refs = refTable?.querySelectorAll("tbody tr") || [];
      let validRefs = 0;

      refs.forEach(row => {
        const inputs = row.querySelectorAll("input");
        const filled = [...inputs].some(i => !isBlank(i.value));

        if (filled) {
          validRefs++;
          inputs.forEach(i => {
            if (isBlank(i.value)) {
              showError(i, "Required", silent);
              ok = false;
            }
          });
        }
      });

      if (validRefs === 0 && refs.length > 0) {
        refs[0]
          .querySelectorAll("input")
          .forEach(i => showError(i, "Required", silent));

        showStepError(step5, "At least one complete reference is required", silent);
        ok = false;
      }
    }
    /* ================= LOAN (ONLY IF YES) ================= */
    if (loanAvailed?.value === "Yes" && loanFields) {
      loanFields && (loanFields.style.display = "grid");

      if (!loanPurpose?.value.trim()) {
        showError(loanPurpose, "Loan purpose required", silent);
        ok = false;
      }

      if (!(+loanAmount.value > 0)) {
        showError(loanAmount, "Enter valid loan amount", silent);
        ok = false;
      }

      if (!(+loanBalance.value >= 0 && +loanBalance.value <= +loanAmount.value)) {
        showError(
          loanBalance,
          "Balance must be ≥ 0 and ≤ Loan Amount",
          silent
        );
        ok = false;
      }

      if (!(+loanSalary.value > 0)) {
        showError(loanSalary, "Enter Salary", silent);
        ok = false;
      }
    }

    /* ================= SUMMARY ================= */
    if (!ok && !silent) {
      showSummaryError(
        step5,
        "Please correct the highlighted errors before continuing"
      );

      const errorElements = Array.from(step5.querySelectorAll(".input-error"));
      console.warn("Validation failed for step: 4. The following fields have errors:", errorElements.map(e => e.name || e.id || "Unknown field"));

      focusFirstError(step5);
    }

    return ok;
  }
  ////////////////////////////////////////
  /*-----------------------Step-6--------------------------- */
  ////////////////////////////////////////
  function validateStep6(silent = false) {
    if (isRestoring) return true; // ✅ Skip
    const step = steps[5];
    let ok = true;

    if (!mediclaimConsent.value) {
      showStepError(step, "Please select Mediclaim consent", silent);
      ok = false;
    }

    if (mediclaimConsent.value === "Yes") {
      const sigBase64 = document.getElementById("signatureBase64")?.value;
      if (!sigBase64) {
        const sigContainer = step.querySelector(".signature-upload-container");
        if (sigContainer) sigContainer.classList.add("input-error");
        showStepError(step, "Signature is required for Mediclaim enrollment", silent);
        ok = false;
      }
    }
    return ok;
  }

  const mediclaimYes = document.getElementById("mediclaimYes");
  const mediclaimNo = document.getElementById("mediclaimNo");
  const mediclaimDetails = document.getElementById("mediclaimDetails");
  const mediclaimConsent = document.getElementById("mediclaimConsent");

  function updateMediclaimVisibility() {
    if (!mediclaimYes || !mediclaimNo || !mediclaimDetails) return;

    if (mediclaimYes.checked) {
      mediclaimDetails.style.display = "block";
      mediclaimConsent.value = "Yes";
    } else if (mediclaimNo.checked) {
      mediclaimDetails.style.display = "none";
      mediclaimConsent.value = "No";
    } else {
      mediclaimDetails.style.display = "none";
      mediclaimConsent.value = "";
    }
  }

  if (mediclaimYes && mediclaimNo && mediclaimDetails) {
    mediclaimYes.addEventListener("change", updateMediclaimVisibility);
    mediclaimNo.addEventListener("change", updateMediclaimVisibility);
    updateMediclaimVisibility();
  }


  /* 🔹 SIDEBAR / STEPPER CLICK SUPPORT */
  const validators = [
    validateStep1,
    validateStep2,
    validateStep3,
    validateStep4,
    validateStep5,
    validateStep6
  ];

  function updateUI() {
    showStep(currentStep);
  }

  // ✅ FIX: window.goToStep now uses navigateToStep internally to avoid infinite recursion
  window.goToStep = function (index) {
    if (index > currentStep && !validators[currentStep](false)) return;
    navigateToStep(index);   // ← calls the safe internal function, NOT window.goToStep
    updateNextVisualState();
  };

  /* ===== NEXT BUTTON ===== */
  if (nextBtn) {
    nextBtn.onclick = () => {
      try {
        console.log("Navigating from step:", currentStep);
        const isValid = validators[currentStep](false);

        if (!isValid) {
          console.warn("Validation failed for step:", currentStep);
          shakeCurrentStep();
          return;
        }

        debouncedSaveDraft();
        navigateToStep(currentStep + 1);
      } catch (err) {
        console.error("Critical Next navigation error:", err);
        // Fallback to avoid dead button
        navigateToStep(currentStep + 1);
      }
    };
  }

  /* ===== PREVIOUS BUTTON ===== */
  if (prevBtn) {
    prevBtn.onclick = () => {
      debouncedSaveDraft();
      navigateToStep(currentStep - 1);
    };
  }

  /* ===== VISUAL STATE ONLY (NEVER DISABLE) ===== */
  function updateNextVisualState() {
    nextBtn.classList.remove("disabled"); // ✅ visual-only, never block logic
  }

  /* ✅ Clear field error immediately when user corrects it */
  mainForm.addEventListener("input", e => {
    const el = e.target;
    if (!el.classList.contains("input-error")) return;

    el.classList.remove("input-error");

    const msg = el.parentElement?.querySelector(".error-msg");
    if (msg) msg.remove();

    updateNextVisualState();
  });

  /* ================= SUBMIT ================= */
  document.getElementById("candidateForm").onsubmit = async e => {
    e.preventDefault();
    isSubmitting = true;
    debouncedSaveDraft(); // ✅ Final save before submit logic

    // ✅ FIX: Validate all steps without triggering goToStep navigation
    // Use navigateToStep + updateUI to display steps during validation loop
    for (let i = 0; i < steps.length; i++) {
      currentStep = i;
      updateUI();
      if (!validators[i](false)) {
        isSubmitting = false; // ✅ Reset flag so autosave can work again
        return;
      }
    }

    const payload = collectFormDataForSubmit();
    await submitFormOnlineOrOffline(payload);
  };


  ///////////////---------collectFormData-------////////////
  function collectFormDataForSubmit() {
    const form = document.getElementById("candidateForm");
    const data = {};

    form.querySelectorAll("input, select, textarea").forEach(el => {
      if (!el.name) return;
      const key = el.name;

      // ✅ Skip masked inputs
      if (key === "pan" || key === "aadhaar") return;

      if (el.type === "checkbox") {
        data[key] = el.checked;
      } else if (el.type === "radio") {
        if (el.checked) data[key] = el.value;
      } else {
        data[key] = el.value;
      }
    });

    // ✅ Always inject real values
    data.pan = realPan || "";
    data.aadhaar = realAadhaar || "";
    data.bankAccount = realBankAccount || "";

    return data;
  }

  async function submitFormOnlineOrOffline(payload) {
    if (!navigator.onLine) {
      await saveOffline(payload);
      alert("Offline: submission saved");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("API not available");

      // ✅ SUCCESS
      await clearDraft();

      // Update status for immediate transition
      sessionStorage.setItem("formStatus", "SUBMITTED");

      alert("Thank you for submitting the form");
      window.location.href = "login.html";

    } catch (err) {
      console.warn("Submit failed, saving offline", err);

      // ✅ FALLBACK
      await saveOffline(payload);
      alert("Saved offline. Will sync when back online.");
    }
  }

  (async () => {
    if (formStatus === "NEW") {
      sessionStorage.removeItem("serverDraft");
      await clearDraft(); // clear IndexedDB draft
    }

    updateUI();

    requestAnimationFrame(() => {
      if (typeof dobInput !== 'undefined' && dobInput?.value) {
        dobInput.dispatchEvent(new Event("change"));
      }
    });

    // Initial sync check
    if (navigator.onLine) {
      syncOfflineSubmissions();
    }
  })();

  updateUI();
  updateNextVisualState();
});