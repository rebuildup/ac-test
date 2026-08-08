// ==UserScript==
// @name         ac-test
// @namespace    local.ac-test
// @version      0.1.0
// @description  Send AtCoder samples directly to cargo-compete testcases/*.yml
// @match        https://atcoder.jp/contests/*/tasks/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const ENDPOINT = "http://127.0.0.1:27121/testcases";

  const pathMatch = location.pathname.match(
    /^\/contests\/([^/]+)\/tasks\/([^/]+)\/?$/
  );

  if (!pathMatch) return;

  const [, contest, task] = pathMatch;

  function normalizeText(text) {
    return text
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/\n+$/, "");
  }

  function sampleKind(title) {
    const text = title.replace(/\s+/g, " ").trim();

    let m = text.match(/^(?:入力例|Sample Input)\s*(\d+)/i);
    if (m) return { kind: "input", number: Number(m[1]) };

    m = text.match(/^(?:出力例|Sample Output)\s*(\d+)/i);
    if (m) return { kind: "output", number: Number(m[1]) };

    return null;
  }

  function findPreAfterHeading(heading) {
    let node = heading.nextElementSibling;

    while (node) {
      if (node.matches?.("h2, h3, h4")) return null;
      if (node.matches?.("pre")) return node;

      const nested = node.querySelector?.("pre");
      if (nested) return nested;

      node = node.nextElementSibling;
    }

    return null;
  }

  function collectSamples() {
    const map = new Map();

    for (const heading of document.querySelectorAll("h2, h3, h4")) {
      const info = sampleKind(heading.textContent ?? "");
      if (!info) continue;

      const pre = findPreAfterHeading(heading);
      if (!pre) continue;

      const entry = map.get(info.number) ?? {};
      entry[info.kind] = normalizeText(pre.textContent ?? "");
      map.set(info.number, entry);
    }

    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, value]) => value.input != null && value.output != null)
      .map(([number, value]) => ({
        name: `sample${number}`,
        input: value.input,
        output: value.output,
      }));
  }

  function getTimeLimit() {
    const text =
      document.querySelector("#main-container")?.textContent ??
      document.body.textContent ??
      "";

    const match =
      text.match(/Time Limit:\s*([\d.]+)\s*sec/i) ??
      text.match(/実行時間制限:\s*([\d.]+)\s*秒/i);

    return match ? `${match[1]}s` : "2s";
  }

  function setStatus(message, state = "idle") {
    let el = document.querySelector("#ac-test-status");

    if (!el) {
      el = document.createElement("button");
      el.id = "ac-test-status";
      el.type = "button";
      el.title = "Click to resend samples";
      Object.assign(el.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483647",
        border: "0",
        borderRadius: "6px",
        padding: "7px 10px",
        font: "12px/1.2 system-ui, sans-serif",
        boxShadow: "0 2px 10px rgb(0 0 0 / 18%)",
        cursor: "pointer",
        color: "#fff",
      });

      el.addEventListener("click", send);
      document.body.append(el);
    }

    const backgrounds = {
      idle: "#555",
      sending: "#735c0f",
      ok: "#18794e",
      error: "#b42318",
    };

    el.style.background = backgrounds[state] ?? backgrounds.idle;
    el.textContent = message;
  }

  function send() {
    const cases = collectSamples();

    if (cases.length === 0) {
      setStatus("cargo: samples not found", "error");
      return;
    }

    setStatus(`cargo: sending ${cases.length} samples…`, "sending");

    GM_xmlhttpRequest({
      method: "POST",
      url: ENDPOINT,
      headers: {
        "Content-Type": "application/json",
      },
      data: JSON.stringify({
        contest,
        task,
        url: location.href,
        timelimit: getTimeLimit(),
        cases,
      }),
      timeout: 2500,

      onload(response) {
        let data;

        try {
          data = JSON.parse(response.responseText);
        } catch {
          setStatus(`cargo: HTTP ${response.status}`, "error");
          return;
        }

        if (response.status >= 200 && response.status < 300 && data.ok) {
          setStatus(`cargo: ${data.cases} samples saved`, "ok");
          console.info("[ac-test]", data.path);
        } else {
          setStatus(`cargo: ${data.error ?? `HTTP ${response.status}`}`, "error");
          console.error("[ac-test]", data);
        }
      },

      ontimeout() {
        setStatus("cargo: bridge timeout", "error");
      },

      onerror(error) {
        setStatus("cargo: bridge offline", "error");
        console.error("[ac-test]", error);
      },
    });
  }

  // AtCoder may finish rendering/translation shortly after document-idle.
  // A small defer avoids scraping an incomplete statement without making
  // contest usage noticeably slower.
  setTimeout(send, 250);
})();
