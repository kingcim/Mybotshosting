document.getElementById("deployForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);
  document.getElementById("terminal").textContent = "⏳ Deploying...";

  const res = await fetch("/deploy", { method: "POST", body: formData });
  const data = await res.json();

  document.getElementById("terminal").textContent = JSON.stringify(data, null, 2);
});