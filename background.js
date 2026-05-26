const BASE = "https://campaign-global.lilith.com";
const CAMPAIGN_URL = "https://www.plutomall.com.vn/rok/vn?tab=perks";
const DRAW_API = "https://plat-campaign-api.lilithgame.com"
const PAGE_ID = "1986696212380155904"; // Không đổi
const COMPONENT_ID = "1986690045431939073"; // Không đổi
const REWARDS = {
    "1986632021321089024": "200 Đá Quý",
    "1986631915360387072": "Tăng tốc 3 giờ",
    "1986631781406900224": "Tăng tốc 8 giờ",
    "1986631671386112000": "500 Đá Quý",
    "1986631555921117184": "Rương Tự Chọn Vật Liệu Trang Bị",
    "1986631409741234176": "Tăng tốc 24 giờ",
    "1986631205541543936": "2.000 Đá Quý"
};
async function getToken() {
    const data = await chrome.storage.local.get(["campaignToken", "iframeSrc"]);
    if (data.campaignToken) return data.campaignToken;
    if (data.iframeSrc) {
        try {
            const url = new URL(data.iframeSrc);
            const jwt = url.searchParams.get("parent_jwt_token");
            if (jwt) {
                await chrome.storage.local.set({ campaignToken: jwt, tokenTimestamp: Date.now() });
                return jwt;
            }
        } catch (e) { }
    }
    return null;
}

chrome.webRequest.onSendHeaders.addListener(
    async (details) => {
        const authHeader = details.requestHeaders?.find(
            h => h.name.toLowerCase() === "authorization"
        );

        if (authHeader?.value) {
            const token = authHeader.value;
            try {
                const urlObj = new URL(details.url);
                const appUid = urlObj.searchParams.get('appUid');
                const appId = urlObj.searchParams.get('appId');

                const payload = JSON.parse(atob(token.replace('Bearer ', '').split('.')[1]));

                if (payload.client_id === 'event_lglo') {
                    chrome.storage.local.set({ campaignToken: token });
                    console.log("[LilithDraw] Campaign token captured");
                }
                const appUidTemp = await chrome.storage.local.get("appUidTemp");
                if (appUid && appId) {
                    chrome.storage.local.set({ appUid, appId });
                    if (Object.keys(appUidTemp).length === 0) {
                        chrome.storage.local.set({ appUidTemp: appUid });
                    }
                    console.log("[LilithDraw] appUid:", appUid, "appId:", appId, "appUidTemp:", appUidTemp.appUidTemp);
                }
            } catch (e) {
                console.error("[LilithDraw] webRequest error:", e);
            }
        }
    },
    {
        urls: ["https://plat-campaign-api.lilithgame.com/*"]
    },
    ["requestHeaders", "extraHeaders"]
);

async function autoDraw() {
    const now = new Date();
    const dayUTC = now.getUTCDay(); // 0=Sun, 5=Fri
    if (dayUTC === 5) {
        const token = await getToken();
        if (token) {
            const log = await runDraws();
            chrome.storage.local.set({ drawLog: log });
        }
    }
}

async function openCampaignTab() {
    return new Promise((resolve) => {
        chrome.tabs.create({ url: CAMPAIGN_URL, active: false }, (tab) => {
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

async function closeCampaignTab(tabId) {
    return new Promise((resolve) => {
        setTimeout(() => {
            chrome.tabs.remove(tabId, () => resolve());
        }, 7000);
    });
}

async function waitForFreshToken(timeoutMs = 15000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            const { campaignToken, tokenTimestamp } = await chrome.storage.local.get(["campaignToken", "tokenTimestamp"]);
            if (campaignToken && tokenTimestamp && tokenTimestamp > start) {
                clearInterval(interval);
                resolve(campaignToken);
            }
            if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                resolve(campaignToken || null);
            }
        }, 500);
    });
}

async function getRoles(token) {
    const { appUid, appUidTemp } = await chrome.storage.local.get(["appUid", "appUidTemp"]);
    const cachedCharacters = await chrome.storage.local.get("cachedCharacters");
    if (cachedCharacters.cachedCharacters?.length > 0 && appUid === appUidTemp) {
        return cachedCharacters.cachedCharacters;
    }
    else if (appUid !== appUidTemp) {
        await chrome.storage.local.set({ cachedCharacters: [], appUidTemp: appUid });
    }
    const res = await fetch("https://plat-campaign-api.lilithgame.com/page/1986696212380155904/user-roles", {
        method: 'GET',
        headers: {
            "authorization": token,
            'Content-Type': 'application/json',
        }
    });
    const json = await res.json();
    if (json.data.list?.length > 0) {
        await chrome.storage.local.set({ cachedCharacters: json.data.list, isValidToken: true });
    } else {
        await chrome.storage.local.set({ cachedCharacters: [], isValidToken: false });
    }
    return json.data.list;
}

async function getCharacterById(token, roleId) {
    const cachedCharacters = await chrome.storage.local.get("cachedCharacters");
    if (cachedCharacters.cachedCharacters?.length > 0) {
        console.log("Searching character in cache for roleId:", roleId);
        const character = cachedCharacters.cachedCharacters?.find(r => String(r.roleId) === String(roleId));
        if (character) return character;
    }
    const characters = await getRoles(token);
    return characters.find(c => String(c.roleId) === String(roleId));
}

async function getManifest(token, role, stored) {
    const params = new URLSearchParams({
        language: "vi",
        osType: "pc",
        name: role.name,
        avatar: role.avatar,
        svrId: role.svrId,
        svrName: "",
        roleId: role.roleId,
        gmEnvId: "",
        bbxRegion: "global",
        appId: Number(stored.appId),
        appUid: Number(stored.appUid),
        region: "VNM",
        currency: "VND"
    });
    const res = await fetch(
        `https://plat-campaign-api.lilithgame.com/page/1986696212380155904/manifest?${params}`,
        {
            headers: {
                "accept": "application/json",
                "authorization": token
            }
        }
    );

    const data = await res.json();
    return data;
}

async function getTotalDrawsLeft(token, roles, stored) {
    let total = 0;
    for (const role of roles) {
        const manifest = await getManifest(token, role, stored);
        if (manifest) {
            const drawCount = manifest?.data?.campaigns?.[0]?.displayModules?.[0]?.components?.[0]?.params?.curDrawTimes;
            total += drawCount;
        }
        else {
            log.push(`[${role.name}] Failed to get manifest`);
        }
    }
    chrome.storage.local.set({ totalDrawsLeft: total });
    return total;
}

async function drawOnce(token, role, stored) {
    const rolePayload = {
        name: role.name,
        avatar: role.avatar,
        svrId: role.svrId,
        svrName: "",
        roleId: role.roleId,
        gmEnvId: "",
        bbxRegion: "global",
        appId: Number(stored.appId),
        appUid: Number(stored.appUid)
    };
    // https://plat-campaign-api.lilithgame.com/page/1986696212380155904/trigger?osType=pc&language=vi
    const res = await fetch(
        `${DRAW_API}/page/${PAGE_ID}/trigger`,
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
                componentId: COMPONENT_ID,
                action: "drawing",
                params: {}
            })
        }
    );
    const data = await res.json();
    return data;
}

async function runDraws(token) {
    const log = [];
    let roles, totalDrawsLeft;
    const stored = await chrome.storage.local.get(["appId", "appUid", "roleId"]);
    try {
        roles = await getRoles(token);
        totalDrawsLeft = await getTotalDrawsLeft(token, roles, stored);
    } catch (e) {
        log.push(`Error fetching roles: ${e.message}`);
        return log;
    }
    log.push(`Found ${roles.length} character(s)`);
    if (totalDrawsLeft === 0) {
        log.push("No draws left for any character");
        return log;
    }
    for (const role of roles) {
        const manifest = await getManifest(token, role, stored);
        if (manifest) {
            const drawCount = manifest?.data?.campaigns?.[0]?.displayModules?.[0]?.components?.[0]?.params?.curDrawTimes;
            if (drawCount > 0) {
                try {
                    const result = await drawOnce(token, role, stored);
                    const rewardId = result?.data?.rewardId;
                    const reward = REWARDS[rewardId] || result?.data?.reward || "Unknown";
                    log.push(`[${role.name}] x1 ${reward}`);
                } catch (e) {
                    log.push(`[${role.name}] Error: ${e.message}`);
                }
            }
            else {
                log.push(`[${role.name}] No draws left`);
            }
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
        }
        else {
            log.push(`[${role.name}] Failed to get manifest`);
        }
    }
    log.push("Done!");
    return log;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "drawNow") {
        (async () => {
            const campaignToken = await getToken();
            if (!campaignToken) {
                sendResponse({ error: "No token in storage. Open the campaign page first." });
                return;
            }
            chrome.storage.local.set({ drawLog: ["Start drawing..."] });
            sendResponse({ ok: true });
            const log = await runDraws(campaignToken);
            chrome.storage.local.set({ drawLog: log });
        })();
        return true;
    }
    if (msg.action === "getCharacters") {
        (async () => {
            const token = await getToken();
            if (!token) { sendResponse({ error: "No token" }); return; }
            try {
                const roles = await getRoles(token);
                sendResponse({ roles })
                getTotalDrawsLeft(token, roles, await chrome.storage.local.get(["appId", "appUid"]));
            } catch (e) {
                sendResponse({ error: e.message });
            }
        })();
        return true;
    }
    if (msg.action === "getDrawHistory") {
        (async () => {
            const token = await getToken();
            if (!token) { sendResponse({ error: "No token" }); return; }
            try {
                const stored = await chrome.storage.local.get(["appId", "appUid"]);
                const [history, character] = await Promise.all([
                    getDrawHistory(token, msg.roleId, stored),
                    getCharacterById(token, msg.roleId),
                ]);
                sendResponse({ history, character });
                console.log("Draw history response:", history);
            } catch (e) {
                sendResponse({ error: e.message });
            }
        })();
        return true;
    }
});

function log_update(lines) {
    chrome.storage.local.get("drawLog", ({ drawLog }) => {
        chrome.storage.local.set({ drawLog: [...(drawLog || []), ...lines] });
    });
}

async function getDrawHistory(token, characterId, stored) {
    const character = await getCharacterById(token, characterId);
    // const character = getRoles(campaignToken).then(roles => roles.find(r => String(r.roleId) === String(characterId)));
    if (!character) {
        throw new Error("Character not found");
    }
    const params = new URLSearchParams({
        language: "vi",
        osType: "pc",
        name: character.name,
        avatar: character.avatar,
        svrId: character.svrId,
        svrName: "",
        roleId: character.roleId,
        gmEnvId: "",
        bbxRegion: "global",
        appId: Number(stored.appId),
        appUid: Number(stored.appUid),
        page: 1,
        size: 20
    });
    const res = await fetch(
        `https://plat-campaign-api.lilithgame.com/page/1986696212380155904/reward-history?${params}`,
        {
            headers: {
                "accept": "application/json",
                "authorization": token
            }
        }
    );
    const data = await res.json();
    return data;
}