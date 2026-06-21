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
    ["f-independent", "f-phone", "f-website", "f-social", "f-email", "f-hours"].forEach((id) =>
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
    $("#filters-reset").addEventListener("click", resetFilters);
}

function clearNear() {
    state.near.anchor = null;
    if (state.near.circle) { state.map.removeLayer(state.near.circle); state.near.circle = null; }
    applyFilters();
}

function resetFilters() {
    $("#score-min").value = 0; $("#score-val").textContent = "0";
    ["f-independent", "f-phone", "f-website", "f-social", "f-email", "f-hours"].forEach((id) => ($("#" + id).checked = false));
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
        state.overview = data.overview;
        state.selected = null;
        if (CITY_COORDS[city]) state.map.setView(CITY_COORDS[city], 12);

        renderOverview();
        updateStats();
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

// ---------------- Stats ----------------
function updateStats() {
    const a = state.all;
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
    const ov = state.overview;
    const card = $("#overview-card");
    if (!ov || ov.total === 0) { card.classList.add("hidden"); return; }
    card.classList.remove("hidden");
    $("#overview-sub").textContent = `${ov.total} заведений`;

    const maxCat = Math.max(...ov.by_category.map((c) => c.count), 1);
    const catBars = ov.by_category.map((c) => bar(c.label, c.count, maxCat)).join("");
    const distBars = [
        bar("Сильные", ov.high, ov.total, "high"),
        bar("Средние", ov.medium, ov.total, "medium"),
        bar("Слабые", ov.low, ov.total, "low"),
    ].join("");
    const districts = ov.top_districts && ov.top_districts.length
        ? `<div class="ov-section"><h4>Топ районов</h4>${ov.top_districts.map((d) => bar(d.name, d.count, ov.top_districts[0].count)).join("")}</div>`
        : "";

    $("#overview-body").innerHTML = `
        <div class="ov-kpis">
            <div class="ov-kpi"><div class="v">${ov.independent_share}%</div><div class="l">Независимые</div></div>
            <div class="ov-kpi"><div class="v">${ov.contacts_share}%</div><div class="l">С контактами</div></div>
            <div class="ov-kpi"><div class="v">${ov.avg_score}</div><div class="l">Средний балл</div></div>
            <div class="ov-kpi"><div class="v">${ov.high}</div><div class="l">Сильных лидов</div></div>
        </div>
        <div class="ov-grid">
            <div class="ov-section"><h4>Категории</h4>${catBars}</div>
            <div class="ov-section"><h4>Распределение по потенциалу</h4>${distBars}${districts}</div>
        </div>`;
}

function bar(label, value, max, cls = "") {
    const pct = Math.round((value / (max || 1)) * 100);
    return `<div class="bar-row"><span class="bl">${esc(label)}</span>
        <span class="bar-track"><span class="bar-fill ${cls}" style="width:${pct}%"></span></span>
        <span class="bv">${value}</span></div>`;
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
        email: $("#f-email").checked, hours: $("#f-hours").checked,
    };

    state.filtered = state.all.filter((l) => {
        if (q && !`${l.name} ${l.address} ${l.brand || ""}`.toLowerCase().includes(q)) return false;
        if (l.score < minScore) return false;
        if (need.independent && l.is_chain) return false;
        if (need.phone && !l.phone) return false;
        if (need.website && !l.website) return false;
        if (need.social && !l.social) return false;
        if (need.email && !l.email) return false;
        if (need.hours && !l.opening_hours) return false;
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

    const c = crm(lead.id);
    const gc = COLOR_VAR[lead.potential_color] || "var(--brand)";
    const maxAbs = Math.max(...lead.factors.map((f) => Math.abs(f.points)), 1);
    const factorsHtml = lead.factors.map((f) => `
        <div class="factor ${f.positive ? "pos" : "neg"}">
            <span class="fl">${esc(f.label)}</span>
            <span class="ftrack"><span class="ffill" style="width:${Math.round(Math.abs(f.points) / maxAbs * 100)}%"></span></span>
            <span class="fp">${f.positive ? "+" : ""}${f.points}</span></div>`).join("");

    panel.innerHTML = `
        <div class="lead-head">
            <h3>${esc(lead.name)}</h3>
            <div class="lead-meta">
                <span class="tag tag-brand">${esc(lead.category_label)}</span>
                ${lead.is_chain ? `<span class="tag tag-warning">Сеть${lead.brand ? ": " + esc(lead.brand) : ""}</span>`
                    : lead.is_mini_chain ? '<span class="tag tag-brand">Мини-сеть</span>' : '<span class="tag tag-success">Независимый</span>'}
            </div>
        </div>

        <div class="score-gauge">
            <div class="gauge" style="--p:${lead.score};--gc:${gc}"><span class="gv">${lead.score}</span><span class="gu">из 100</span></div>
            <div class="score-meta">
                <div class="lvl ${lead.potential_score}">${lead.potential_score === "HIGH" ? "Сильный лид" : lead.potential_score === "MEDIUM" ? "Средний лид" : "Слабый лид"}</div>
                <p>${esc(lead.potential_reason)}</p>
            </div>
        </div>

        <div class="why">
            <div class="block-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Почему такой балл (модель)</div>
            ${factorsHtml || '<p class="text-muted" style="font-size:12px">Нет выраженных факторов.</p>'}
        </div>

        ${renderSignals(lead)}

        <div class="playbook">
            <div class="block-title"><i class="fa-solid fa-lightbulb"></i> Что предложить</div>
            ${buildPlaybook(lead).map((p) => `<div class="play-item"><i class="fa-solid ${p.icon}"></i><div><strong>${p.title}</strong><span>${p.desc}</span></div></div>`).join("")}
        </div>

        <div class="contacts-block">
            <div class="block-title"><i class="fa-solid fa-handshake"></i> Как выйти на контакт</div>
            ${renderContacts(lead)}
        </div>

        <div class="crm">
            <div class="block-title"><i class="fa-solid fa-list-check"></i> Статус работы</div>
            <div class="crm-row">
                <div class="status-seg" id="status-seg">
                    ${STATUSES.map((s) => `<button class="status-btn ${c.status === s.k ? "active" : ""}" data-k="${s.k}">${s.l}</button>`).join("")}
                </div>
                <button class="fav-btn ${c.fav ? "on" : ""}" id="fav-btn" title="В избранное"><i class="fa-${c.fav ? "solid" : "regular"} fa-star"></i></button>
            </div>
            <textarea id="crm-notes" placeholder="Заметки: что узнал, когда написать, договорённости…">${esc(c.notes)}</textarea>
        </div>`;

    panel.querySelectorAll("#status-seg .status-btn").forEach((b) =>
        b.addEventListener("click", () => {
            setCrm(lead.id, { status: b.dataset.k });
            panel.querySelectorAll("#status-seg .status-btn").forEach((x) => x.classList.toggle("active", x === b));
            applyFilters();
        }));
    $("#fav-btn").addEventListener("click", () => {
        const v = !crm(lead.id).fav;
        setCrm(lead.id, { fav: v });
        $("#fav-btn").classList.toggle("on", v);
        $("#fav-btn").innerHTML = `<i class="fa-${v ? "solid" : "regular"} fa-star"></i>`;
        updateStats(); applyFilters();
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
    if (lead.cuisine) s.push(`<span class="sig"><i class="fa-solid fa-utensils"></i> ${esc(lead.cuisine)}</span>`);
    if (lead.opening_hours) s.push('<span class="sig"><i class="fa-solid fa-clock"></i> Часы указаны</span>');
    return s.length ? `<div class="signals">${s.join("")}</div>` : "";
}

function buildPlaybook(lead) {
    const ideas = [];
    if (FOOD.has(lead.category_key)) {
        ideas.push({ icon: "fa-table-list", title: "ABC/XYZ-анализ меню", desc: "какие позиции дают прибыль, а какие списываются" });
        ideas.push({ icon: "fa-chart-line", title: "Прогноз спроса", desc: "сколько готовить и закупать по дням, чтобы снизить списания" });
        ideas.push({ icon: "fa-users", title: "RFM-сегментация гостей", desc: "кого вернуть рассылкой, а кто уже VIP" });
    } else if (lead.category_key === "beauty") {
        ideas.push({ icon: "fa-user-clock", title: "Прогноз оттока клиентов", desc: "кто перестал ходить и когда напомнить о себе" });
        ideas.push({ icon: "fa-calendar-check", title: "Загрузка мастеров", desc: "пиковые часы и пустые окна для акций" });
        ideas.push({ icon: "fa-users", title: "RFM-сегментация", desc: "VIP, уходящие и новые клиенты" });
    } else if (lead.category_key === "florist") {
        ideas.push({ icon: "fa-gift", title: "Остатки к праздникам", desc: "точный объём закупки к 8 марта и 14 февраля" });
        ideas.push({ icon: "fa-trash-can", title: "Анализ списаний", desc: "где и почему теряются цветы" });
        ideas.push({ icon: "fa-coins", title: "Маржинальность букетов", desc: "что реально прибыльно с учётом сборки" });
    } else {
        ideas.push({ icon: "fa-chart-pie", title: "Анализ структуры продаж", desc: "ключевые драйверы выручки" });
        ideas.push({ icon: "fa-users", title: "Сегментация клиентов", desc: "кто приносит основную прибыль" });
    }
    if (lead.competition >= 4) ideas.push({ icon: "fa-chess", title: "Конкурентный анализ", desc: `${lead.competition} похожих рядом — чем отстроиться по цене и ассортименту` });
    if (lead.is_mini_chain) ideas.push({ icon: "fa-code-branch", title: "Сравнение точек", desc: "найти отстающую точку в их мини-сети" });
    if (lead.delivery || lead.takeaway) ideas.push({ icon: "fa-motorcycle", title: "Анализ доставки и навынос", desc: "доля, маржа и эффективность агрегаторов" });
    if (lead.social && !lead.website) ideas.push({ icon: "fa-hashtag", title: "Аудит соцсетей и заявок", desc: "вкладываются в маркетинг, но не считают конверсию" });
    return ideas.slice(0, 5);
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
