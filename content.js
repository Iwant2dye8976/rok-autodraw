(async () => {
    const surveyHtml = await fetch(location.href).then(res => res.text());
    const surveyCsrf = surveyHtml.match(/<input[^>]*id="_csrf"[^>]*value="([^"]+)"/)?.[1];
    const url = new URL(window.location.href);
    const params = Object.fromEntries(url.searchParams.entries());
    chrome.runtime.sendMessage({ type: 'surveyCsrf', csrf: surveyCsrf , params: params });
})();