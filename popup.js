const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const tokenBox = document.getElementById("tokenBox");
const charList = document.getElementById("charList");
const schedBox = document.getElementById("scheduleBox");

function showMain() {
  document.getElementById("charSection").style.display = "";
  const detailView = document.getElementById("detailView");
  if (detailView) detailView.remove();
  document.getElementById("main").style.display = "";
  loadCharacters();
}

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
                <span id="${role.roleId}" class="char-history">${role.name}</span>
            </span>

            <span>
                #${role.svrId}
            </span>
        `;
    charList.appendChild(div);
  }
  loadCharacterHistory();
}

function setCharsLoading() {
  charList.innerHTML = `<div class="char-row"><span class="draw-badge draw-loading">Loading...</span></div>`;
}

function showHistory(character, history) {
  document.getElementById("main").style.display = "none";

  const existing = document.getElementById("detailView");
  if (existing) existing.remove();

  const historyRows = history.data?.list?.map((h, i) => {
    const reward = h.rewardName ?? "—";
    const rewardImg = h.rewardId ?? null;
    const date = h.timestamp
      ? new Date(h.timestamp * 1000).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
      : "";
    return `
          <div class="history-row">
            <span class="history-index">#${i + 1}</span>
            <img class="reward-img" src="reward_images/${rewardImg}.png" onerror="this.style.display='none'">
            <span class="history-reward">${reward} x${h.num || 1}</span>
            ${date ? `<span class="history-time">${date}</span>` : ""}
          </div>`;
  }).join("");

  const div = document.createElement("div");
  div.id = "detailView";
  div.innerHTML = `
    <div class="detail-header">
      <button id="backBtn" class="back-btn">← Back</button>
      <div class="detail-char-info">
        <img class="detail-avatar" src="${character.avatar}" onerror="this.style.display='none'">
        <div>
          <div class="detail-char-name">${character.name}</div>
          <div class="detail-char-svr">#${character.svrId}</div>
        </div>
      </div>
    </div >
    <div class="detail-section-label">Prize History</div>
    <div class="history-list">
      ${historyRows}
    </div>
  `;

  const main = document.getElementById("main");
  main.parentNode.insertBefore(div, main.nextSibling);
  document.getElementById("backBtn").addEventListener("click", showMain);
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
    < div class="char-row" >
      <span class="draw-badge draw-error">${res.error}</span>
        </div >
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
    < div class="char-row" >
      <span class="draw-badge draw-error">Failed to load characters</span>
      </div >
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
    < b > Scheduled</b > <br>
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
  const [tab] = await chrome.tabs.query({ url: "*://www.plutomall.com.vn/rok/vn*" });
  if (!tab?.url?.includes("plutomall.com.vn/rok/vn")) {
    return new Promise((resolve) => {
      chrome.tabs.create({ url: "https://www.plutomall.com.vn/rok/vn?tab=perks", active: true }, (tab) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
          if (tabId === tab.id && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            console.log("Campaign tab loaded:", tabId);
            resolve(tab.id);
          }
        });
      });
    });
  }
  chrome.tabs.reload(tab.id);
  chrome.tabs.update(tab.id, { active: true });
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

async function loadCharacterHistory() {
  const characterHistoryElements = document.querySelectorAll(".char-history");
  for (const el of characterHistoryElements) {
    el.addEventListener("click", async () => {
      showHistoryLoading(el.textContent);
      chrome.runtime.sendMessage({ action: "getDrawHistory", roleId: el.id }, (res) => {
        if (res?.error) {
          showHistoryError(res.error);
          return;
        }

        showHistory(res.character, res.history);
      });
    });
  }
}

function showHistoryLoading(name) {
  document.getElementById("main").style.display = "none";
  const existing = document.getElementById("detailView");
  if (existing) existing.remove();

  const div = document.createElement("div");
  div.id = "detailView";
  div.innerHTML = `
          <div class="detail-header">
            <button id="backBtn" class="back-btn">← Back</button>
            <div class="detail-char-info">
              <div class="detail-char-name">${name}</div>
            </div>
          </div>
          <div class="detail-section-label">Prize History</div>
          <div class="history-list">
            <div class="history-empty history-loading">Loading history\u2026</div>
          </div>
          `;
  const main = document.getElementById("main");
  main.parentNode.insertBefore(div, main.nextSibling);
  document.getElementById("backBtn").addEventListener("click", showMain);
}

function showHistoryError(message) {
  const list = document.querySelector("#detailView .history-list");
  if (list) list.innerHTML = `<div class="history-empty history-err">Error: ${message}</div>`;
}

refresh();
loadCharacters();