// ============================================================
// LeadAnalytics — frontend (v2)
// ============================================================

const state = {
    all: [],
    filtered: [],
    selected: null,
    chip: "all",
    sort: { key: "score", dir: "desc" },
    overview: null,
    map: null,
    cluster: null,
    near: { active: false, anchor: null, radius: 1.0, circle: null },
};

const CITY_COORDS = {
    "Москва": [55.7558, 37.6173], "Санкт-Петербург": [59.9343, 30.3351],
    "Новосибирск": [55.0084, 82.9357], "Екатеринбург": [56.8389, 60.6057],
    "Казань": [55.7887, 49.1221], "Нижний Новгород": [56.3269, 44.0059],
    "Краснодар": [45.0355, 38.9753], "Сочи": [43.6028, 39.7342],
    "Владивосток": [43.1198, 131.8869],
};

const CATEGORY_ICONS = {
    cafe: "fa-mug-hot", bakery: "fa-bread-slice", confectionery: "fa-cake-candles",
    restaurant: "fa-utensils", fast_food: "fa-burger", beauty: "fa-scissors", florist: "fa-seedling",
};
const FOOD = new Set(["cafe", "bakery", "confectionery", "restaurant", "fast_food"]);
const CUISINE_RU = {
    russian: "русская", italian: "итальянская", pizza: "пицца", sushi: "суши", japanese: "японская",
    chinese: "китайская", georgian: "грузинская", american: "американская", burger: "бургеры",
    coffee_shop: "кофейня", coffee: "кофе", kebab: "шаурма", asian: "азиатская", european: "европейская",
    seafood: "морепродукты", vegetarian: "вегетарианская", french: "французская", mexican: "мексиканская",
    indian: "индийская", thai: "тайская", korean: "корейская", dessert: "десерты", ice_cream: "мороженое",
    regional: "местная", fast_food: "фастфуд", bakery: "выпечка", breakfast: "завтраки", tea: "чай",
};
const cuisineRu = (s) => String(s || "").split(/,\s*/).map((t) => CUISINE_RU[t.trim()] || t.trim()).join(", ");
const SCORE_HEX = { HIGH: "#34d399", MEDIUM: "#a78bfa", LOW: "#f87171" };
const COLOR_VAR = { success: "var(--success)", primary: "var(--violet)", warning: "var(--warning)", danger: "var(--danger)" };
const STATUSES = [
    { k: "new", l: "Новый" }, { k: "contacted", l: "Написал" }, { k: "replied", l: "Ответил" },
    { k: "working", l: "В работе" }, { k: "skip", l: "Отказ" },
];
const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.k, s.l]));

const $ = (s) => document.querySelector(s);

// ---------------- CRM (localStorage) ----------------
const CRM_KEY = "la_crm_v1";
let CRM = {};
try { CRM = JSON.parse(localStorage.getItem(CRM_KEY)) || {}; } catch { CRM = {}; }
const crm = (id) => CRM[id] || { status: "new", fav: false, notes: "" };
function setCrm(id, patch) {
    CRM[id] = { ...crm(id), ...patch };
    localStorage.setItem(CRM_KEY, JSON.stringify(CRM));
}

document.addEventListener("DOMContentLoaded", init);

async function init() {
    initMap();
    setupListeners();
    setupFilters();
    await Promise.all([loadCities(), loadCategories()]);
}

// ---------------- Map ----------------
function initMap() {
    state.map = L.map("map", { zoomControl: true, attributionControl: false }).setView(CITY_COORDS["Москва"], 11);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 20 }).addTo(state.map);
    state.cluster = L.markerClusterGroup
        ? L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50, showCoverageOnHover: false })
        : L.layerGroup();
    state.map.addLayer(state.cluster);

    state.map.on("click", (e) => {
        if (!state.near.active) return;
        state.near.anchor = [e.latlng.lat, e.latlng.lng];
        drawNearCircle();
        $("#near-hint").textContent = "Точка установлена. Показываем заведения в радиусе.";
        $("#near-controls").classList.add("active");
        applyFilters();
    });
}

function drawNearCircle() {
    if (state.near.circle) state.map.removeLayer(state.near.circle);
    if (!state.near.anchor) return;
    state.near.circle = L.circle(state.near.anchor, {
        radius: state.near.radius * 1000, className: "near-circle", weight: 2,
    }).addTo(state.map);
}

// ---------------- Data loading ----------------
async function loadCities() {
    try {
        const cities = await (await fetch("/api/cities")).json();
        const sel = $("#city-select");
        sel.innerHTML = "";
        cities.forEach((c) => {
            const o = document.createElement("option");
            o.value = c.name; o.textContent = c.name;
            if (c.name === "Москва") o.selected = true;
            sel.appendChild(o);
        });
    } catch { toast("error", "Не удалось загрузить города"); }
}

async function loadCategories() {
    try {
        const cats = await (await fetch("/api/categories")).json();
        const box = $("#categories-list");
        box.innerHTML = "";
        cats.forEach((cat) => {
            const on = cat.id === "cafe" || cat.id === "bakery";
            const b = document.createElement("button");
            b.className = "chip"; b.dataset.id = cat.id; b.setAttribute("aria-pressed", String(on));
            b.innerHTML = `<i class="fa-solid ${CATEGORY_ICONS[cat.id] || "fa-store"}"></i> ${cat.name}`;
            b.addEventListener("click", () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")));
            box.appendChild(b);
        });
    } catch { toast("error", "Не удалось загрузить категории"); }
}

// ---------------- Listeners ----------------
function setupListeners() {
    $("#search-btn").addEventListener("click", runSearch);
    $("#city-select").addEventListener("change", (e) => {
        const c = CITY_COORDS[e.target.value];
        if (c) state.map.flyTo(c, 11);
    });
    $("#table-search").addEventListener("input", applyFilters);
    document.querySelectorAll(".filter-chip").forEach((b) =>
        b.addEventListener("click", () => {
            document.querySelectorAll(".filter-chip").forEach((x) => x.classList.remove("active"));
            b.classList.add("active");
            state.chip = b.dataset.filter;
            applyFilters();
        }));
    document.querySelectorAll("th.sortable").forEach((th) =>
        th.addEventListener("click", () => {
            const key = th.dataset.sort;
            const dir = state.sort.key === key && state.sort.dir === "desc" ? "asc" : "desc";
            state.sort = { key, dir };
            applyFilters();
        }));
    $("#export-excel-btn").addEventListener("click", () => exportData("xlsx"));
    $("#export-csv-btn").addEventListener("click", () => exportData("csv"));
}

function setupFilters() {
    const reapply = () => applyFilters();
    $("#score-min").addEventListener("input", (e) => { $("#score-val").textContent = e.target.value; reapply(); });
    ["f-independent", "f-phone", "f-website", "f-social", "f-email"].forEach((id) =>
        $("#" + id).addEventListener("change", reapply));
    $("#near-toggle").addEventListener("click", () => {
        state.near.active = !state.near.active;
        $("#near-toggle").classList.toggle("active", state.near.active);
        $("#near-controls").classList.toggle("hidden", !state.near.active);
        if (!state.near.active) clearNear();
        else $("#near-hint").textContent = "Кликните по карте, чтобы поставить точку.";
    });
    $("#radius").addEventListener("input", (e) => {
        state.near.radius = parseFloat(e.target.value);
        $("#radius-val").textContent = state.near.radius.toFixed(1);
        drawNearCircle(); applyFilters();
    });
    $("#filters-toggle").addEventListener("click", () => {
        const t = $("#filters-toggle");
        const open = t.getAttribute("aria-expanded") === "true";
        t.setAttribute("aria-expanded", String(!open));
        $("#filters-body").classList.toggle("hidden", open);
    });
    $("#filters-reset").addEventListener("click", resetFilters);
}

function clearNear() {
    state.near.anchor = null;
    if (state.near.circle) { state.map.removeLayer(state.near.circle); state.near.circle = null; }
    applyFilters();
}

function resetFilters() {
    $("#score-min").value = 0; $("#score-val").textContent = "0";
    ["f-independent", "f-phone", "f-website", "f-social", "f-email"].forEach((id) => ($("#" + id).checked = true));
    $("#table-search").value = "";
    state.chip = "all";
    document.querySelectorAll(".filter-chip").forEach((x) => x.classList.toggle("active", x.dataset.filter === "all"));
    state.near.active = false;
    $("#near-toggle").classList.remove("active");
    $("#near-controls").classList.add("hidden");
    clearNear();
    toast("info", "Фильтры сброшены");
}

// ---------------- Search ----------------
async function runSearch() {
    const city = $("#city-select").value;
    const cats = [...document.querySelectorAll('.chip[aria-pressed="true"]')].map((c) => c.dataset.id);
    if (cats.length === 0) { toast("error", "Выберите хотя бы одну сферу"); return; }

    showLoader("Отправляем запрос в OpenStreetMap…");
    renderSkeleton();
    try {
        setLoaderText("Собираем заведения и считаем ML-скоринг…");
        const res = await fetch("/api/search", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ city, categories: cats }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        state.all = data.leads;
        state.selected = null;
        if (CITY_COORDS[city]) state.map.setView(CITY_COORDS[city], 12);

        applyFilters();
        resetDetail();

        const has = data.leads.length > 0;
        $("#export-excel-btn").disabled = !has;
        $("#export-csv-btn").disabled = !has;
        $("#result-summary").textContent = has
            ? `${data.total} заведений в городе ${city} — отсортированы по баллу`
            : `В городе ${city} ничего не найдено`;
        $("#cached-badge").hidden = !data.cached;

        hideLoader();
        if (has) toast("success", data.cached ? "Загружено из кэша" : `Готово: ${data.total} заведений`);
        else toast("info", "Ничего не найдено — попробуйте другие сферы");
    } catch (err) {
        hideLoader();
        renderTableEmpty("Не удалось собрать данные. Попробуйте ещё раз.");
        toast("error", `Ошибка: ${shortErr(err)}`);
    }
}

// ---------------- Stats (reflect current filters) ----------------
function updateStats() {
    const a = state.filtered;
    const high = a.filter((l) => l.potential_score === "HIGH").length;
    const avg = a.length ? Math.round(a.reduce((s, l) => s + l.score, 0) / a.length) : 0;
    const fav = a.filter((l) => crm(l.id).fav).length;
    animate($("#stat-total"), a.length);
    animate($("#stat-high"), high);
    animate($("#stat-avg"), avg);
    animate($("#stat-fav"), fav);
}

function animate(el, to) {
    const from = parseInt(el.textContent.replace(/\D/g, ""), 10) || 0;
    if (from === to) { el.textContent = to; return; }
    const dur = 650, t0 = performance.now();
    const step = (t) => {
        const p = Math.min((t - t0) / dur, 1);
        el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// ---------------- Overview ----------------
function renderOverview() {
    const card = $("#overview-card");
    if (!state.all.length) { card.classList.add("hidden"); return; }
    card.classList.remove("hidden");

    const a = state.filtered;
    $("#overview-sub").textContent = `${a.length} заведений`;
    if (a.length === 0) {
        $("#overview-body").innerHTML = '<div class="ov-empty">Под текущие фильтры ничего не попало.</div>';
        return;
    }
    const n = a.length;
    const pct = (x) => Math.round((x / n) * 100);
    const indep = pct(a.filter((l) => !l.is_chain).length);
    const contacts = pct(a.filter((l) => l.phone || l.website || l.social).length);
    const avg = Math.round(a.reduce((s, l) => s + l.score, 0) / n);
    const high = a.filter((l) => l.potential_score === "HIGH").length;
    const med = a.filter((l) => l.potential_score === "MEDIUM").length;
    const low = a.filter((l) => l.potential_score === "LOW").length;

    const sig = {
        mini: a.filter((l) => l.is_mini_chain).length,
        hot: a.filter((l) => l.competition >= 4).length,
        socialOnly: a.filter((l) => l.social && !l.website).length,
        delivery: a.filter((l) => l.delivery || l.takeaway).length,
    };
    const sigMax = Math.max(sig.mini, sig.hot, sig.socialOnly, sig.delivery, 1);

    const dmap = {};
    a.forEach((l) => { if (l.district) dmap[l.district] = (dmap[l.district] || 0) + 1; });
    const topD = Object.entries(dmap).sort((x, y) => y[1] - x[1]).slice(0, 5);
    const districts = topD.length
        ? `<div class="ov-section" style="margin-top:18px"><h4>Где их больше</h4>${topD.map(([nm, c]) => bar(nm, c, topD[0][1])).join("")}</div>`
        : "";

    $("#overview-body").innerHTML = `
        <div class="ov-kpis">
            <div class="ov-kpi"><div class="v">${avg}</div><div class="l">Средний балл</div></div>
            <div class="ov-kpi"><div class="v">${indep}%</div><div class="l">Независимые</div></div>
            <div class="ov-kpi"><div class="v">${contacts}%</div><div class="l">С контактами</div></div>
            <div class="ov-kpi"><div class="v">${high}</div><div class="l">Сильных лидов</div></div>
        </div>
        <div class="ov-grid">
            <div class="ov-section"><h4>Распределение по потенциалу</h4>
                ${bar("Сильные", high, n, "high")}${bar("Средние", med, n, "medium")}${bar("Слабые", low, n, "low")}
            </div>
            <div class="ov-section"><h4>Сигналы рынка</h4>
                ${bar("Мини-сети", sig.mini, sigMax)}
                ${bar("Высокая конкуренция", sig.hot, sigMax)}
                ${bar("Только соцсети", sig.socialOnly, sigMax)}
                ${bar("С доставкой", sig.delivery, sigMax)}
                ${districts}
            </div>
        </div>`;
    animateBars();
}

function bar(label, value, max, cls = "") {
    const pct = Math.round((value / (max || 1)) * 100);
    return `<div class="bar-row"><span class="bl">${esc(label)}</span>
        <span class="bar-track"><span class="bar-fill ${cls}" style="width:0" data-w="${pct}"></span></span>
        <span class="bv">${value}</span></div>`;
}

function animateBars() {
    const els = [...document.querySelectorAll("[data-w]")];
    // el.offsetWidth читает computed layout → браузер коммитит width:0 → transition сработает
    els.forEach((el) => void el.offsetWidth);
    requestAnimationFrame(() => {
        els.forEach((el) => {
            el.style.width = el.dataset.w + "%";
            el.removeAttribute("data-w");
        });
    });
}

// ---------------- Filters + sort ----------------
function distanceKm(a, b) {
    const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

function applyFilters() {
    const q = $("#table-search").value.toLowerCase();
    const minScore = parseInt($("#score-min").value, 10);
    const need = {
        independent: $("#f-independent").checked, phone: $("#f-phone").checked,
        website: $("#f-website").checked, social: $("#f-social").checked,
        email: $("#f-email").checked,
    };

    state.filtered = state.all.filter((l) => {
        if (q && !`${l.name} ${l.address} ${l.brand || ""}`.toLowerCase().includes(q)) return false;
        if (l.score < minScore) return false;
        if (need.independent && l.is_chain) return false;
        if (need.phone && !l.phone) return false;
        if (need.website && !l.website) return false;
        if (need.social && !l.social) return false;
        if (need.email && !l.email) return false;
        if (state.chip === "HIGH" && l.potential_score !== "HIGH") return false;
        if (state.chip === "fav" && !crm(l.id).fav) return false;
        if (state.chip === "working" && crm(l.id).status !== "working") return false;
        if (state.near.anchor && distanceKm(state.near.anchor, [l.lat, l.lon]) > state.near.radius) return false;
        return true;
    });

    const { key, dir } = state.sort;
    state.filtered.sort((a, b) => {
        let r = key === "name" ? a.name.localeCompare(b.name) : a[key] - b[key];
        return dir === "desc" ? -r : r;
    });
    document.querySelectorAll("th.sortable").forEach((th) => {
        th.classList.toggle("asc", th.dataset.sort === key && dir === "asc");
        th.classList.toggle("desc", th.dataset.sort === key && dir === "desc");
    });

    renderTable();
    renderMarkers();
    updateStats();
    renderOverview();
    $("#map-counter").textContent = `${state.filtered.length} из ${state.all.length}`;
}

// ---------------- Table ----------------
function renderSkeleton() {
    const tb = $("#leads-table-body");
    tb.innerHTML = "";
    for (let i = 0; i < 7; i++) {
        const tr = document.createElement("tr");
        tr.className = "sk-row";
        tr.innerHTML = `<td><div class="sk w-sm"></div></td><td><div class="sk w-lg"></div></td>
            <td><div class="sk w-md"></div></td><td><div class="sk w-sm"></div></td>
            <td><div class="sk w-sm"></div></td><td><div class="sk w-sm"></div></td><td><div class="sk w-sm"></div></td>`;
        tb.appendChild(tr);
    }
}
function renderTableEmpty(msg) {
    $("#leads-table-body").innerHTML = `<tr><td colspan="7" class="table-empty">${esc(msg)}</td></tr>`;
}

function renderTable() {
    const tb = $("#leads-table-body");
    if (state.filtered.length === 0) { renderTableEmpty("Ничего не найдено по фильтрам."); return; }
    const topIds = new Set(state.all.slice(0, 3).map((l) => l.id));
    tb.innerHTML = "";

    state.filtered.forEach((lead) => {
        const c = crm(lead.id);
        const tr = document.createElement("tr");
        if (state.selected && state.selected.id === lead.id) tr.classList.add("selected");

        const sigs = [];
        if (lead.is_mini_chain) sigs.push('<i class="fa-solid fa-code-branch on-mini" title="Мини-сеть"></i>');
        if (lead.competition >= 4) sigs.push('<i class="fa-solid fa-fire on-hot" title="Высокая конкуренция"></i>');
        if (lead.social) sigs.push('<i class="fa-solid fa-hashtag on-good" title="Соцсети"></i>');
        const sigHtml = sigs.length ? `<div class="tsignals">${sigs.join("")}</div>` : '<span class="text-muted">—</span>';

        const statusHtml = c.status && c.status !== "new"
            ? `<span class="status-pill ${c.status}">${STATUS_LABEL[c.status]}</span>`
            : '<span class="status-pill">Новый</span>';

        tr.innerHTML = `
            <td><div class="score-cell"><span class="score-bar"><i class="${lead.potential_score}" style="width:${lead.score}%"></i></span><span class="score-num">${lead.score}</span></div></td>
            <td><span class="name">${esc(lead.name)}</span>${topIds.has(lead.id) ? '<span class="top-badge">ТОП</span>' : ""}</td>
            <td>${esc(lead.category_label)}</td>
            <td>${sigHtml}</td>
            <td><div class="contacts">
                <i class="fa-solid fa-phone ${lead.phone ? "on" : ""}"></i>
                <i class="fa-solid fa-globe ${lead.website || lead.social ? "on" : ""}"></i></div></td>
            <td>${statusHtml}</td>
            <td><button class="row-star ${c.fav ? "on" : ""}" title="В избранное"><i class="fa-${c.fav ? "solid" : "regular"} fa-star"></i></button></td>`;

        tr.addEventListener("click", (e) => {
            if (e.target.closest(".row-star")) {
                setCrm(lead.id, { fav: !crm(lead.id).fav });
                updateStats(); applyFilters();
                return;
            }
            selectLead(lead);
        });
        tb.appendChild(tr);
    });
}

// ---------------- Markers ----------------
function renderMarkers() {
    state.cluster.clearLayers();
    const markers = state.filtered.map((lead) => {
        let color = lead.is_chain ? "#fbbf24" : SCORE_HEX[lead.potential_score] || "#818cf8";
        const icon = L.divIcon({
            className: "", iconSize: [14, 14], iconAnchor: [7, 7],
            html: `<div class="pin" style="color:${color}"><span style="background:${color}"></span></div>`,
        });
        const m = L.marker([lead.lat, lead.lon], { icon });
        m.bindPopup(`<div class="popup-title">${esc(lead.name)} · ${lead.score}</div>
            <div class="popup-addr">${esc(lead.address)}</div>
            <button class="popup-btn" onclick="window.openLead(${lead.id})">Открыть карточку</button>`);
        return m;
    });
    if (state.cluster.addLayers) state.cluster.addLayers(markers);
    else markers.forEach((m) => state.cluster.addLayer(m));
}
window.openLead = (id) => { const l = state.all.find((x) => x.id === id); if (l) selectLead(l); };

// ---------------- Lead card ----------------
function resetDetail() {
    $("#details-content").classList.add("hidden");
    $("#details-empty").classList.remove("hidden");
}

function selectLead(lead) {
    state.selected = lead;
    renderTable();
    state.map.setView([lead.lat, lead.lon], 15);
    $("#details-empty").classList.add("hidden");
    const panel = $("#details-content");
    panel.classList.remove("hidden");

    panel.innerHTML = `
        <div class="lead-head">
            <h3>${esc(lead.name)}</h3>
            <div class="lead-meta">
                <span class="tag tag-brand">${esc(lead.category_label)}</span>
                ${lead.is_chain ? `<span class="tag tag-warning">Сеть${lead.brand ? ": " + esc(lead.brand) : ""}</span>`
                    : lead.is_mini_chain ? '<span class="tag tag-brand">Мини-сеть</span>' : '<span class="tag tag-success">Независимый</span>'}
            </div>
        </div>
        <div class="seg" id="card-tabs">
            <button class="seg-btn active" data-tab="card"><i class="fa-solid fa-bullseye"></i> Карточка</button>
            <button class="seg-btn" data-tab="work"><i class="fa-solid fa-list-check"></i> Работа</button>
        </div>
        <div id="card-tab"></div>`;

    panel.querySelectorAll("#card-tabs .seg-btn").forEach((b) =>
        b.addEventListener("click", () => {
            panel.querySelectorAll("#card-tabs .seg-btn").forEach((x) => x.classList.toggle("active", x === b));
            if (b.dataset.tab === "work") renderWorkTab(lead);
            else renderCardTab(lead);
        }));
    renderCardTab(lead);
}

function renderCardTab(lead) {
    const gc = COLOR_VAR[lead.potential_color] || "var(--brand)";
    const maxAbs = Math.max(...lead.factors.map((f) => Math.abs(f.points)), 1);
    const factorsHtml = lead.factors.map((f) => `
        <div class="factor ${f.positive ? "pos" : "neg"}">
            <span class="fl">${esc(f.label)}</span>
            <span class="ftrack"><span class="ffill" style="width:0" data-w="${Math.max(6, Math.round(Math.abs(f.points) / maxAbs * 100))}"></span></span>
            <span class="fp">${f.positive ? "+" : ""}${f.points}</span></div>`).join("");
    const lvl = lead.potential_score === "HIGH" ? "Сильный лид" : lead.potential_score === "MEDIUM" ? "Средний лид" : "Слабый лид";

    $("#card-tab").innerHTML = `
        <div class="score-hero">
            <div class="ring" style="--p:${lead.score};--c:${gc}"><span class="ring-num">${lead.score}</span><span class="ring-cap">балл</span></div>
            <div class="hero-side">
                <span class="lvl-pill ${lead.potential_score}">${lvl}</span>
                <p>${esc(lead.potential_reason)}</p>
            </div>
        </div>
        <div class="why">
            <div class="block-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Почему такой балл</div>
            ${factorsHtml || '<p class="text-muted" style="font-size:12px">Нет выраженных факторов.</p>'}
        </div>
        ${renderSignals(lead)}
        <div class="playbook">
            <div class="block-title"><i class="fa-solid fa-lightbulb"></i> Что предложить именно им</div>
            ${buildPlaybook(lead).map((p) => `<div class="play-item"><i class="fa-solid ${p.icon}"></i><div><strong>${esc(p.title)}</strong><span>${esc(p.desc)}</span></div></div>`).join("")}
        </div>
        <div class="contacts-block">
            <div class="block-title"><i class="fa-solid fa-handshake"></i> Как выйти на контакт</div>
            ${renderContacts(lead)}
        </div>`;
    animateBars();
}

function renderWorkTab(lead) {
    const c = crm(lead.id);
    const icons = { new: "fa-circle-dot", contacted: "fa-paper-plane", replied: "fa-reply", working: "fa-briefcase", skip: "fa-xmark" };
    $("#card-tab").innerHTML = `
        <div class="work">
            <div class="block-title"><i class="fa-solid fa-flag"></i> Статус работы с лидом</div>
            <div class="status-list" id="status-list">
                ${STATUSES.map((s) => `<button class="status-opt ${c.status === s.k ? "active" : ""}" data-k="${s.k}"><i class="fa-solid ${icons[s.k]}"></i> ${s.l}</button>`).join("")}
            </div>
            <button class="fav-wide ${c.fav ? "on" : ""}" id="fav-btn"><i class="fa-${c.fav ? "solid" : "regular"} fa-star"></i> ${c.fav ? "В избранном" : "Добавить в избранное"}</button>
            <div class="block-title"><i class="fa-solid fa-pen"></i> Заметки</div>
            <textarea id="crm-notes" class="notes-area" placeholder="Что узнал, когда написать, договорённости…">${esc(c.notes)}</textarea>
        </div>`;

    $("#status-list").querySelectorAll(".status-opt").forEach((b) =>
        b.addEventListener("click", () => {
            setCrm(lead.id, { status: b.dataset.k });
            $("#status-list").querySelectorAll(".status-opt").forEach((x) => x.classList.toggle("active", x === b));
            applyFilters();
        }));
    $("#fav-btn").addEventListener("click", () => {
        const v = !crm(lead.id).fav;
        setCrm(lead.id, { fav: v });
        $("#fav-btn").classList.toggle("on", v);
        $("#fav-btn").innerHTML = `<i class="fa-${v ? "solid" : "regular"} fa-star"></i> ${v ? "В избранном" : "Добавить в избранное"}`;
        applyFilters();
    });
    let nt;
    $("#crm-notes").addEventListener("input", (e) => {
        clearTimeout(nt);
        nt = setTimeout(() => setCrm(lead.id, { notes: e.target.value }), 400);
    });
}

function renderSignals(lead) {
    const s = [];
    if (lead.is_mini_chain) s.push('<span class="sig mini"><i class="fa-solid fa-code-branch"></i> Мини-сеть</span>');
    if (lead.competition >= 1) s.push(`<span class="sig ${lead.competition >= 4 ? "hot" : ""}"><i class="fa-solid fa-fire"></i> ${lead.competition} рядом</span>`);
    if (lead.social && !lead.website) s.push('<span class="sig good"><i class="fa-solid fa-hashtag"></i> Только соцсети</span>');
    if (lead.delivery) s.push('<span class="sig"><i class="fa-solid fa-motorcycle"></i> Доставка</span>');
    if (lead.takeaway) s.push('<span class="sig"><i class="fa-solid fa-bag-shopping"></i> Навынос</span>');
    if (lead.cuisine) s.push(`<span class="sig"><i class="fa-solid fa-utensils"></i> ${esc(cuisineRu(lead.cuisine))}</span>`);
    if (lead.opening_hours) s.push('<span class="sig"><i class="fa-solid fa-clock"></i> Часы указаны</span>');
    return s.length ? `<div class="signals">${s.join("")}</div>` : "";
}

// Персональные предложения: ранжируем варианты по сигналам конкретного лида
// (мини-сеть, конкуренция, соцсети, доставка, кухня…) и берём топ-5.
function buildPlaybook(lead) {
    const c = [];
    const add = (cond, score, icon, title, desc) => { if (cond) c.push({ score, icon, title, desc }); };
    const food = FOOD.has(lead.category_key);

    add(lead.is_mini_chain, 10, "fa-code-branch", "Сравнение точек сети",
        `У них ${lead.location_count} точки — сравним выручку, средний чек и списания между ними и найдём отстающую`);
    add(lead.competition >= 4, 9.5, "fa-chess", "Анализ цен и позиционирования",
        `Рядом ${lead.competition} похожих заведений — посчитаем, где конкуренты сильнее, и чем отстроиться`);
    add(lead.competition >= 1 && lead.competition < 4, 6, "fa-location-crosshairs", "Локальный конкурентный анализ",
        `${lead.competition} конкурента поблизости — сравним ассортимент и средний чек`);
    add(lead.social && !lead.website, 8.5, "fa-hashtag", "Аналитика заявок из соцсетей",
        "Есть соцсети, но нет сайта — посчитаем конверсию из директа и стоимость заявки");
    add(lead.delivery || lead.takeaway, 7.5, "fa-motorcycle", "Экономика доставки и навынос",
        "Сравним маржинальность агрегаторов и собственных заказов, найдём, где теряются деньги");
    add(lead.cuisine && food, 7, "fa-utensils", `Анализ меню (${cuisineRu(lead.cuisine)})`,
        `ABC/XYZ по позициям: что в кухне «${cuisineRu(lead.cuisine)}» приносит прибыль, а что списывается`);
    add(!lead.opening_hours, 4.5, "fa-clock", "Карта загрузки по часам",
        "Часы и пики не заданы — построим почасовую загрузку и подскажем график и акции");
    add(!!lead.email, 4, "fa-envelope", "Email-реактивация",
        "Есть email-база — сегментные рассылки, чтобы вернуть уснувших клиентов");

    if (food) {
        add(!lead.cuisine, 6.5, "fa-table-list", "ABC/XYZ-анализ меню", "какие позиции дают прибыль, а какие просто списываются");
        add(true, 6, "fa-chart-line", "Прогноз спроса и списаний", "сколько готовить и закупать по дням недели и погоде");
        add(true, 5.5, "fa-users", "RFM-сегментация гостей", "кого вернуть рассылкой, а кто уже постоянный");
        add(true, 4.5, "fa-basket-shopping", "Анализ чеков", "что покупают вместе — для комбо и допродаж");
    } else if (lead.category_key === "beauty") {
        add(true, 6.5, "fa-user-clock", "Прогноз оттока клиентов", "кто перестал ходить и когда напомнить о себе");
        add(true, 6, "fa-calendar-check", "Загрузка мастеров", "пиковые часы и пустые окна для точечных акций");
        add(true, 5.5, "fa-users", "RFM-сегментация", "VIP, уходящие и новые клиенты для рассылок");
        add(true, 4.5, "fa-scissors", "Маржинальность услуг", "какие процедуры реально прибыльны");
    } else if (lead.category_key === "florist") {
        add(true, 6.5, "fa-gift", "Остатки к праздникам", "точный объём закупки к 8 марта и 14 февраля");
        add(true, 6, "fa-trash-can", "Анализ списаний", "где и почему теряются цветы");
        add(true, 5.5, "fa-coins", "Маржинальность букетов", "что прибыльно с учётом сборки и упаковки");
    } else {
        add(true, 6, "fa-chart-pie", "Анализ структуры продаж", "ключевые драйверы выручки");
        add(true, 5, "fa-users", "Сегментация клиентов", "кто приносит основную прибыль");
    }

    c.sort((a, b) => b.score - a.score);
    return c.slice(0, 5);
}

function renderContacts(lead) {
    const lines = [];
    if (lead.phone) lines.push(`<div class="contact-line"><i class="fa-solid fa-phone"></i><span>${esc(lead.phone)}</span></div>`);
    if (lead.website) lines.push(`<div class="contact-line"><i class="fa-solid fa-globe"></i><a href="${esc(lead.website)}" target="_blank" rel="noopener">${esc(lead.website)}</a></div>`);
    if (lead.social) lines.push(`<div class="contact-line"><i class="fa-solid fa-hashtag"></i><a href="${esc(lead.social)}" target="_blank" rel="noopener">${esc(lead.social)}</a></div>`);
    if (lead.email) lines.push(`<div class="contact-line"><i class="fa-solid fa-envelope"></i><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a></div>`);
    const near = state.near.anchor && distanceKm(state.near.anchor, [lead.lat, lead.lon]) <= state.near.radius;
    lines.push(`<div class="contact-line muted"><i class="fa-solid fa-person-walking"></i><span>${near ? "Заведение рядом — зайдите лично и спросите управляющего." : "Можно зайти лично и предложить помощь управляющему."}</span></div>`);
    return `<div class="contact-list">${lines.join("")}</div>`;
}

// ---------------- Export ----------------
async function exportData(format) {
    if (state.filtered.length === 0) return;
    const btn = $(`#export-${format === "xlsx" ? "excel" : "csv"}-btn`);
    const orig = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Сборка…`;
    try {
        const leads = state.filtered.map((l) => ({ ...l, status: STATUS_LABEL[crm(l.id).status], notes: crm(l.id).notes }));
        const res = await fetch("/api/export", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leads, format }),
        });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `analytics_leads_${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        toast("success", `Экспортировано ${state.filtered.length} лидов`);
    } catch { toast("error", "Не удалось экспортировать"); }
    finally { btn.innerHTML = orig; }
}

// ---------------- Loader / toasts / utils ----------------
function showLoader(t) { setLoaderText(t); $("#loader-overlay").classList.remove("hidden"); }
function hideLoader() { $("#loader-overlay").classList.add("hidden"); }
function setLoaderText(t) { $("#loader-status").textContent = t; }

function toast(type, msg) {
    const icons = { success: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info" };
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span class="toast-msg">${esc(msg)}</span>`;
    $("#toasts").appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 250); }, 3400);
}

function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function shortErr(err) {
    const m = err && err.message ? err.message : String(err);
    return m.length > 140 ? m.slice(0, 140) + "…" : m;
}
