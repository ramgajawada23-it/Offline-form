
document.getElementById("candidateForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const titleValue = document.getElementById("title").value;
  console.log("TITLE VALUE:", titleValue, typeof titleValue);

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

  console.log("FINAL JSON SENT:", JSON.stringify(candidate));

  fetch("https://offlineform.onrender.com/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(candidate)
  })
    .then(res => res.json())
    .then(() => alert("Saved successfully"))
    .catch(err => console.error(err));
});


