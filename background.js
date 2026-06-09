const BASE = "https://campaign-global.lilith.com";
const CAMPAIGN_URL = "https://www.plutomall.com.vn/rok/vn?tab=perks";
const DRAW_API = "https://plat-campaign-api.lilithgame.com";

const STORE_CONFIG = {
    plutomall: {
        pageId: "1986696212380155904",
        componentId: "1986690045431939073",
    },
    lilithstore: {
        pageId: "1986695937787461632",
        componentId: "1986689639322648578",
    }
};

const REWARDS = {
    "1986632021321089024": "200 Đá Quý",
    "1986631915360387072": "Tăng tốc 3 giờ",
    "1986631781406900224": "Tăng tốc 8 giờ",
    "1986631671386112000": "500 Đá Quý",
    "1986631555921117184": "Rương Tự Chọn Vật Liệu Trang Bị",
    "1986631409741234176": "Tăng tốc 24 giờ",
    "1986631205541543936": "2.000 Đá Quý"
};


function sk(mall, name) {
    return `${mall}_${name}`;
}

async function getCurrentMall() {
    const { currentMall } = await chrome.storage.local.get("currentMall");
    return currentMall || "plutomall";
}

async function getStoreData(mall) {
    const keys = [
        sk(mall, "token"),
        sk(mall, "roles"),
        sk(mall, "drawsLeft"),
        sk(mall, "lastCheck"),
        sk(mall, "appUid"),
        sk(mall, "appId"),
    ];
    const data = await chrome.storage.local.get(keys);
    return {
        token: data[sk(mall, "token")] ?? null,
        roles: data[sk(mall, "roles")] ?? [],
        drawsLeft: data[sk(mall, "drawsLeft")] ?? null,
        lastCheck: data[sk(mall, "lastCheck")] ?? null,
        appUid: data[sk(mall, "appUid")] ?? null,
        appId: data[sk(mall, "appId")] ?? null,
    };
}

async function setStoreData(mall, partial) {
    const mapped = {};
    for (const [k, v] of Object.entries(partial)) {
        mapped[sk(mall, k)] = v;
    }
    await chrome.storage.local.set(mapped);
}


async function getToken(mall) {
    const m = mall ?? await getCurrentMall();
    const data = await getStoreData(m);
    return data.token ?? null;
}

function detectMallFromUrl(url) {
    for (const [mall, config] of Object.entries(STORE_CONFIG)) {
        if (url.includes(config.pageId)) return mall;
    }
    return null;
}

chrome.webRequest.onSendHeaders.addListener(
    async (details) => {
        const authHeader = details.requestHeaders?.find(
            h => h.name.toLowerCase() === "authorization"
        );

        let mall = detectMallFromUrl(details.url);

        if (!mall) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.url?.includes("plutomall.com")) {
                mall = "plutomall";
            } else if (tab?.url?.includes("store.lilith.com")) {
                mall = "lilithstore";
            }
            if (mall) await chrome.storage.local.set({ currentMall: mall });
        }

        if (!mall) mall = await getCurrentMall();

        if (authHeader?.value) {
            const token = authHeader.value;
            try {
                const urlObj = new URL(details.url);
                const appUid = urlObj.searchParams.get("appUid");
                const appId = urlObj.searchParams.get("appId");

                const payload = JSON.parse(atob(token.replace("Bearer ", "").split(".")[1]));
                if (payload.client_id === "event_lglo") {
                    await setStoreData(mall, { token, tokenTimestamp: Date.now() });
                    await chrome.storage.local.set({ tokenTimestamp: Date.now() });
                    console.log(`[LilithDraw][${mall}] Campaign token captured`);
                }

                if (appUid && appId) {
                    await setStoreData(mall, { appUid, appId });
                    console.log(`[LilithDraw][${mall}] appUid: ${appUid}, appId: ${appId}`);
                    try {
                        // const { status } = await chrome.storage.local.get("status");
                        await chrome.action.openPopup();
                    } catch (e) {
                        console.warn("[LilithDraw] Could not open popup:", e.message);
                    }
                }
            } catch (e) {
                console.error("[LilithDraw] webRequest error:", e);
            }
        }
    },
    { urls: ["https://plat-campaign-api.lilithgame.com/*"] },
    ["requestHeaders", "extraHeaders"]
);


chrome.runtime.onStartup.addListener(async () => {
    chrome.alarms.get("dailyResetCheck", (alarm) => {
        if (!alarm) chrome.alarms.create("dailyResetCheck", { periodInMinutes: 60 });
    });
    await autoDrawAllMalls();
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.get("dailyResetCheck", (alarm) => {
        if (!alarm) {
            chrome.alarms.create("dailyResetCheck", { periodInMinutes: 60 });
            console.log("[LilithDraw] Alarm created");
        }
    });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "dailyResetCheck") {
        await autoDrawAllMalls();
    }
});

async function autoDrawAllMalls() {
    for (const mall of Object.keys(STORE_CONFIG)) {
        await autoDrawMall(mall);
        chrome.storage.local.set({ mall, lastcheck: new Date().toLocaleString() });
    }
}

async function autoDrawMall(mall) {
    const token = await getToken(mall);
    if (!token) return;
    if (new Date().getUTCDay() !== 5) {
        try {
            const roles = await getRoles(token, mall, true);
            const totalDrawsLeft = await getTotalDrawsLeft(token, roles, mall);
            if (totalDrawsLeft > 0) {
                chrome.storage.local.set({ status: "drawing" });
                const log = await runDraws(token, mall);
                chrome.storage.local.set({ drawLog: log });
            }
            else return;
        } catch (e) {
            console.error(`[LilithDraw][${mall}] autoDrawMall error:`, e);
        }
    }
    else {
        const log = await runDraws(token, mall);
        chrome.storage.local.set({ drawLog: log });
    }
}


async function getRoles(token, mall, forceRefresh = false) {
    if (!forceRefresh) {
        const cached = (await getStoreData(mall)).roles;
        if (cached?.length > 0) {
            console.log(`[LilithDraw][${mall}] Serving roles from cache (${cached.length})`);
            return cached;
        }
    }

    const config = STORE_CONFIG[mall];
    const res = await fetch(
        `https://plat-campaign-api.lilithgame.com/page/${config.pageId}/user-roles`,
        {
            method: "GET",
            headers: { authorization: token, "Content-Type": "application/json" }
        }
    );
    const json = await res.json();
    console.log(`[LilithDraw][${mall}] getRoles - ok: ${res.ok}`);

    if (res.ok) {
        await setStoreData(mall, { roles: json.data.list ?? [], isValidToken: true });
    } else {
        await setStoreData(mall, { roles: [], isValidToken: false });
    }
    return json.data.list ?? [];
}

async function getCharacterById(token, roleId, mall) {
    const cached = (await getStoreData(mall)).roles;
    if (cached?.length > 0) {
        const hit = cached.find(r => String(r.roleId) === String(roleId));
        if (hit) return hit;
    }
    const roles = await getRoles(token, mall, true);
    return roles.find(c => String(c.roleId) === String(roleId));
}

async function getManifest(token, role, mall) {
    const { appUid, appId } = await getStoreData(mall);
    const config = STORE_CONFIG[mall];
    const params = new URLSearchParams({
        language: "vi", osType: "pc",
        name: role.name, avatar: role.avatar,
        svrId: role.svrId, svrName: "", roleId: role.roleId,
        gmEnvId: "", bbxRegion: "global",
        appId: Number(appId), appUid: Number(appUid),
        region: "VNM", currency: "VND"
    });
    const res = await fetch(
        `https://plat-campaign-api.lilithgame.com/page/${config.pageId}/manifest?${params}`,
        { headers: { accept: "application/json", authorization: token } }
    );
    return res.json();
}

async function getTotalDrawsLeft(token, roles, mall) {
    let total = 0;
    for (const role of roles) {
        const manifest = await getManifest(token, role, mall);
        if (manifest) {
            const drawCount = manifest?.data?.campaigns?.[0]?.displayModules?.[0]?.components?.[0]?.params?.curDrawTimes;
            total += drawCount ?? 0;
        }
    }
    const lastCheck = new Date().toLocaleString();
    await setStoreData(mall, { drawsLeft: total, lastCheck });
    return total;
}

async function drawOnce(token, role, mall) {
    const { appUid, appId } = await getStoreData(mall);
    const config = STORE_CONFIG[mall];
    const rolePayload = {
        name: role.name, avatar: role.avatar,
        svrId: role.svrId, svrName: "", roleId: role.roleId,
        gmEnvId: "", bbxRegion: "global",
        appId: Number(appId), appUid: Number(appUid)
    };
    const res = await fetch(
        `${DRAW_API}/page/${config.pageId}/trigger`,
        {
            method: "POST",
            headers: {
                authorization: token,
                accept: "application/json",
                "content-type": "application/json;charset=UTF-8"
            },
            body: JSON.stringify({
                language: "en",
                role: rolePayload,
                componentId: config.componentId,
                action: "drawing",
                params: {}
            })
        }
    );
    return res.json();
}

async function runDraws(token, mall) {
    const log = [];
    let roles, totalDrawsLeft;
    try {
        roles = await getRoles(token, mall);
        totalDrawsLeft = await getTotalDrawsLeft(token, roles, mall);
    } catch (e) {
        log.push(`Lỗi khi tải thông tin nhân vật: ${e.message}`);
        return log;
    }

    log.push(`Tìm thấy ${roles.length} nhân vật`);
    if (totalDrawsLeft === 0) {
        log.push("Không còn lượt quay nào cho bất kỳ nhân vật nào");
        return log;
    }

    for (const role of roles) {
        const manifest = await getManifest(token, role, mall);
        if (!manifest) {
            log.push(`[${role.name}] Lấy manifest thất bại, bỏ qua nhân vật này`);
            continue;
        }
        const drawCount = manifest?.data?.campaigns?.[0]?.displayModules?.[0]?.components?.[0]?.params?.curDrawTimes;
        if (drawCount > 0) {
            try {
                const result = await drawOnce(token, role, mall);
                const rewardId = result?.data?.rewardId;
                const reward = REWARDS[rewardId] || result?.data?.reward || "Unknown";
                log.push(`[${role.name}] x1 ${reward}`);
            } catch (e) {
                log.push(`[${role.name}] Lỗi: ${e.message}`);
            }
        } else {
            log.push(`[${role.name}] Không còn lượt quay nào`);
        }
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    }

    log.push("Done!");
    return log;
}


async function getDrawHistory(token, roleId, mall) {
    const character = await getCharacterById(token, roleId, mall);
    if (!character) throw new Error("Không tìm thấy thông tin nhân vật");

    const { appUid, appId } = await getStoreData(mall);
    const config = STORE_CONFIG[mall];
    const params = new URLSearchParams({
        language: "vi", osType: "pc",
        name: character.name, avatar: character.avatar,
        svrId: character.svrId, svrName: "", roleId: character.roleId,
        gmEnvId: "", bbxRegion: "global",
        appId: Number(appId), appUid: Number(appUid),
        page: 1, size: 20,
    });
    const res = await fetch(
        `https://plat-campaign-api.lilithgame.com/page/${config.pageId}/reward-history?${params}`,
        { headers: { accept: "application/json", authorization: token } }
    );
    return res.json();
}


function formatDate(date) {
    return date.getFullYear() + "-" +
        String(date.getMonth() + 1).padStart(2, "0") + "-" +
        String(date.getDate()).padStart(2, "0") + " " +
        String(date.getHours()).padStart(2, "0") + ":" +
        String(date.getMinutes()).padStart(2, "0") + ":" +
        String(date.getSeconds()).padStart(2, "0");
}

async function autoSurvey(csrf, params) {
    const end = new Date();
    const start = new Date(end.getTime() - 3 * 60 * 1000);
    const response = await fetch(
        `https://q.lilithgame.com/api/answer/collect?_csrf=${csrf}`,
        {
            method: "POST",
            headers: { "content-type": "application/json;charset=UTF-8" },
            body: JSON.stringify({
                survey_id: params.sid,
                start_time: formatDate(start),
                end_time: formatDate(end),
                pages: [],
                region: params.region,
                role_key: params.role_key,
                sign: params.sign,
                lang: params.lang,
                source: params.source
            })
        }
    );
    return response.json();
}


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    if (msg.action === "getCache") {
        (async () => {
            const mall = msg.mall ?? await getCurrentMall();
            const data = await getStoreData(mall);
            sendResponse({
                mall,
                roles: data.roles,
                drawsLeft: data.drawsLeft,
                lastCheck: data.lastCheck,
                isValidToken: !!data.token,
                hasToken: !!data.token,
            });
        })();
        return true;
    }

    if (msg.action === "refresh") {
        (async () => {
            const mall = msg.mall ?? await getCurrentMall();
            const token = await getToken(mall);
            if (!token) { sendResponse({ error: "Không có token" }); return; }
            try {
                const roles = await getRoles(token, mall, true);
                const totalDrawsLeft = await getTotalDrawsLeft(token, roles, mall);
                const storeData = await getStoreData(mall);
                sendResponse({ mall, roles, totalDrawsLeft, isValidToken: storeData.isValidToken ?? true });
            } catch (e) {
                sendResponse({ error: e.message });
            }
        })();
        return true;
    }

    if (msg.action === "drawNow") {
        (async () => {
            const mall = msg.mall ?? await getCurrentMall();
            const token = await getToken(mall);
            if (!token) {
                sendResponse({ error: "Không có token trong bộ nhớ. Vui lòng mở trang quay thưởng trước." });
                return;
            }
            chrome.storage.local.set({ drawLog: ["Bắt đầu quay thưởng..."] });
            sendResponse({ ok: true });
            const log = await runDraws(token, mall);
            chrome.storage.local.set({ drawLog: log });
        })();
        return true;
    }

    if (msg.action === "getDrawHistory") {
        (async () => {
            const mall = msg.mall ?? await getCurrentMall();
            const token = await getToken(mall);
            if (!token) { sendResponse({ error: "Không có token" }); return; }
            try {
                const [history, character] = await Promise.all([
                    getDrawHistory(token, msg.roleId, mall),
                    getCharacterById(token, msg.roleId, mall),
                ]);
                sendResponse({ history, character });
            } catch (e) {
                sendResponse({ error: e.message });
            }
        })();
        return true;
    }

    if (msg.type === "surveyCsrf") {
        (async () => {
            const json = await autoSurvey(msg.csrf, msg.params);
            chrome.notifications.create({
                type: "basic",
                iconUrl: "images/icons/icon48.png",
                title: "Auto Survey",
                message: `Message: ${json.msg}, Code: ${json.ret}`,
                requireInteraction: false
            });
        })();
    }
});