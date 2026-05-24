const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const tokenBox = document.getElementById("tokenBox");
const charList = document.getElementById("charList");
const schedBox = document.getElementById("scheduleBox");


function renderChars(roles) {
  const charList =
    document.getElementById("charList");

  charList.innerHTML = "";

  for (const role of roles) {
    const div = document.createElement("div");

    div.className = "char-row";

    div.innerHTML = `
            <span class="char-avatar">
                <img src=${role.avatar}>
            </span>

            <span class="char-name">
                ${role.name}
            </span>

            <span>
                #${role.svrId}
            </span>
        `;

    charList.appendChild(div);
  }
}

function setCharsLoading() {
  charList.innerHTML = `<div class="char-row"><span class="draw-badge draw-loading">Loading...</span></div>`;
}


async function loadCharacters() {
  const { campaignToken } = await chrome.storage.local.get("campaignToken");
  if (!campaignToken) return;

  console.log(campaignToken);
  setCharsLoading();

  try {
    const res = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "getCharacters" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (res?.error) {
      charList.innerHTML = `
        <div class="char-row">
          <span class="draw-badge draw-error">${res.error}</span>
        </div>
      `;
      return;
    }

    const characters = Array.isArray(res)
      ? res
      : Array.isArray(res?.characters)
        ? res.characters
        : Array.isArray(res?.roles)
          ? res.roles
          : [];
    renderChars(characters);
    await chrome.storage.local.set({ cachedCharacters: characters });

  } catch (err) {
    console.error("Failed to load characters:", err);
    charList.innerHTML = `
      <div class="char-row">
        <span class="draw-badge draw-error">Failed to load characters</span>
      </div>
    `;
  }
}

async function refresh() {
  const data = await chrome.storage.local.get([
    "campaignToken", "scheduleInfo", "drawLog", "cachedCharacters"
  ]);

  tokenBox.value = data.campaignToken;
  if (data.campaignToken) {
    statusEl.textContent = "Token captured";
  }

  // if (data.cachedCharacters) {
  //   renderChars(data.cachedCharacters);
  // }

  if (data.scheduleInfo) {
    schedBox.classList.add("visible");
    schedBox.innerHTML = `
            <b>Scheduled</b><br>
            Draw at: <b>${data.scheduleInfo.drawAt}</b><br>
            Reset: ${data.scheduleInfo.nextReset}<br>
            Offset: +${data.scheduleInfo.randomOffset}
        `;
  }

  if (data.drawLog?.length) {
    logEl.classList.add("visible");
    logEl.textContent = data.drawLog.join("\n");
    logEl.scrollTop = logEl.scrollHeight;
  }
}

document.getElementById("captureBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes("plutomall.com.vn/rok/vn")) {
    statusEl.textContent = "Open the campaign page first";
    return;
  }
  statusEl.textContent = "Reloading page...";
  chrome.tabs.reload(tab.id);
});

document.getElementById("refreshCharsBtn").addEventListener("click", () => {
  statusEl.textContent = "Refreshing characters...";
  loadCharacters();
  statusEl.textContent = "Token captured";
});

document.getElementById("drawNowBtn").addEventListener("click", () => {
  const btn = document.getElementById("drawNowBtn");
  btn.disabled = true;
  btn.textContent = "Drawing...";
  logEl.classList.add("visible");
  logEl.textContent = "Starting draw...";

  chrome.runtime.sendMessage({ action: "testDraw" }, (res) => {
    if (res?.error) {
      statusEl.textContent = res.error;
      btn.disabled = false;
      btn.textContent = "Draw Now";
      return;
    }

    const poll = setInterval(async () => {
      const { drawLog } = await chrome.storage.local.get("drawLog");
      if (drawLog?.length) {
        logEl.textContent = drawLog.join("\n");
        logEl.scrollTop = logEl.scrollHeight;
        if (drawLog[drawLog.length - 1] === "Done!") {
          clearInterval(poll);
          btn.disabled = false;
          btn.textContent = "Draw Now";
          loadCharacters(); 
        }
      }
    }, 1000);
  });
});

document.getElementById("scheduleBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "schedule" }, (res) => {
    if (res?.error) {
      statusEl.textContent = res.error;
      return;
    }
    statusEl.textContent = "Scheduled!";
    refresh();
  });
});


refresh();
loadCharacters();