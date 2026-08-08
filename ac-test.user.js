// ==UserScript==
// @name         ac-test
// @namespace    local.ac-test
// @version      0.2.0
// @description  Export AtCoder samples and simple Level-1 boundary/stress inputs
// @match        https://atcoder.jp/contests/*/tasks/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const ENDPOINT = "http://127.0.0.1:27121/testcases";

  const pathMatch = location.pathname.match(
    /^\/contests\/([^/]+)\/tasks\/([^/]+)\/?$/,
  );
  if (!pathMatch) return;

  const [, contest, task] = pathMatch;

  function normalizeText(text) {
    return text
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[−–—]/g, "-")
      .replace(/[×✕]/g, "*")
      .replace(/[≤≦]/g, "<=")
      .replace(/[≥≧]/g, ">=")
      .replace(/\u2026/g, "...")
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
      .filter(([, v]) => v.input != null && v.output != null)
      .map(([number, v]) => ({
        name: `sample${number}`,
        input: v.input,
        output: v.output,
      }));
  }

  function findSection(names) {
    const wanted = names.map((x) => x.toLowerCase());
    for (const heading of document.querySelectorAll("h2, h3")) {
      const title = (heading.textContent ?? "").trim().toLowerCase();
      if (!wanted.some((name) => title === name || title.startsWith(`${name} `))) {
        continue;
      }

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

  function sectionText(section) {
    return normalizeText(section?.nodes.map((n) => n.textContent ?? "").join("\n") ?? "");
  }

  function sectionPre(section) {
    for (const node of section?.nodes ?? []) {
      if (node.matches?.("pre")) return normalizeText(node.textContent ?? "");
      const pre = node.querySelector?.("pre");
      if (pre) return normalizeText(pre.textContent ?? "");
    }
    return null;
  }

  function parseNumberExpression(raw, vars = {}) {
    let s = normalizeText(raw)
      .replace(/\s+/g, "")
      .replace(/[{}]/g, "")
      .replace(/\\times/g, "*")
      .replace(/\\cdot/g, "*")
      .replace(/10\^\(?([+-]?\d+)\)?/g, (_, p) => `10**${p}`)
      .replace(/10\^([+-]?\d+)/g, (_, p) => `10**${p}`);

    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(s) && Number.isFinite(vars[s])) {
      return vars[s];
    }

    // Only allow a deliberately small arithmetic grammar.
    if (!/^[0-9+\-*/().*]+$/.test(s)) return null;
    try {
      const value = Function(`"use strict"; return (${s});`)();
      return Number.isSafeInteger(value) ? value : null;
    } catch {
      return null;
    }
  }

  function canonicalVar(raw) {
    return normalizeText(raw)
      .replace(/\s+/g, "")
      .replace(/[{}]/g, "")
      .replace(/\\_/g, "_")
      .replace(/_\{?i\}?/gi, "_i")
      .replace(/_\{?(\d+)\}?/g, "_$1");
  }

  function parseBounds(constraintsText) {
    const bounds = new Map();
    const lines = constraintsText
      .split("\n")
      .map((x) => normalizeText(x).trim())
      .filter(Boolean);

    const add = (name, minRaw, maxRaw) => {
      name = canonicalVar(name);
      if (!/^[A-Za-z][A-Za-z0-9_]*(?:_i)?$/.test(name)) return;
      const current = bounds.get(name) ?? {};
      bounds.set(name, {
        minRaw: minRaw ?? current.minRaw,
        maxRaw: maxRaw ?? current.maxRaw,
      });
    };

    for (const line0 of lines) {
      const line = line0
        .replace(/[。．.]$/, "")
        .replace(/\\leq?/g, "<=")
        .replace(/\\geq?/g, ">=")
        .replace(/\$/g, "")
        .replace(/\s+/g, "");

      // 1 <= N <= 200000, 1 <= A_i <= N
      let m = line.match(/^(.+?)<=([A-Za-z][A-Za-z0-9_{}]*(?:_i|_\{?i\}?)?)<=(.+?)(?:\([^)]*\))?$/i);
      if (m) {
        add(m[2], m[1], m[3]);
        continue;
      }

      // 1 <= N,M <= 200000
      m = line.match(/^(.+?)<=([A-Za-z][A-Za-z0-9_{}]*(?:,[A-Za-z][A-Za-z0-9_{}]*)+)<=(.+)$/i);
      if (m) {
        for (const name of m[2].split(",")) add(name, m[1], m[3]);
        continue;
      }

      // N <= 200000
      m = line.match(/^([A-Za-z][A-Za-z0-9_{}]*)<=(.+)$/i);
      if (m) add(m[1], null, m[2]);
    }

    return bounds;
  }

  function parseInputSchema(inputText) {
    if (!inputText) return null;
    const lines = inputText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const rows = [];
    for (const line of lines) {
      const clean = line
        .replace(/\$/g, "")
        .replace(/\\ldots|\\cdots|…/g, "...")
        .replace(/[{}]/g, "")
        .replace(/\\_/g, "_")
        .replace(/\s+/g, " ")
        .trim();

      const tokens = clean.split(/\s+/);

      // A_1 A_2 ... A_N
      if (tokens.length >= 4 && tokens.includes("...")) {
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

  function resolveBound(boundRaw, vars, fallback) {
    if (boundRaw == null) return fallback;
    const canonical = canonicalVar(boundRaw);
    if (Number.isFinite(vars[canonical])) return vars[canonical];
    const parsed = parseNumberExpression(boundRaw, vars);
    return parsed ?? fallback;
  }

  function seededRandom(seed) {
    let x = seed >>> 0;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 0x100000000;
    };
  }

  function buildGeneratedCases() {
    const constraints = findSection(["制約", "Constraints"]);
    const input = findSection(["入力", "Input"]);
    const bounds = parseBounds(sectionText(constraints));
    const schema = parseInputSchema(sectionPre(input));

    if (!constraints || !schema || bounds.size === 0) {
      return { cases: [], reason: "constraints/input unsupported" };
    }

    const scalarNames = [...new Set(
      schema.flatMap((row) => row.kind === "scalars" ? row.vars : [row.lengthVar]),
    )];

    // Every scalar used structurally must have a finite integer range.
    for (const name of scalarNames) {
      const b = bounds.get(name);
      if (!b) return { cases: [], reason: `no bounds for ${name}` };
      const min = parseNumberExpression(b.minRaw ?? "1");
      const max = parseNumberExpression(b.maxRaw ?? "");
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
        return { cases: [], reason: `unsupported bounds for ${name}` };
      }
    }

    for (const row of schema) {
      if (row.kind === "array" && !bounds.has(row.name)) {
        return { cases: [], reason: `no bounds for ${row.name}` };
      }
    }

    function make(mode) {
      const vars = {};
      const rnd = seededRandom(0xac7e57 ^ task.length ^ mode.length);

      // Set scalar/size variables first so dependent bounds such as A_i <= N resolve.
      for (const name of scalarNames) {
        const b = bounds.get(name);
        const min = parseNumberExpression(b.minRaw ?? "1") ?? 1;
        const max = parseNumberExpression(b.maxRaw ?? String(min)) ?? min;
        let value;
        switch (mode) {
          case "min": value = min; break;
          case "near-min": value = Math.min(max, min + 1); break;
          case "near-max": value = Math.max(min, max - 1); break;
          case "random": value = max; break; // keep structural sizes maximal for stress
          default: value = max;
        }
        vars[name] = value;
      }

      const lines = [];
      for (const row of schema) {
        if (row.kind === "scalars") {
          lines.push(row.vars.map((name) => String(vars[name])).join(" "));
          continue;
        }

        const len = vars[row.lengthVar];
        if (!Number.isSafeInteger(len) || len < 0 || len > 2_000_000) return null;

        const b = bounds.get(row.name);
        const min = resolveBound(b.minRaw, vars, 1);
        const max = resolveBound(b.maxRaw, vars, min);
        if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) return null;

        const values = new Array(len);
        for (let i = 0; i < len; i++) {
          let value;
          switch (mode) {
            case "min": value = min; break;
            case "near-min": value = Math.min(max, min + 1); break;
            case "near-max": value = Math.max(min, max - 1); break;
            case "random": {
              const span = max - min + 1;
              value = span <= Number.MAX_SAFE_INTEGER
                ? min + Math.floor(rnd() * span)
                : min;
              break;
            }
            default: value = max;
          }
          values[i] = String(value);
        }
        lines.push(values.join(" "));
      }
      return lines.join("\n");
    }

    const specs = [
      ["min", "min"],
      ["near-min", "near-min"],
      ["near-max", "near-max"],
      ["max", "max"],
      ["random-max", "random"],
    ];

    const cases = specs
      .map(([name, mode]) => ({ name, input: make(mode) }))
      .filter((x) => x.input != null);

    return cases.length
      ? { cases, reason: null }
      : { cases: [], reason: "could not generate valid integer cases" };
  }

  function getTimeLimit() {
    const text = document.querySelector("#main-container")?.textContent ?? document.body.textContent ?? "";
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
      el.title = "Click to resend";
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
      warn: "#9a6700",
      error: "#b42318",
    };
    el.style.background = backgrounds[state] ?? backgrounds.idle;
    el.textContent = message;
  }

  function send() {
    const cases = collectSamples();
    if (cases.length === 0) {
      setStatus("ac-test: samples not found", "error");
      return;
    }

    const generated = buildGeneratedCases();
    setStatus(`ac-test: sending…`, "sending");

    GM_xmlhttpRequest({
      method: "POST",
      url: ENDPOINT,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        contest,
        task,
        url: location.href,
        timelimit: getTimeLimit(),
        cases,
        generated: generated.cases,
      }),
      timeout: 5000,

      onload(response) {
        let data;
        try {
          data = JSON.parse(response.responseText);
        } catch {
          setStatus(`ac-test: HTTP ${response.status}`, "error");
          return;
        }

        if (response.status >= 200 && response.status < 300 && data.ok) {
          if (data.generated > 0) {
            setStatus(`ac-test: ${data.cases} samples + ${data.generated} stress`, "ok");
          } else {
            setStatus(`ac-test: samples saved / stress unsupported`, "warn");
            console.info("[ac-test] stress generation skipped:", generated.reason);
          }
          console.info("[ac-test]", data);
        } else {
          setStatus(`ac-test: ${data.error ?? `HTTP ${response.status}`}`, "error");
          console.error("[ac-test]", data);
        }
      },

      ontimeout() {
        setStatus("ac-test: bridge timeout", "error");
      },
      onerror(error) {
        setStatus("ac-test: bridge offline", "error");
        console.error("[ac-test]", error);
      },
    });
  }

  setTimeout(send, 250);
})();
