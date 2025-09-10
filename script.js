// script.js
const usernameInput = document.getElementById("username");
const checkBtn = document.getElementById("checkBtn");
const checkMessage = document.getElementById("checkMessage");
const deployCard = document.getElementById("deployCard");
const credsFileInput = document.getElementById("credsFile");
const deployBtn = document.getElementById("deployBtn");
const logsCard = document.getElementById("logsCard");
const terminal = document.getElementById("terminal");
const stopLogsBtn = document.getElementById("stopLogs");

let evtSource = null;

function setTerminal(text, append = false) {
  if (!append) terminal.textContent = text;
  else {
    terminal.textContent += ("\n" + text);
    terminal.scrollTop = terminal.scrollHeight;
  }
}

checkBtn.addEventListener("click", async () => {
  const username = (usernameInput.value || "").trim();
  if (!username) {
    checkMessage.textContent = "Enter a GitHub username first.";
    return;
  }
  checkMessage.textContent = "Checking fork...";
  deployCard.hidden = true;
  logsCard.hidden = true;
  setTerminal("No logs yet.");

  try {
    const res = await fetch("/check-fork", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (!res.ok) {
      checkMessage.textContent = data.message || "Error checking fork.";
      return;
    }

    if (data.exists && data.fork) {
      checkMessage.textContent = "✅ Fork confirmed. You may deploy.";
      deployCard.hidden = false;
    } else if (data.exists && !data.fork) {
      checkMessage.innerHTML = `Repo found under ${username} but not recognized as a fork of the main repo. Ask the user to fork <a target="_blank" href="https://github.com/iconic05/Space-XMD/fork">here</a>.`;
      deployCard.hidden = true;
    } else {
      checkMessage.innerHTML = `Repo not found under ${username}. Ask them to fork <a target="_blank" href="https://github.com/iconic05/Space-XMD/fork">here</a> then come back.`;
      deployCard.hidden = true;
    }
  } catch (err) {
    console.error(err);
    checkMessage.textContent = "Network or server error while checking fork.";
  }
});

deployBtn.addEventListener("click", async () => {
  const username = (usernameInput.value || "").trim();
  if (!username) {
    checkMessage.textContent = "Enter username first.";
    return;
  }
  const file = credsFileInput.files[0];
  if (!file) {
    alert("Please upload creds.json before deploying.");
    return;
  }

  setTerminal("⏳ Starting deployment...");
  logsCard.hidden = false;

  const form = new FormData();
  form.append("username", username);
  form.append("creds", file);

  try {
    const res = await fetch("/deploy", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setTerminal("❌ Deployment failed: " + (json.message || JSON.stringify(json)));
      return;
    }

    const serviceId = json.serviceId || (json.service && json.service.id);
    setTerminal("✅ Deployment request accepted. Service ID: " + serviceId + "\nTailing logs...");
    // start SSE to stream logs
    if (evtSource) {
      evtSource.close();
      evtSource = null;
    }
    evtSource = new EventSource(`/stream-logs?serviceId=${encodeURIComponent(serviceId)}`);
    evtSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (!payload.ok) {
          setTerminal("Log stream error: " + (payload.error || JSON.stringify(payload)), true);
          return;
        }
        // payload.logs could be an array of log entries; print readable summary
        if (Array.isArray(payload.logs)) {
          payload.logs.forEach(item => {
            // Render a few shapes of possible log entries
            if (typeof item === "string") setTerminal(item, true);
            else if (item.message) setTerminal(item.message, true);
            else setTerminal(JSON.stringify(item), true);
          });
        } else {
          setTerminal(JSON.stringify(payload.logs), true);
        }
      } catch (err) {
        setTerminal("Error parsing log event: " + e.data, true);
      }
    };

    evtSource.onerror = (err) => {
      console.warn("EventSource error", err);
      // do not flood the terminal with errors
    };

  } catch (err) {
    console.error(err);
    setTerminal("Network or server error during deploy.");
  }
});

stopLogsBtn.addEventListener("click", () => {
  if (evtSource) {
    evtSource.close();
    evtSource = null;
    setTerminal("Log stream stopped by user.");
  }
});