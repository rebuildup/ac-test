// ==UserScript==
// @name         ac-test
// @namespace    local.ac-test
// @version      0.2.1
// @description  Export AtCoder samples and Level-1 boundary/stress inputs
// @match        https://atcoder.jp/contests/*/tasks/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const ENDPOINT = "http://127.0.0.1:27121/testcases";
  const pathMatch = location.pathname.match(/^\/contests\/([^/]+)\/tasks\/([^/]+)\/?$/);
  if (!pathMatch) return;
  const [, contest, task] = pathMatch;

  const norm = (text = "") => text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/[×✕]/g, "*")
    .replace(/[≤≦]/g, "<=")
    .replace(/[≥≧]/g, ">=")
    .replace(/…/g, "...")
    .replace(/\n+$/, "");

  const canonicalVar = (raw) => norm(raw)
    .replace(/\s+/g, "")
    .replace(/[{}]/g, "")
    .replace(/\\_/g, "_")
    .replace(/_\{?i\}?/gi, "_i")
    .replace(/_\{?(\d+)\}?/g, "_$1");

  function findSection(names) {
    const wanted = names.map((x) => x.toLowerCase());
    for (const heading of document.querySelectorAll("h2, h3")) {
      const title = norm(heading.innerText || heading.textContent || "")
        .trim().replace(/[:：]$/, "").toLowerCase();
      if (!wanted.some((name) => title === name || title.startsWith(`${name} `))) continue;
      const nodes = [];
      let node = heading.nextElementSibling;
      while (node && !node.matches?.("h2, h3")) {
        nodes.push(node);
        node = node.nextElementSibling;
      }
      return { heading, nodes };
    }
    return null;
  }

  function sectionLines(section) {
    if (!section) return [];
    const out = [];
    for (const node of section.nodes) {
      const items = [...node.querySelectorAll?.("li") ?? []];
      if (items.length) {
        for (const item of items) {
          const text = norm(item.innerText || item.textContent || "").trim();
          if (text) out.push(text);
        }
        continue;
      }
      const text = norm(node.innerText || node.textContent || "");
      for (const line of text.split("\n").map((x) => x.trim()).filter(Boolean)) out.push(line);
    }
    return out;
  }

  function sectionPre(section) {
    for (const node of section?.nodes ?? []) {
      const pre = node.matches?.("pre") ? node : node.querySelector?.("pre");
      if (pre) return norm(pre.innerText || pre.textContent || "");
    }
    return null;
  }

  function collectSamples() {
    const map = new Map();
    for (const heading of document.querySelectorAll("h2, h3, h4")) {
      const title = norm(heading.innerText || heading.textContent || "").replace(/\s+/g, " ").trim();
      let m = title.match(/^(?:入力例|Sample Input)\s*(\d+)/i);
      let kind = "input";
      if (!m) { m = title.match(/^(?:出力例|Sample Output)\s*(\d+)/i); kind = "output"; }
      if (!m) continue;
      let node = heading.nextElementSibling;
      let pre = null;
      while (node && !node.matches?.("h2, h3, h4")) {
        pre = node.matches?.("pre") ? node : node.querySelector?.("pre");
        if (pre) break;
        node = node.nextElementSibling;
      }
      if (!pre) continue;
      const number = Number(m[1]);
      const entry = map.get(number) ?? {};
      entry[kind] = norm(pre.textContent || "");
      map.set(number, entry);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, v]) => v.input != null && v.output != null)
      .map(([number, v]) => ({ name: `sample${number}`, input: v.input, output: v.output }));
  }

  function parseNumberExpression(raw, vars = {}) {
    let s = norm(raw)
      .replace(/\\\(|\\\)|\$/g, "")
      .replace(/\s+/g, "")
      .replace(/[{}]/g, "")
      .replace(/\\times|\\cdot/g, "*")
      .replace(/10\^\(?([+-]?\d+)\)?/g, (_, p) => `10**${p}`);
    const cv = canonicalVar(s);
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(cv) && Number.isFinite(vars[cv])) return vars[cv];
    if (!/^[0-9+\-*/().*]+$/.test(s)) return null;
    try {
      const value = Function(`"use strict"; return (${s});`)();
      return Number.isSafeInteger(value) ? value : null;
    } catch { return null; }
  }

  function parseBounds(lines) {
    const bounds = new Map();
    const add = (name, minRaw, maxRaw) => {
      name = canonicalVar(name);
      if (!/^[A-Za-z][A-Za-z0-9_]*(?:_i)?$/.test(name)) return;
      const old = bounds.get(name) ?? {};
      bounds.set(name, { minRaw: minRaw ?? old.minRaw, maxRaw: maxRaw ?? old.maxRaw });
    };

    for (const raw of lines) {
      const line = norm(raw)
        .replace(/\\\(|\\\)|\$/g, "")
        .replace(/\\leq?|\\geq?/g, (x) => x.startsWith("\\l") ? "<=" : ">=")
        .replace(/[。．]$/, "")
        .replace(/\s+/g, "");

      let m = line.match(/^(.+?)<=([A-Za-z][A-Za-z0-9_{}]*(?:_i|_\{?i\}?)?)<=(.+?)(?:\([^)]*\))?$/i);
      if (m) { add(m[2], m[1], m[3]); continue; }

      m = line.match(/^(.+?)<=([A-Za-z][A-Za-z0-9_{}]*(?:,[A-Za-z][A-Za-z0-9_{}]*)+)<=(.+)$/i);
      if (m) { for (const name of m[2].split(",")) add(name, m[1], m[3]); continue; }

      m = line.match(/^([A-Za-z][A-Za-z0-9_{}]*)<=(.+)$/i);
      if (m) add(m[1], null, m[2]);
    }
    return bounds;
  }

  function parseInputSchema(inputText) {
    if (!inputText) return null;
    const rows = [];
    for (const raw of inputText.split("\n").map((x) => x.trim()).filter(Boolean)) {
      const clean = raw
        .replace(/\\\(|\\\)|\$/g, "")
        .replace(/\\ldots|\\cdots|…/g, "...")
        .replace(/[{}]/g, "")
        .replace(/\\_/g, "_")
        .replace(/\s+/g, " ").trim();
      const tokens = clean.split(/\s+/);

      if (tokens.includes("...")) {
        const dots = tokens.indexOf("...");
        const first = canonicalVar(tokens[0]);
        const second = canonicalVar(tokens[1] ?? "");
        const last = canonicalVar(tokens[dots + 1] ?? tokens.at(-1) ?? "");
        const fm = first.match(/^([A-Za-z][A-Za-z0-9_]*)_1$/);
        const sm = second.match(/^([A-Za-z][A-Za-z0-9_]*)_2$/);
        const lm = last.match(/^([A-Za-z][A-Za-z0-9_]*)_([A-Za-z][A-Za-z0-9_]*)$/);
        if (fm && sm && lm && fm[1] === sm[1] && fm[1] === lm[1]) {
          rows.push({ kind: "array", name: `${fm[1]}_i`, lengthVar: lm[2] });
          continue;
        }
      }

      const vars = tokens.map(canonicalVar);
      if (vars.every((x) => /^[A-Za-z][A-Za-z0-9_]*$/.test(x))) {
        rows.push({ kind: "scalars", vars });
        continue;
      }
      return null;
    }
    return rows.length ? rows : null;
  }

  function buildGeneratedCases() {
    const constraints = findSection(["制約", "Constraints"]);
    const input = findSection(["入力", "Input"]);
    if (!constraints) return { cases: [], reason: "constraints section not found" };
    if (!input) return { cases: [], reason: "input section not found" };

    const constraintLines = sectionLines(constraints);
    const bounds = parseBounds(constraintLines);
    const inputText = sectionPre(input);
    const schema = parseInputSchema(inputText);
    if (!schema) return { cases: [], reason: `input schema unsupported: ${JSON.stringify(inputText)}` };
    if (!bounds.size) return { cases: [], reason: `no numeric bounds parsed: ${JSON.stringify(constraintLines)}` };

    const scalarNames = [...new Set(schema.flatMap((row) => row.kind === "scalars" ? row.vars : [row.lengthVar]))];
    for (const name of scalarNames) {
      const b = bounds.get(name);
      if (!b) return { cases: [], reason: `no bounds for ${name}; parsed=${[...bounds.keys()].join(",")}` };
      const min = parseNumberExpression(b.minRaw ?? "1");
      const max = parseNumberExpression(b.maxRaw ?? "");
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
        return { cases: [], reason: `unsupported bounds for ${name}: ${b.minRaw}..${b.maxRaw}` };
      }
    }
    for (const row of schema) {
      if (row.kind === "array" && !bounds.has(row.name)) {
        return { cases: [], reason: `no bounds for ${row.name}; parsed=${[...bounds.keys()].join(",")}` };
      }
    }

    const seededRandom = (seed) => { let x = seed >>> 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 0x100000000; }; };
    const resolveBound = (raw, vars, fallback) => {
      if (raw == null) return fallback;
      const name = canonicalVar(raw);
      if (Number.isFinite(vars[name])) return vars[name];
      return parseNumberExpression(raw, vars) ?? fallback;
    };

    function make(mode) {
      const vars = {};
      const rnd = seededRandom(0xac7e57 ^ task.length ^ mode.length);
      for (const name of scalarNames) {
        const b = bounds.get(name);
        const min = parseNumberExpression(b.minRaw ?? "1") ?? 1;
        const max = parseNumberExpression(b.maxRaw ?? String(min)) ?? min;
        vars[name] = mode === "min" ? min
          : mode === "near-min" ? Math.min(max, min + 1)
          : mode === "near-max" ? Math.max(min, max - 1)
          : max;
      }

      const lines = [];
      for (const row of schema) {
        if (row.kind === "scalars") { lines.push(row.vars.map((name) => vars[name]).join(" ")); continue; }
        const len = vars[row.lengthVar];
        if (!Number.isSafeInteger(len) || len < 0 || len > 2_000_000) return null;
        const b = bounds.get(row.name);
        const min = resolveBound(b.minRaw, vars, 1);
        const max = resolveBound(b.maxRaw, vars, min);
        if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) return null;
        const values = Array.from({ length: len }, () => {
          if (mode === "min") return min;
          if (mode === "near-min") return Math.min(max, min + 1);
          if (mode === "near-max") return Math.max(min, max - 1);
          if (mode === "random") return min + Math.floor(rnd() * (max - min + 1));
          return max;
        });
        lines.push(values.join(" "));
      }
      return lines.join("\n");
    }

    const cases = [["min","min"],["near-min","near-min"],["near-max","near-max"],["max","max"],["random-max","random"]]
      .map(([name, mode]) => ({ name, input: make(mode) }))
      .filter((x) => x.input != null);
    return cases.length ? { cases, reason: null } : { cases: [], reason: "could not generate valid integer cases" };
  }

  function getTimeLimit() {
    const text = document.querySelector("#main-container")?.innerText ?? document.body.innerText ?? "";
    const m = text.match(/Time Limit:\s*([\d.]+)\s*sec/i) ?? text.match(/実行時間制限:\s*([\d.]+)\s*秒/i);
    return m ? `${m[1]}s` : "2s";
  }

  function setStatus(message, state = "idle", title = "Click to resend") {
    let el = document.querySelector("#ac-test-status");
    if (!el) {
      el = document.createElement("button");
      el.id = "ac-test-status";
      el.type = "button";
      Object.assign(el.style, { position:"fixed", right:"16px", bottom:"16px", zIndex:"2147483647", border:"0", borderRadius:"6px", padding:"7px 10px", font:"12px/1.2 system-ui,sans-serif", boxShadow:"0 2px 10px rgb(0 0 0 / 18%)", cursor:"pointer", color:"#fff" });
      el.addEventListener("click", send);
      document.body.append(el);
    }
    el.title = title;
    el.style.background = ({ idle:"#555", sending:"#735c0f", ok:"#18794e", warn:"#9a6700", error:"#b42318" })[state] ?? "#555";
    el.textContent = message;
  }

  function send() {
    const cases = collectSamples();
    if (!cases.length) { setStatus("ac-test: samples not found", "error"); return; }
    const generated = buildGeneratedCases();
    setStatus("ac-test: sending...", "sending");

    GM_xmlhttpRequest({
      method: "POST", url: ENDPOINT, headers: { "Content-Type": "application/json" }, timeout: 5000,
      data: JSON.stringify({ contest, task, url: location.href, timelimit: getTimeLimit(), cases, generated: generated.cases }),
      onload(response) {
        let data;
        try { data = JSON.parse(response.responseText); }
        catch { setStatus(`ac-test: HTTP ${response.status}`, "error"); return; }
        if (response.status >= 200 && response.status < 300 && data.ok) {
          if (data.generated > 0) setStatus(`ac-test: ${data.cases} samples + ${data.generated} stress`, "ok");
          else {
            setStatus("ac-test: samples saved / stress unsupported", "warn", generated.reason || "Click to resend");
            console.info("[ac-test] stress generation skipped:", generated.reason);
          }
          console.info("[ac-test]", data);
        } else setStatus(`ac-test: ${data.error ?? `HTTP ${response.status}`}`, "error");
      },
      ontimeout() { setStatus("ac-test: bridge timeout", "error"); },
      onerror(error) { setStatus("ac-test: bridge offline", "error"); console.error("[ac-test]", error); },
    });
  }

  setTimeout(send, 250);
})();
