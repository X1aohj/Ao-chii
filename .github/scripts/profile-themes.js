// 主页主题素材：P3（蓝 / 水 / 月）与 P5（红 / 黑 / 白），每套出头图、数据面板（P3 另有雷达图），各分深浅两色
const fs = require("fs");
const path = require("path");

const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&apos;",
}[char]));

const fmt = (value) => new Intl.NumberFormat("en-US").format(value);
const sum = (values) => values.reduce((total, value) => total + value, 0);

const SHORT_LANG = {
  TypeScript: "TS",
  JavaScript: "JS",
  Dockerfile: "Docker",
  "Jupyter Notebook": "Jupyter",
};

/*
 * P3R 菜单字体没有官方说法，有社区复刻用 Montserrat 近似。子集化后内嵌，各平台字形一致；
 * 子集只含 ASCII 和 · × – — ’ …，其余字符回退到系统字体。
 */
const embed = (file) => fs.readFileSync(path.join(__dirname, "fonts", file)).toString("base64");
const P3_FONT = "Montserrat,'Segoe UI','Helvetica Neue',Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif";
// 只用两种字重：默认 600 正体写标签，.k 是 800 斜体写名字和数值，.n 让数字等宽对齐
const P3_TYPE = [["montserrat-600.woff2", 600, "normal"], ["montserrat-800-italic.woff2", 800, "italic"]]
  .map(([file, weight, style]) => `@font-face{font-family:Montserrat;font-weight:${weight};font-style:${style};src:url(data:font/woff2;base64,${embed(file)}) format("woff2")}`)
  .join("") + `text{font-family:${P3_FONT};font-weight:600}.k{font-weight:800;font-style:italic}.n{font-variant-numeric:tabular-nums}`;
const P5_FONT = "'Arial Black','Arial Bold',Impact,'Helvetica Neue',sans-serif";

const PALETTES = {
  p3: {
    dark: {
      top: "#0d2a5c", bottom: "#040b1d", ink: "#ffffff", sub: "#8fb8e8", dim: "#36507e",
      accent: "#5ad1ff", accentInk: "#04142e", moon: "#e6f6ff", glint: "#e6f6ff", edge: null,
      langs: ["#5ad1ff", "#2f7fe0", "#a9c8ef", "#3d5c96", "#6f7f99"],
    },
    light: {
      top: "#f6f9fe", bottom: "#dbe8f8", ink: "#0b1f4a", sub: "#3f5f92", dim: "#b4c6e0",
      accent: "#1f6fe0", accentInk: "#ffffff", moon: "#ffffff", glint: "#1f6fe0", edge: "#c9d8ee",
      langs: ["#1f6fe0", "#5ad1ff", "#0b1f4a", "#9fb4d6", "#6d7f9f"],
    },
  },
  p5: {
    dark: {
      bg: "#0b0b0b", ink: "#f4f4f4", sub: "#8c8c8c", red: "#e60012", deep: "#8a0a14",
      black: "#0b0b0b", white: "#f4f4f4", shadow: "#8a0a14", blackStroke: "#f4f4f4", whiteStroke: null,
      langs: ["#e60012", "#f4f4f4", "#8c8c8c", "#8a0a14", "#555555"],
    },
    light: {
      bg: "#f3f0e8", ink: "#111111", sub: "#6b6b6b", red: "#d7000f", deep: "#8a0a14",
      black: "#111111", white: "#ffffff", shadow: "#111111", blackStroke: null, whiteStroke: "#111111",
      langs: ["#d7000f", "#111111", "#8c8c8c", "#8a0a14", "#b0a792"],
    },
  },
};

// 统计窗口：活动柱看最近 31 天，雷达看最近 90 天；生成脚本按这两个数取数据
const BAR_DAYS = 31;
const RADAR_DAYS = 90;

// Persona 式五档：零活动是 1 档，数组是升到 2～5 档所需的 90 天计数
const RADAR = [
  ["COMMITS", "commits", [1, 10, 50, 150]],
  ["PULL REQUESTS", "pullRequests", [1, 3, 10, 30]],
  ["CODE REVIEW", "reviews", [1, 3, 10, 30]],
  ["ISSUES", "issues", [1, 3, 10, 30]],
  ["NEW REPOS", "repositories", [1, 2, 4, 8]],
];

function summarize({ repos, langs, totalLangBytes, buckets, activity }) {
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const top = langs.slice(0, 4);
  const otherBytes = sum(langs.slice(4).map((lang) => lang.bytes));
  const shown = otherBytes > 0 ? [...top, { name: "Other", bytes: otherBytes }] : top;

  return {
    stats: [
      ["REPOS", fmt(repos.length)],
      ["ACTIVE 12M", fmt(repos.filter((repo) => new Date(repo.pushed_at || 0).getTime() >= yearAgo).length)],
      ["STARS", fmt(sum(repos.map((repo) => repo.stargazers_count || 0)))],
      ["TOP LANG", (SHORT_LANG[langs[0]?.name] || langs[0]?.name || "N/A").toUpperCase()],
    ],
    langs: shown.map((lang) => ({
      name: SHORT_LANG[lang.name] || lang.name,
      share: lang.bytes / Math.max(totalLangBytes, 1),
    })),
    buckets,
    total: sum(buckets),
    activeDays: buckets.filter((value) => value > 0).length,
    peak: Math.max(1, ...buckets),
    radar: RADAR.map(([label, key, steps]) => {
      const count = activity[key];
      const rank = 1 + steps.filter((step) => count >= step).length;
      const floor = steps[rank - 2] || 0;
      const next = steps[rank - 1];
      return { label, count, rank, progress: next ? (count - floor) / (next - floor) : 1 };
    }),
  };
}

/*
 * 动效约定：元素的静态属性就是最终画面，动画只描述"从哪来"（fill-mode: backwards）。
 * 渲染端不跑动画、或用户开了减少动态效果时，看到的都是完整的静态图。
 */
const CALM = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";

function langBar(langs, colors, x, y, width, height) {
  let cursor = x;
  return langs.map((lang, index) => {
    const w = lang.share * width;
    const rect = `<rect class="seg" x="${cursor.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${height}" fill="${colors[index % colors.length]}" style="animation-delay:${200 + index * 90}ms" />`;
    cursor += w;
    return rect;
  }).join("");
}

function activityBars(data, x, baseline, width, height, paint) {
  const gap = 4;
  const count = data.buckets.length;
  const w = (width - gap * (count - 1)) / count;
  return data.buckets.map((value, index) => {
    const h = value > 0 ? Math.max(4, (value / data.peak) * height) : 2;
    const { fill, opacity } = paint(value, data.peak);
    return `<rect class="bar" x="${(x + index * (w + gap)).toFixed(1)}" y="${(baseline - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" opacity="${opacity}" style="animation-delay:${300 + index * 22}ms" />`;
  }).join("");
}

// 周期 300 的水波，多画一个周期到 1500，平移 -300 即无缝循环
function wavePath(x0, y, amplitude, x1) {
  let d = `M${x0} ${y} Q${x0 + 75} ${y - amplitude} ${x0 + 150} ${y}`;
  for (let x = x0 + 300; x <= x1; x += 150) d += ` T${x} ${y}`;
  return d;
}

function p3Header(c) {
  const bubbles = [
    [640, 250, 3, 13, -2], [712, 180, 2, 11, -7], [790, 230, 4.5, 15, -4], [880, 270, 2, 10, -5],
    [1010, 200, 2.5, 12, -9], [1080, 260, 5, 16, -1], [1140, 150, 3, 14, -11],
  ].map(([cx, cy, r, dur, delay]) =>
    `<circle class="bubble" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.moon}" stroke-width="1.2" opacity="0.4" style="animation-duration:${dur}s;animation-delay:${delay}s" />`
  ).join("");

  // 四层水纹速度各异，形成流动的视差
  const waves = [[226, 6, 0.10, 14], [244, 9, 0.16, 10], [264, 5, 0.12, 17], [284, 8, 0.18, 8]].map(([y, a, o, dur]) =>
    `<path class="flow" d="${wavePath(0, y, a, 1500)}" stroke="${c.accent}" stroke-width="1.4" fill="none" opacity="${o}" style="animation-duration:${dur}s" />`
  ).join("");

  // 月亮在水面上的倒影
  const glints = [[258, 64, 2.6, 0], [267, 44, 3.1, -1.2], [276, 54, 2.2, -0.6], [285, 30, 3.7, -2], [293, 18, 2.9, -1.5]].map(([y, w, dur, delay]) =>
    `<rect class="glint" x="${930 - w / 2}" y="${y}" width="${w}" height="2" rx="1" fill="${c.glint}" opacity="0.5" style="animation-duration:${dur}s;animation-delay:${delay}s" />`
  ).join("");

  // 新月外套一圈钟面，12 点方向高亮——午夜即影时间
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * Math.PI) / 6;
    const outer = i === 0 ? 120 : 106;
    const p = (r) => [930 + r * Math.sin(angle), 130 - r * Math.cos(angle)].map((v) => v.toFixed(1));
    const [x1, y1] = p(96);
    const [x2, y2] = p(outer);
    return `<g class="tick" style="animation-delay:${600 + i * 110}ms"><line${i === 0 ? ` class="noon"` : ""} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${i === 0 ? c.accent : c.sub}" stroke-width="${i === 0 ? 3 : 1.5}" /></g>`;
  }).join("");

  const surface = wavePath(-300, -24, 12, 1500);

  return `<svg width="1200" height="300" viewBox="0 0 1200 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="t d">
  <title id="t">X1AOHJ</title>
  <desc id="d">Models · Vision · Agents · Tools</desc>
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.top}" />
      <stop offset="1" stop-color="${c.bottom}" />
    </linearGradient>
    <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.moon}" stop-opacity="0.10" />
      <stop offset="1" stop-color="${c.moon}" stop-opacity="0" />
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0" stop-color="${c.accent}" stop-opacity="0.28" />
      <stop offset="1" stop-color="${c.accent}" stop-opacity="0" />
    </radialGradient>
    <mask id="crescent">
      <rect width="1200" height="300" fill="#fff" />
      <circle cx="962" cy="108" r="66" fill="#000" />
    </mask>
    <mask id="water" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="300">
      <path class="level" d="${surface} V340 H-300 Z" fill="#fff" />
    </mask>
    <style>
      ${P3_TYPE}
      .level,.surface{animation:submerge 1.4s cubic-bezier(.45,.05,.2,1) backwards}
      .surface{animation-name:surface}
      @keyframes submerge{from{transform:translate(-150px,330px)}}
      @keyframes surface{from{transform:translate(-150px,330px);opacity:.9}80%{opacity:.7}to{opacity:0}}
      .ring{stroke-dasharray:635;animation:draw 1.6s .5s cubic-bezier(.4,0,.2,1) backwards}
      @keyframes draw{from{stroke-dashoffset:635}}
      .tick{animation:fade .3s backwards}
      .moon{transform-box:fill-box;transform-origin:center;animation:moon 1.4s .9s cubic-bezier(.2,.7,.2,1) backwards}
      @keyframes moon{from{opacity:0;transform:translateY(14px) scale(.94)}}
      .name{animation:surfacing 1s .7s cubic-bezier(.2,.7,.2,1) backwards}
      @keyframes surfacing{from{opacity:0;transform:translateY(14px)}}
      .cursor{animation:cursor .5s 1.1s cubic-bezier(.2,.8,.2,1) backwards}
      @keyframes cursor{from{opacity:0;transform:translateX(-48px)}}
      .meta{animation:fade .8s 1.4s backwards}
      @keyframes fade{from{opacity:0}}
      .flow{animation:flow linear infinite}
      @keyframes flow{to{transform:translateX(-300px)}}
      .ray{transform-box:fill-box;transform-origin:50% 0;animation:sway 9s ease-in-out infinite alternate}
      .ray+.ray{animation-duration:7s;animation-delay:-3s}
      @keyframes sway{from{transform:skewX(-4deg);opacity:.6}to{transform:skewX(4deg);opacity:1}}
      .bubble{animation:bubble linear infinite}
      @keyframes bubble{0%{transform:translateY(160px);opacity:0}15%{opacity:.75}85%{opacity:.5}100%{transform:translateY(-200px);opacity:0}}
      .glint{transform-box:fill-box;transform-origin:center;animation:glint ease-in-out infinite alternate}
      @keyframes glint{from{transform:scaleX(.5);opacity:.2}to{transform:scaleX(1.1);opacity:.75}}
      .hand{transform-box:view-box;transform-origin:930px 130px;animation:orbit 12s linear infinite}
      @keyframes orbit{to{transform:rotate(360deg)}}
      .noon{animation:noon 12s linear infinite}
      @keyframes noon{0%,100%{opacity:1}8%,92%{opacity:.3}}
      .glow{transform-box:fill-box;transform-origin:center;animation:midnight 12s ease-in-out infinite}
      @keyframes midnight{0%,100%{opacity:1;transform:scale(1.08)}14%,86%{opacity:.65;transform:scale(.96)}}
      ${CALM}
    </style>
  </defs>
  <rect width="1200" height="300" fill="url(#sea)" />
  ${c.edge ? `<rect x="0.5" y="0.5" width="1199" height="299" fill="none" stroke="${c.edge}" />` : ""}
  <g mask="url(#water)">
    <polygon class="ray" points="200,0 300,0 140,300 60,300" fill="url(#ray)" />
    <polygon class="ray" points="420,0 470,0 330,300 290,300" fill="url(#ray)" />
    ${waves}
    ${glints}
    <circle class="glow" cx="930" cy="130" r="190" fill="url(#glow)" />
    <circle class="ring" cx="930" cy="130" r="101" fill="none" stroke="${c.sub}" stroke-width="1" opacity="0.5" transform="rotate(-90 930 130)" />
    <g class="moon">
      <circle cx="930" cy="130" r="78" fill="${c.moon}" stroke="${c.accent}" stroke-width="1.5" stroke-opacity="0.5" mask="url(#crescent)" />
    </g>
    ${ticks}
    <g class="hand">
      <circle cx="930" cy="130" r="101" fill="none" stroke="${c.accent}" stroke-width="2" stroke-dasharray="70 565" stroke-dashoffset="70" opacity="0.8" transform="rotate(-90 930 130)" />
      <circle cx="930" cy="29" r="3.5" fill="${c.accent}" />
    </g>
    ${bubbles}
    <g class="name">
      <text class="k" x="66" y="146" fill="${c.ink}" font-size="104" letter-spacing="2">X1AOHJ</text>
    </g>
    <g class="cursor">
      <polygon points="74,180 608,174 600,212 66,218" fill="none" stroke="${c.accent}" stroke-width="1.5" opacity="0.45" />
      <polygon points="64,172 598,166 590,204 56,210" fill="${c.accent}" />
      <text class="k" x="84" y="196" fill="${c.accentInk}" font-size="20" letter-spacing="3.5">MODELS · VISION · AGENTS · TOOLS</text>
    </g>
    <g class="meta">
      <text x="66" y="264" fill="${c.sub}" font-size="16" letter-spacing="4">SOFTWARE ENGINEERING × AI</text>
      <text x="1134" y="280" fill="${c.sub}" font-size="14" letter-spacing="6" text-anchor="end">MEMENTO MORI</text>
    </g>
  </g>
  <path class="surface" d="${surface}" stroke="${c.moon}" stroke-width="2" fill="none" opacity="0" />
</svg>`;
}

function p3Dashboard(c, data) {
  const stats = data.stats.map(([label, value], index) => {
    const x = 40 + index * 230;
    const divider = index > 0
      ? `<line x1="${x - 20}" y1="82" x2="${x - 20}" y2="140" stroke="${c.dim}" stroke-width="1" />`
      : "";
    // 大写粗斜体平均约 0.76em 宽，栏宽 190：长语言名按字数缩小，不挤进下一栏
    const size = Math.min(38, Math.floor(190 / (0.76 * value.length)));
    return `${divider}
    <text x="${x}" y="96" fill="${c.sub}" font-size="14" letter-spacing="3">${esc(label)}</text>
    <text class="k" x="${x}" y="138" fill="${c.ink}" font-size="${size}">${esc(value)}</text>`;
  }).join("");

  const legend = data.langs.map((lang, index) => {
    const x = 40 + (index % 2) * 210;
    const y = 250 + Math.floor(index / 2) * 24;
    return `
    <rect x="${x + 1}" y="${y - 9}" width="8" height="8" fill="${c.langs[index % c.langs.length]}" transform="rotate(45 ${x + 5} ${y - 5})" />
    <text x="${x + 18}" y="${y}" fill="${c.ink}" font-size="14">${esc(lang.name)}</text>
    <text class="n" x="${x + 180}" y="${y}" fill="${c.sub}" font-size="14" text-anchor="end">${(lang.share * 100).toFixed(1)}%</text>`;
  }).join("");

  const bars = activityBars(data, 500, 296, 420, 70, (value, peak) => value > 0
    ? { fill: c.accent, opacity: (0.4 + 0.6 * (value / peak)).toFixed(2) }
    : { fill: c.dim, opacity: 1 });

  return `<svg width="960" height="330" viewBox="0 0 960 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="t d">
  <title id="t">X1AOHJ status</title>
  <desc id="d">Self-generated GitHub statistics, language mix and ${BAR_DAYS}-day activity.</desc>
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.top}" />
      <stop offset="1" stop-color="${c.bottom}" />
    </linearGradient>
    <style>
      ${P3_TYPE}
      .bar{transform-box:fill-box;transform-origin:50% 100%;animation:fill 1.1s cubic-bezier(.3,.7,.2,1) backwards}
      @keyframes fill{from{transform:scaleY(0)}}
      .seg{transform-box:fill-box;transform-origin:0 50%;animation:wipe .8s cubic-bezier(.3,.7,.2,1) backwards}
      @keyframes wipe{from{transform:scaleX(0)}}
      ${CALM}
    </style>
  </defs>
  <rect width="960" height="330" fill="url(#sea)" />
  ${c.edge ? `<rect x="0.5" y="0.5" width="959" height="329" fill="none" stroke="${c.edge}" />` : ""}
  <polygon points="30,22 204,18 198,48 24,52" fill="${c.accent}" />
  <text class="k" x="44" y="41" fill="${c.accentInk}" font-size="16" letter-spacing="4">STATUS</text>
  ${stats}
  <line x1="40" y1="172" x2="920" y2="172" stroke="${c.dim}" stroke-width="1" />
  <line x1="40" y1="172" x2="100" y2="172" stroke="${c.accent}" stroke-width="2" />
  <text x="40" y="204" fill="${c.sub}" font-size="14" letter-spacing="3">LANGUAGES</text>
  <rect x="40" y="216" width="400" height="8" fill="${c.dim}" />
  ${langBar(data.langs, c.langs, 40, 216, 400, 8)}
  ${legend}
  <text x="500" y="204" fill="${c.sub}" font-size="14" letter-spacing="3">LAST ${BAR_DAYS} DAYS</text>
  <text x="920" y="204" fill="${c.sub}" font-size="12" letter-spacing="0.5" text-anchor="end"><tspan class="k" fill="${c.ink}">${esc(fmt(data.total))}</tspan> CONTRIBUTIONS · <tspan class="k" fill="${c.ink}">${esc(data.activeDays)}</tspan> ACTIVE DAYS</text>
  ${bars}
  <text x="500" y="316" fill="${c.sub}" font-size="12" letter-spacing="2">-${BAR_DAYS - 1}D</text>
  <text x="920" y="316" fill="${c.sub}" font-size="12" letter-spacing="2" text-anchor="end">TODAY</text>
</svg>`;
}

// 雷达五轴从 12 点起顺时针；标签相对顶点的偏移和对齐方式按所在方位定
const RADAR_LABEL = [[0, -14, "middle"], [14, 4, "start"], [8, 21, "start"], [-8, 21, "end"], [-14, 4, "end"]];

function p3Radar(c, data) {
  const cx = 260;
  const cy = 192;
  const R = 96;
  const at = (index, radius) => {
    const angle = ((index * 72 - 90) * Math.PI) / 180;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  };
  const xy = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;

  const rings = [1, 2, 3, 4, 5].map((rank) => {
    const points = data.radar.map((_, index) => xy(at(index, (R * rank) / 5))).join(" ");
    return `<polygon points="${points}" fill="none" stroke="${rank === 5 ? c.sub : c.dim}" stroke-width="1" opacity="${rank === 5 ? 0.6 : 1}" />`;
  }).join("");

  const axes = data.radar.map((stat, index) => {
    const [x, y] = at(index, R);
    const [dx, dy, anchor] = RADAR_LABEL[index];
    return `
    <line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${c.dim}" stroke-width="1" />
    <text x="${(x + dx).toFixed(1)}" y="${(y + dy).toFixed(1)}" fill="${c.sub}" font-size="12" letter-spacing="2" text-anchor="${anchor}">${esc(stat.label)}</text>`;
  }).join("");

  const vertices = data.radar.map((stat, index) => at(index, (R * stat.rank) / 5));
  const dots = vertices.map(([x, y]) =>
    `<rect x="${(x - 3.5).toFixed(1)}" y="${(y - 3.5).toFixed(1)}" width="7" height="7" fill="${c.accent}" transform="rotate(45 ${x.toFixed(1)} ${y.toFixed(1)})" />`
  ).join("");

  // 右侧列表：计数 + 五格段位条，下一格按升档进度填一部分
  const rows = data.radar.map((stat, index) => {
    const y = 100 + index * 46;
    const blocks = Array.from({ length: 5 }, (_, k) => {
      const x = 792 + k * 26;
      const fill = k < stat.rank ? 1 : k === stat.rank ? stat.progress : 0;
      const block = (w) => `${x + 3},${y - 11} ${(x + 3 + w).toFixed(1)},${y - 11} ${(x + w).toFixed(1)},${y} ${x},${y}`;
      const filled = fill > 0
        ? `<polygon class="blk" points="${block(22 * fill)}" fill="${c.accent}" style="animation-delay:${600 + index * 120 + k * 60}ms" />`
        : "";
      return `<polygon points="${block(22)}" fill="${c.dim}" />${filled}`;
    }).join("");
    const rule = index < data.radar.length - 1
      ? `<line x1="530" y1="${y + 16}" x2="920" y2="${y + 16}" stroke="${c.dim}" stroke-width="1" opacity="0.6" />`
      : "";
    return `
    <text x="530" y="${y}" fill="${c.sub}" font-size="14" letter-spacing="3">${esc(stat.label)}</text>
    <text class="k" x="770" y="${y}" fill="${c.ink}" font-size="24" text-anchor="end">${esc(fmt(stat.count))}</text>
    ${blocks}
    ${rule}`;
  }).join("");

  return `<svg width="960" height="330" viewBox="0 0 960 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="t d">
  <title id="t">X1AOHJ activity</title>
  <desc id="d">GitHub contributions by type over the last ${RADAR_DAYS} days: ${esc(data.radar.map((stat) => `${stat.label.toLowerCase()} ${stat.count}`).join(", "))}.</desc>
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.top}" />
      <stop offset="1" stop-color="${c.bottom}" />
    </linearGradient>
    <style>
      ${P3_TYPE}
      .shape{transform-box:view-box;transform-origin:${cx}px ${cy}px;animation:grow 1.1s .3s cubic-bezier(.3,.7,.2,1) backwards}
      @keyframes grow{from{transform:scale(0)}}
      .dots{animation:fade .5s 1.2s backwards}
      @keyframes fade{from{opacity:0}}
      .blk{transform-box:fill-box;transform-origin:0 50%;animation:wipe .5s cubic-bezier(.3,.7,.2,1) backwards}
      @keyframes wipe{from{transform:scaleX(0)}}
      .ripple{transform-box:view-box;transform-origin:${cx}px ${cy}px;animation:ripple 6s 2s ease-out infinite}
      @keyframes ripple{from{transform:scale(.15);opacity:.45}to{transform:scale(1.15);opacity:0}}
      ${CALM}
    </style>
  </defs>
  <rect width="960" height="330" fill="url(#sea)" />
  ${c.edge ? `<rect x="0.5" y="0.5" width="959" height="329" fill="none" stroke="${c.edge}" />` : ""}
  <polygon points="30,22 204,18 198,48 24,52" fill="${c.accent}" />
  <text class="k" x="44" y="41" fill="${c.accentInk}" font-size="16" letter-spacing="4">ACTIVITY</text>
  <text x="920" y="41" fill="${c.sub}" font-size="14" letter-spacing="3" text-anchor="end">LAST ${RADAR_DAYS} DAYS</text>
  ${rings}
  ${axes}
  <circle class="ripple" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${c.accent}" stroke-width="1.2" opacity="0" />
  <g class="shape">
    <polygon points="${vertices.map(xy).join(" ")}" fill="${c.accent}" fill-opacity="0.22" stroke="${c.accent}" stroke-width="2" stroke-linejoin="round" />
  </g>
  <g class="dots">${dots}</g>
  ${rows}
</svg>`;
}

// 勒索信拼贴字：每个字母独立的底色、字体和倾角，只用在名字上
const RANSOM = [
  { ch: "X", box: "white", text: "black", x: 72, y: 70, w: 96, h: 112, rot: -4, font: "'Arial Black',Impact,sans-serif", size: 86 },
  { ch: "1", box: "red", text: "white", x: 180, y: 88, w: 76, h: 100, rot: 3, font: "Georgia,'Times New Roman',serif", size: 88, weight: 700 },
  { ch: "A", box: "black", text: "white", x: 268, y: 66, w: 96, h: 120, rot: -2, font: "Impact,'Arial Black',sans-serif", size: 100 },
  { ch: "O", box: "white", text: "red", x: 376, y: 86, w: 94, h: 102, rot: 5, font: "'Courier New',Courier,monospace", size: 96, weight: 700 },
  { ch: "H", box: "red", text: "black", x: 482, y: 72, w: 92, h: 112, rot: -3, font: "'Arial Black',Impact,sans-serif", size: 82 },
  { ch: "J", box: "white", text: "black", x: 586, y: 88, w: 80, h: 100, rot: 2, font: "'Times New Roman',Times,serif", size: 96, weight: 700, italic: true },
];

function p5Header(c) {
  // 外层负责倾角，slam 负责入场砸落，hop 负责常驻的周期性跳动——三者各占一层 transform 互不覆盖
  const letters = RANSOM.map((l, index) => {
    const cx = l.x + l.w / 2;
    const cy = l.y + l.h / 2;
    const stroke = c[`${l.box}Stroke`];
    return `
  <g transform="rotate(${l.rot} ${cx} ${cy})">
    <g class="slam" style="animation-delay:${300 + index * 70}ms">
      <g class="hop" style="animation-delay:${2400 + index * 90}ms">
        <rect x="${l.x + 6}" y="${l.y + 6}" width="${l.w}" height="${l.h}" fill="${c.shadow}" />
        <rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" fill="${c[l.box]}"${stroke ? ` stroke="${stroke}" stroke-width="3"` : ""} />
        <text x="${cx}" y="${(cy + l.size * 0.36).toFixed(1)}" fill="${c[l.text]}" font-family="${l.font}" font-size="${l.size}" font-weight="${l.weight || 900}"${l.italic ? ` font-style="italic"` : ""} text-anchor="middle">${l.ch}</text>
      </g>
    </g>
  </g>`;
  }).join("");

  return `<svg width="1200" height="300" viewBox="0 0 1200 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="t d">
  <title id="t">X1AOHJ</title>
  <desc id="d">Models / Vision / Agents / Tools — Steal the noise, ship the signal.</desc>
  <defs>
    <pattern id="dot" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
      <circle cx="4" cy="4" r="2.8" fill="${c.deep}" />
    </pattern>
    <linearGradient id="fadeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" />
      <stop offset="1" stop-color="#fff" />
    </linearGradient>
    <mask id="fade"><rect x="700" width="500" height="300" fill="url(#fadeGrad)" /></mask>
    <clipPath id="field"><polygon points="800,0 1200,0 1200,300 700,300" /></clipPath>
    <style>
      text{font-family:${P5_FONT}}
      .field,.slash{animation:charge .42s cubic-bezier(.2,.9,.1,1) backwards}
      .slash{animation-delay:.07s}
      @keyframes charge{from{transform:translateX(560px)}}
      .dots{animation:drift 2.4s linear infinite}
      @keyframes drift{to{transform:translate(-13.156px,-4.788px)}}
      .slam,.hop{transform-box:fill-box;transform-origin:center}
      .slam{animation:slam .34s cubic-bezier(.2,.8,.2,1) backwards}
      @keyframes slam{0%{opacity:0;transform:scale(2.4) rotate(-16deg)}55%{opacity:1;transform:scale(.9) rotate(4deg)}100%{transform:none}}
      .hop{animation:hop 6s ease-out infinite}
      @keyframes hop{0%,90%,100%{transform:none}93%{transform:translateY(-8px) rotate(-4deg)}96%{transform:translateY(1px) rotate(1deg)}}
      .rule{transform-box:fill-box;transform-origin:0 50%;animation:grow .22s .78s cubic-bezier(.2,.8,.2,1) backwards}
      @keyframes grow{from{transform:scaleX(0)}}
      .tagline{animation:from-left .3s .84s cubic-bezier(.2,.8,.2,1) backwards}
      @keyframes from-left{from{opacity:0;transform:translateX(-40px)}}
      .s1,.s2{animation:from-right .3s .9s cubic-bezier(.2,.8,.2,1) backwards}
      .s2{animation-delay:1s}
      @keyframes from-right{from{opacity:0;transform:translateX(90px)}}
      ${CALM}
    </style>
  </defs>
  <rect width="1200" height="300" fill="${c.bg}" />
  <g class="field">
    <polygon points="800,0 1200,0 1200,300 700,300" fill="${c.red}" />
    <g clip-path="url(#field)" mask="url(#fade)" opacity="0.6">
      <rect class="dots" x="660" y="-40" width="600" height="380" fill="url(#dot)" />
    </g>
  </g>
  <polygon class="slash" points="772,0 786,0 686,300 672,300" fill="${c.ink}" />
  ${letters}
  <rect class="rule" x="72" y="220" width="48" height="6" fill="${c.red}" />
  <text class="tagline" x="72" y="256" fill="${c.ink}" font-size="22" font-weight="900" font-style="italic" letter-spacing="2">MODELS / VISION / AGENTS / TOOLS</text>
  <text class="s1" x="1150" y="206" fill="${c.black}" font-size="30" font-weight="900" font-style="italic" text-anchor="end">STEAL THE NOISE.</text>
  <text class="s2" x="1150" y="244" fill="${c.white}" font-size="30" font-weight="900" font-style="italic" text-anchor="end">SHIP THE SIGNAL.</text>
</svg>`;
}

function p5Dashboard(c, data) {
  const stats = data.stats.map(([label, value], index) => {
    const x = 40 + index * 230;
    return `
    <rect x="${x}" y="95" width="8" height="8" fill="${c.red}" />
    <text x="${x + 16}" y="104" fill="${c.sub}" font-size="13" font-weight="900" letter-spacing="2">${esc(label)}</text>
    <text x="${x}" y="148" fill="${c.ink}" font-size="40" font-weight="900" font-style="italic">${esc(value)}</text>`;
  }).join("");

  const legend = data.langs.map((lang, index) => {
    const x = 40 + (index % 2) * 210;
    const y = 252 + Math.floor(index / 2) * 24;
    const color = c.langs[index % c.langs.length];
    return `
    <rect x="${x}" y="${y - 10}" width="10" height="10" fill="${color}"${color === c.bg ? ` stroke="${c.ink}"` : ""} />
    <text x="${x + 18}" y="${y}" fill="${c.ink}" font-size="14" font-weight="900">${esc(lang.name.toUpperCase())}</text>
    <text x="${x + 180}" y="${y}" fill="${c.sub}" font-size="13" font-weight="900" text-anchor="end">${(lang.share * 100).toFixed(1)}%</text>`;
  }).join("");

  // 平涂红柱，峰值那天反色突出
  const bars = activityBars(data, 500, 296, 420, 70, (value, peak) => {
    if (value === 0) return { fill: c.sub, opacity: 0.35 };
    return { fill: value === peak ? c.ink : c.red, opacity: 1 };
  });

  return `<svg width="960" height="330" viewBox="0 0 960 330" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="t d">
  <title id="t">X1AOHJ dossier</title>
  <desc id="d">Self-generated GitHub statistics, language mix and ${BAR_DAYS}-day activity.</desc>
  <style>
    text{font-family:${P5_FONT}}
    .bar{transform-box:fill-box;transform-origin:50% 100%;animation:pop .45s cubic-bezier(.2,.9,.2,1) backwards}
    @keyframes pop{0%{transform:scaleY(0)}70%{transform:scaleY(1.18)}100%{transform:none}}
    .seg{transform-box:fill-box;transform-origin:0 50%;animation:wipe .25s cubic-bezier(.2,.9,.1,1) backwards}
    @keyframes wipe{from{transform:scaleX(0)}}
    ${CALM}
  </style>
  <rect width="960" height="330" fill="${c.bg}" />
  <polygon points="0,0 330,0 296,58 0,66" fill="${c.red}" />
  <text x="32" y="42" fill="${c.white}" font-size="24" font-weight="900" font-style="italic" letter-spacing="1">PROFILE DOSSIER</text>
  ${stats}
  <rect x="40" y="174" width="880" height="1" fill="${c.sub}" opacity="0.5" />
  <rect x="40" y="172" width="80" height="4" fill="${c.red}" />
  <text x="40" y="206" fill="${c.sub}" font-size="13" font-weight="900" letter-spacing="2">LANGUAGES</text>
  <rect x="40" y="218" width="400" height="10" fill="${c.sub}" opacity="0.35" />
  ${langBar(data.langs, c.langs, 40, 218, 400, 10)}
  ${legend}
  <text x="500" y="206" fill="${c.sub}" font-size="13" font-weight="900" letter-spacing="2">LAST ${BAR_DAYS} DAYS</text>
  <text x="920" y="206" fill="${c.sub}" font-size="12" font-weight="900" text-anchor="end"><tspan fill="${c.ink}">${esc(fmt(data.total))}</tspan> CONTRIBUTIONS · <tspan fill="${c.ink}">${esc(data.activeDays)}</tspan> ACTIVE DAYS</text>
  ${bars}
  <text x="500" y="316" fill="${c.sub}" font-size="11" font-weight="900" letter-spacing="2">-${BAR_DAYS - 1}D</text>
  <text x="920" y="316" fill="${c.sub}" font-size="11" font-weight="900" letter-spacing="2" text-anchor="end">TODAY</text>
</svg>`;
}

const RENDERERS = {
  p3: { header: p3Header, dashboard: p3Dashboard, radar: p3Radar },
  p5: { header: p5Header, dashboard: p5Dashboard },
};

function writeThemeAssets(outDir, input) {
  const data = summarize(input);
  const written = [];

  for (const [theme, modes] of Object.entries(PALETTES)) {
    const dir = path.join(outDir, theme);
    fs.mkdirSync(dir, { recursive: true });
    for (const [mode, palette] of Object.entries(modes)) {
      for (const [kind, render] of Object.entries(RENDERERS[theme])) {
        const file = path.join(dir, `${kind}-${mode}.svg`);
        fs.writeFileSync(file, render(palette, data).trim() + "\n");
        written.push(file);
      }
    }
  }

  return written;
}

module.exports = { writeThemeAssets, BAR_DAYS, RADAR_DAYS };
