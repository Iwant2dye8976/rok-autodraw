(function () {
    const loc = window.location.href;
    console.log("[LilithDraw] ISOLATED bridge loaded on:", loc);

    window.addEventListener("message", (event) => {
        if (event.data?.type === "LILITH_TOKEN") {
            const token = event.data.token;
            if (!token) return;
            chrome.storage.local.set({
                campaignToken: token,
                tokenTimestamp: Date.now()
            }, () => {
                console.log("[LilithDraw] Token saved from:", loc.substring(0, 50));
            });
        }

        if (event.data?.type === "LILITH_PARAMS") {
            const { appId, appUid, iframeSrc } = event.data;
            chrome.storage.local.set({ appId, appUid, iframeSrc });
        }
    });
})();