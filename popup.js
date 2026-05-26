const statusEl = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const logEl = document.getElementById("log");
const logWrap = document.getElementById("logWrap");
const tokenBox = document.getElementById("tokenBox");
const charList = document.getElementById("charList");
const totalDrawsEl = document.getElementById("drawsRemaining");

function setStatus(text, on = false) {
  statusEl.textContent = text;
  if (statusDot) statusDot.className = "status-dot" + (on ? " on" : " off");
}

function showLog() {
  if (logWrap) logWrap.style.display = "";
  logEl.classList.add("visible");
}

function showMain() {
  const detailView = document.getElementById("detailView");
  if (detailView) detailView.remove();
  document.getElementById("main").style.display = "";
  refresh();
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
            <span class="h-idx">${i + 1}</span>
            <img class="reward-img" src="images/rewards/${rewardImg}.png" onerror="this.style.display='none'">
            <span class="h-reward">${reward} x${h.num || 1}</span>
            ${date ? `<span class="h-time">${date}</span>` : ""}
          </div>`;
  }).join("");

  const div = document.createElement("div");
  div.id = "detailView";
  div.innerHTML = `
    <nav class="detail-nav">
      <button id="backBtn" class="back-btn">‹ Quay lại</button>
      <span class="detail-nav-title">Lịch sử quay</span>
    </nav>
    <div class="content">
      <div class="char-hero-card glass">
        <div class="char-hero-inner">
          <img class="hero-avatar" src="${character.avatar}" onerror="this.style.display='none'">
          <div>
            <div class="hero-name">${character.name}</div>
            <div class="hero-svr">Server #${character.svrId}</div>
          </div>
        </div>
      </div>
      <div class="history-card glass">
        <div class="history-card-head">Phần thưởng đã nhận</div>
        <div class="history-list">
          ${historyRows}
        </div>
      </div>
    </div>
  `;

  const main = document.getElementById("main");
  main.parentNode.insertBefore(div, main.nextSibling);
  document.getElementById("backBtn").addEventListener("click", showMain);
}

async function loadCharacters() {
  const { campaignToken, totalDrawsLeft } = await chrome.storage.local.get(["campaignToken", "totalDrawsLeft"]);
  if (!campaignToken) return;

  console.log(campaignToken);
  setCharsLoading();

  if (totalDrawsLeft !== undefined) {
    totalDrawsEl.textContent = `${totalDrawsLeft} lượt còn lại`;
  }

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
    "campaignToken", "drawLog", "cachedCharacters", "totalDrawsLeft", "isValidToken"]);

  tokenBox.value = data.campaignToken ?? "";
  if (data.isValidToken) {
    setStatus("Token OK", true);
  }
  else {
    setStatus("Token not Valid", false);
  }

  if (data.drawLog?.length) {
    showLog();
    logEl.textContent = data.drawLog.join("\n");
    logEl.scrollTop = logEl.scrollHeight;
  }

  if (data.totalDrawsLeft !== undefined) {
    totalDrawsEl.textContent = `${data.totalDrawsLeft} lượt còn lại`;
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
  chrome.tabs.update(tab.id, { active: true, url: "https://www.plutomall.com.vn/rok/vn?tab=perks" });
});

document.getElementById("refreshCharsBtn").addEventListener("click", () => {
  setStatus("Đang làm mới…");
  refresh();
  loadCharacters();
});

document.getElementById("drawNowBtn").addEventListener("click", () => {
  const btn = document.getElementById("drawNowBtn");
  btn.disabled = true;
  btn.textContent = "Đang quay…";
  showLog();
  logEl.textContent = "Bắt đầu quay thưởng...";

  chrome.runtime.sendMessage({ action: "drawNow" }, (res) => {
    if (res?.error) {
      setStatus(res.error);
      btn.disabled = false;
      btn.textContent = "✦ Quay thưởng ngay";
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
          btn.textContent = "✦ Quay thưởng ngay";
          setStatus("Token OK", true);
          refresh();
          loadCharacters();
        }
      }
    }, 1000);
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
    <nav class="detail-nav">
      <button id="backBtn" class="back-btn">‹ Quay lại</button>
      <span class="detail-nav-title">Lịch sử quay</span>
    </nav>
    <div class="content">
      <div class="char-hero-card glass">
        <div class="char-hero-inner">
          <div class="hero-name">${name}</div>
        </div>
      </div>
      <div class="history-card glass">
        <div class="history-card-head">Phần thưởng đã nhận</div>
        <div class="history-list">
          <div class="history-empty history-loading">Đang tải…</div>
        </div>
      </div>
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