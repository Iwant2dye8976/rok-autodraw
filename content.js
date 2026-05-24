// Runs in MAIN world — with all_frames:true this runs in the campaign iframe too
(function () {
    const loc = window.location.href;
    console.log("[LilithDraw] MAIN script loaded on:", loc);

    const originalFetch = window.fetch.bind(window);

    window.fetch = async function (...args) {
        const [url, options = {}] = args;

        try {
            const requestUrl = typeof url === "string" ? url : url instanceof Request ? url.url : String(url);
            console.log("Request: ", requestUrl);
            // const isTarget =
            //     requestUrl.includes("lilith.com") ||
            //     requestUrl.includes("lilithgame.com");

            //     if (isTarget) {
            //         const headers = options.headers || {};
            //         let token = null;

            //         if (headers instanceof Headers) {
            //             token = headers.get("authorization") || headers.get("Authorization");
            //         } else if (typeof headers === "object") {
            //             token = headers["authorization"] || headers["Authorization"];
            //         }

            //         console.log("[LilithDraw] Lilith fetch detected:", requestUrl.substring(0, 80), "| token:", !!token);

            //         if (token) {
            //             try { window.top.postMessage({ type: "LILITH_TOKEN", token }, "*"); } catch (e) { }
            //             window.postMessage({ type: "LILITH_TOKEN", token }, "*");
            //             console.log("[LilithDraw] Token posted:", token.substring(0, 30));
            //         }
            //     }
            // } catch (e) {
            //     console.error("[LilithDraw] Error:", e);
            // }
            
            if (requestUrl.includes('lilithgame.com') && requestUrl.includes('manifest')) {
                const headers = options.headers || {};
                let token = headers instanceof Headers
                    ? headers.get("authorization")
                    : headers["authorization"] || headers["Authorization"];

                if (token) {
                    // Lấy appId và appUid trực tiếp từ request URL
                    const urlObj = new URL(requestUrl);
                    const appUid = urlObj.searchParams.get('appUid');
                    const appId = urlObj.searchParams.get('appId');

                    chrome.storage.local.set({ campaignToken: token, appUid, appId });
                    console.log("[LilithDraw] Captured — appUid:", appUid, "appId:", appId);
                }
            }
        } catch (e) {
            console.error("[LilithDraw] Error:", e);
        }

        return originalFetch.apply(this, args);
    };

    console.log("[LilithDraw] Fetch interceptor installed on:", loc);
})();