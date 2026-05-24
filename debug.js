const KEYS = ["campaignToken","tokenTimestamp","appId","appUid","roleId","svrId","roleName","iframeSrc","scheduleInfo","drawLog"];

function refresh() {
    chrome.storage.local.get(KEYS, (data) => {
        document.getElementById("v_token").textContent = data.campaignToken
            ? data.campaignToken.substring(0, 40) + "..." : "❌ MISSING";
        document.getElementById("v_token").style.color = data.campaignToken ? "#4ec9b0" : "#f44747";

        document.getElementById("v_ts").textContent = data.tokenTimestamp
            ? new Date(data.tokenTimestamp).toLocaleString() : "❌ MISSING";

        const fields = ["appId","appUid","roleId","svrId","roleName","iframeSrc"];
        for (const f of fields) {
            const el = document.getElementById("v_" + f);
            el.textContent = data[f] || "❌ MISSING";
            el.style.color = data[f] ? "#ce9178" : "#f44747";
        }

        document.getElementById("v_schedule").textContent =
            data.scheduleInfo ? JSON.stringify(data.scheduleInfo, null, 2) : "—";

        document.getElementById("log").textContent =
            data.drawLog?.join("\n") || "—";
    });
}

document.getElementById("refresh").addEventListener("click", refresh);

document.getElementById("clear").addEventListener("click", () => {
    chrome.storage.local.clear(() => {
        refresh();
        document.getElementById("log").textContent = "Storage cleared.";
    });
});

document.getElementById("testDraw").addEventListener("click", () => {
    document.getElementById("log").textContent = "Sending testDraw...";
    chrome.runtime.sendMessage({ action: "testDraw" }, (res) => {
        document.getElementById("log").textContent = res?.error || "Draw started, check log...";
        setTimeout(refresh, 3000);
        setInterval(refresh, 2000);
    });
});

setInterval(refresh, 2000);
refresh();