const statusEl = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const logEl = document.getElementById("log");
const logWrap = document.getElementById("logWrap");
const tokenBox = document.getElementById("tokenBox");
const charList = document.getElementById("charList");
const totalDrawsEl = document.getElementById("drawsRemaining");

const MALL_PATTERNS = {
    plutomall: ["plutomall.com"],
    lilithstore: ["store.lilith.com"]
};

const MALL_URLS = {
    plutomall: "https://www.plutomall.com.vn/rok/vn?tab=perks",
    lilithstore: "https://store.lilith.com/rok?tab=perks"
};

const MALL_TAB_PATTERNS = {
    plutomall: "*://www.plutomall.com.vn/*",
    lilithstore: "*://store.lilith.com/*"
};

function setStatus(text, on = false) {
    statusEl.textContent = text;
    if (statusDot) statusDot.className = "status-dot" + (on ? " on" : " off");
}

function showLog() {
    if (logWrap) logWrap.style.display = "";
    logEl.classList.add("visible");
}

function setCharsLoading() {
    charList.innerHTML = `<div class="char-row"><span class="draw-badge draw-loading">Loading...</span></div>`;
}

function setCharsEmpty(msg = "Chưa có token") {
    charList.innerHTML = `<div class="char-row"><span class="badge badge-warn">${msg}</span></div>`;
}

function setCharsError(msg) {
    charList.innerHTML = `<div class="char-row"><span class="badge badge-error">${msg}</span></div>`;
}

function showMain() {
    const detailView = document.getElementById("detailView");
    if (detailView) detailView.remove();
    document.getElementById("main").style.display = "";
}

function syncRadio(mall) {
    const radio = document.querySelector(`input[name="store"][value="${mall}"]`);
    if (radio) radio.checked = true;
}

function getSelectedMall() {
    return document.querySelector('input[name="store"]:checked').value;
}

async function detectMall() {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const activeTab = tabs[0];
    if (activeTab?.url) {
        for (const [mall, patterns] of Object.entries(MALL_PATTERNS)) {
            if (patterns.some(p => activeTab.url.includes(p))) {
                await chrome.storage.local.set({ currentMall: mall });
                syncRadio(mall);
                return mall;
            }
        }
    }
    const { currentMall } = await chrome.storage.local.get("currentMall");
    const mall = currentMall || "plutomall";
    syncRadio(mall);
    return mall;
}

function renderChars(roles) {
    charList.innerHTML = "";
    for (const role of roles) {
        const div = document.createElement("div");
        div.className = "char-row";
        div.innerHTML = `
            <span class="char-avatar"><img src="${role.avatar}"></span>
            <span class="char-name">
                <span id="${role.roleId}" class="char-history">${role.name}</span>
            </span>
            <span>#${role.svrId}</span>
        `;
        charList.appendChild(div);
    }
    attachHistoryListeners();
}

function renderDrawsLeft(drawsLeft, lastCheck) {
    if (drawsLeft !== null && drawsLeft !== undefined) {
        totalDrawsEl.textContent = `${drawsLeft} lượt còn lại (${lastCheck || "Chưa kiểm tra"})`;
    }
}

async function renderCache(mall) {
    try {
        const res = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: "getCache", mall }, (r) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                resolve(r);
            });
        });

        if (!res.hasToken) {
            setStatus("Chưa có dữ liệu, hãy Capture Token");
            setCharsEmpty("Chưa có dữ liệu, hãy Capture Token");
            tokenBox.value = "";
            totalDrawsEl.textContent = "— lượt còn lại";
            return;
        }

        setStatus("Token OK", true);

        const { [`${mall}_token`]: token } = await chrome.storage.local.get(`${mall}_token`);
        if (token) tokenBox.value = token;

        renderDrawsLeft(res.drawsLeft, res.lastCheck);

        const { drawLog } = await chrome.storage.local.get("drawLog");
        if (drawLog?.length) {
            showLog();
            logEl.textContent = drawLog.join("\n");
            logEl.scrollTop = logEl.scrollHeight;
        }

        if (res.roles?.length > 0) {
            renderChars(res.roles);
        } else {
            setCharsEmpty("Nhấn Làm mới để tải nhân vật");
        }
    } catch (err) {
        console.error("renderCache error:", err);
        setCharsError("Lỗi đọc cache");
    }
}

async function fetchAndRender(mall) {
    const m = mall ?? getSelectedMall();
    setStatus("Đang làm mới…");
    setCharsLoading();
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "refresh", mall: m }, (res) => {
            if (chrome.runtime.lastError) {
                setCharsError("Lỗi kết nối extension");
                return reject(new Error(chrome.runtime.lastError.message));
            }
            if (res?.error) {
                setStatus(res.error, false);
                setCharsError(res.error);
                return reject(new Error(res.error));
            }

            chrome.storage.local.get(`${m}_token`, (data) => {
                const token = data[`${m}_token`];
                if (token) tokenBox.value = token;
            });

            setStatus(res.isValidToken ? "Token OK" : "Token không hợp lệ", !!res.isValidToken);
            renderDrawsLeft(res.totalDrawsLeft, null);

            const roles = Array.isArray(res.roles) ? res.roles : [];
            if (roles.length > 0) {
                renderChars(roles);
            } else {
                setCharsEmpty("Không tìm thấy nhân vật");
            }

            resolve(res);
        });
    });
}

function attachHistoryListeners() {
    for (const el of document.querySelectorAll(".char-history")) {
        el.addEventListener("click", async () => {
            showHistoryLoading(el.textContent);
            chrome.runtime.sendMessage({ action: "getDrawHistory", roleId: el.id }, (res) => {
                if (res?.error) { showHistoryError(res.error); return; }
                showHistory(res.character, res.history);
            });
        });
    }
}

function showHistory(character, history) {
    document.getElementById("main").style.display = "none";
    const existing = document.getElementById("detailView");
    if (existing) existing.remove();

    const historyRows = history.data?.list?.map((h, i) => {
        const reward = h.rewardName ?? "—";
        const date = h.timestamp
            ? new Date(h.timestamp * 1000).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
            : "";
        return `
          <div class="history-row">
            <span class="h-idx">${i + 1}</span>
            <img class="reward-img" src="images/rewards/${h.rewardId}.png" onerror="this.style.display='none'">
            <span class="h-reward">${reward} x${h.num || 1}</span>
            ${date ? `<span class="h-time">${date}</span>` : ""}
          </div>`;
    }).join("") ?? "";

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
        <div class="history-list">${historyRows}</div>
      </div>
    </div>`;

    document.getElementById("main").parentNode.insertBefore(div, document.getElementById("main").nextSibling);
    document.getElementById("backBtn").addEventListener("click", showMain);
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
    </div>`;

    document.getElementById("main").parentNode.insertBefore(div, document.getElementById("main").nextSibling);
    document.getElementById("backBtn").addEventListener("click", showMain);
}

function showHistoryError(message) {
    const list = document.querySelector("#detailView .history-list");
    if (list) list.innerHTML = `<div class="history-empty history-err">Error: ${message}</div>`;
}

function waitForToken(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(async () => {
            const { tokenTimestamp } = await chrome.storage.local.get("tokenTimestamp");
            if (tokenTimestamp && tokenTimestamp > start) {
                clearInterval(interval);
                resolve();
            }
            if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                reject(new Error("Timeout — không capture được token"));
            }
        }, 500);
    });
}

for (const radio of document.querySelectorAll('input[name="store"]')) {
    radio.addEventListener("change", async () => {
        const mall = radio.value;
        await chrome.storage.local.set({ currentMall: mall });
        await renderCache(mall);
    });
}

document.getElementById("captureBtn").addEventListener("click", async () => {
    const mall = getSelectedMall();
    const targetUrl = MALL_URLS[mall];
    const pattern = MALL_TAB_PATTERNS[mall];
    const [tab] = await chrome.tabs.query({ url: pattern });

    const onTokenCaptured = () => {
        waitForToken()
            .then(() => fetchAndRender(mall))
            .catch((err) => setStatus(err.message));
    };

    if (!tab) {
        chrome.tabs.create({ url: targetUrl, active: true }, (newTab) => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (tabId === newTab.id && info.status === "complete") {
                    chrome.tabs.onUpdated.removeListener(listener);
                    onTokenCaptured();
                }
            });
        });
        return;
    }
    chrome.tabs.update(tab.id, { active: true, url: targetUrl });
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(listener);
            onTokenCaptured();
        }
    });
});

document.getElementById("refreshCharsBtn").addEventListener("click", () => {
    fetchAndRender(getSelectedMall());
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
            if (drawLog?.length > 0) {
                logEl.textContent = drawLog.join("\n");
                logEl.scrollTop = logEl.scrollHeight;
                const lastLine = drawLog[drawLog.length - 1];
                if (lastLine === "Done!" || lastLine.startsWith("Lỗi") || lastLine.includes("Không còn")) {
                    clearInterval(poll);
                    btn.disabled = false;
                    btn.textContent = "✦ Quay thưởng ngay";
                    await fetchAndRender(getSelectedMall());
                }
            }
        }, 1000);
    });
});

(async () => {
    const mall = await detectMall();
    await renderCache(mall);
})();