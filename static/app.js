// ============================================================
// LeadAnalytics — frontend logic
// ============================================================

const state = {
    leads: [],
    filtered: [],
    selected: null,
    filter: "all",
    map: null,
    markers: null,
};

const CITY_COORDS = {
    "Москва": [55.7558, 37.6173],
    "Санкт-Петербург": [59.9343, 30.3351],
    "Новосибирск": [55.0084, 82.9357],
    "Екатеринбург": [56.8389, 60.6057],
    "Казань": [55.7887, 49.1221],
    "Нижний Новгород": [56.3269, 44.0059],
    "Краснодар": [45.0355, 38.9753],
    "Сочи": [43.6028, 39.7342],
    "Владивосток": [43.1198, 131.8869],
};

const CATEGORY_ICONS = {
    cafe: "fa-mug-hot",
    bakery: "fa-bread-slice",
    confectionery: "fa-cake-candles",
    restaurant: "fa-utensils",
    fast_food: "fa-burger",
    beauty: "fa-scissors",
    florist: "fa-seedling",
};

const COLOR_TO_TAG = { success: "success", warning: "warning", danger: "danger", primary: "brand" };
const SCORE_HEX = { HIGH: "#34d399", MEDIUM: "#a78bfa", LOW: "#f87171" };

const $ = (sel) => document.querySelector(sel);

document.addEventListener("DOMContentLoaded", init);

async function init() {
    initMap();
    setupListeners();
    await Promise.all([loadCities(), loadCategories()]);
}

// ---------------- Map ----------------
function initMap() {
    state.map = L.map("map", { zoomControl: true, attributionControl: false }).setView(CITY_COORDS["Москва"], 11);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
    }).addTo(state.map);
    state.markers = L.layerGroup().addTo(state.map);
}

// ---------------- Data loading ----------------
async function loadCities() {
    try {
        const cities = await (await fetch("/api/cities")).json();
        const select = $("#city-select");
        select.innerHTML = "";
        cities.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = c.name;
            opt.textContent = c.name;
            if (c.name === "Москва") opt.selected = true;
            select.appendChild(opt);
        });
    } catch {
        toast("error", "Не удалось загрузить список городов");
    }
}

async function loadCategories() {
    try {
        const cats = await (await fetch("/api/categories")).json();
        const box = $("#categories-list");
        box.innerHTML = "";
        cats.forEach((cat) => {
            const pressed = cat.id === "cafe" || cat.id === "bakery";
            const btn = document.createElement("button");
            btn.className = "chip";
            btn.dataset.id = cat.id;
            btn.setAttribute("aria-pressed", String(pressed));
            const icon = CATEGORY_ICONS[cat.id] || "fa-store";
            btn.innerHTML = `<i class="fa-solid ${icon}"></i> ${cat.name}`;
            btn.addEventListener("click", () => {
                const now = btn.getAttribute("aria-pressed") === "true";
                btn.setAttribute("aria-pressed", String(!now));
            });
            box.appendChild(btn);
        });
    } catch {
        toast("error", "Не удалось загрузить категории");
    }
}

// ---------------- Listeners ----------------
function setupListeners() {
    $("#search-btn").addEventListener("click", runSearch);
    $("#city-select").addEventListener("change", (e) => {
        const c = CITY_COORDS[e.target.value];
        if (c) state.map.flyTo(c, 11);
    });
    $("#table-search").addEventListener("input", applyFilters);
    document.querySelectorAll(".filter-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            state.filter = btn.dataset.filter;
            applyFilters();
        });
    });
    $("#export-excel-btn").addEventListener("click", () => exportData("xlsx"));
    $("#export-csv-btn").addEventListener("click", () => exportData("csv"));
}

// ---------------- Search ----------------
async function runSearch() {
    const city = $("#city-select").value;
    const selected = [...document.querySelectorAll('.chip[aria-pressed="true"]')].map((c) => c.dataset.id);
    if (selected.length === 0) {
        toast("error", "Выберите хотя бы одну сферу бизнеса");
        return;
    }

    showLoader("Отправляем запрос в OpenStreetMap…");
    renderSkeleton();

    try {
        setLoaderText("Собираем заведения (обычно 5–20 секунд)…");
        const res = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ city, categories: selected }),
        });
        if (!res.ok) throw new Error(await res.text());

        setLoaderText("Оцениваем потенциал лидов…");
        const data = await res.json();

        state.leads = data.leads;
        state.filtered = [...data.leads];
        state.selected = null;

        updateStats();
        renderTable();
        renderMarkers();
        resetDetail();

        if (CITY_COORDS[city]) state.map.setView(CITY_COORDS[city], 12);

        const hasLeads = data.leads.length > 0;
        $("#export-excel-btn").disabled = !hasLeads;
        $("#export-csv-btn").disabled = !hasLeads;

        $("#result-summary").textContent = hasLeads
            ? `Найдено ${data.total} заведений в городе ${city}`
            : `В городе ${city} ничего не найдено по выбранным сферам`;
        $("#cached-badge").hidden = !data.cached;

        hideLoader();
        if (hasLeads) {
            toast("success", data.cached ? "Загружено из кэша" : `Готово: ${data.total} заведений`);
        } else {
            toast("info", "Ничего не найдено — попробуйте другие сферы или город");
        }
    } catch (err) {
        hideLoader();
        renderTableEmpty("Не удалось собрать данные. Попробуйте ещё раз.");
        toast("error", `Ошибка: ${shortErr(err)}`);
    }
}

// ---------------- Stats ----------------
function updateStats() {
    const by = (s) => state.leads.filter((l) => l.potential_score === s).length;
    animateCounter($("#stat-total"), state.leads.length);
    animateCounter($("#stat-high"), by("HIGH"));
    animateCounter($("#stat-medium"), by("MEDIUM"));
    animateCounter($("#stat-low"), by("LOW"));
    $("#map-counter").textContent = `${state.leads.length} отметок`;
}

function animateCounter(el, to) {
    const from = parseInt(el.textContent.replace(/\D/g, ""), 10) || 0;
    if (from === to) { el.textContent = to; return; }
    const dur = 700, start = performance.now();
    const step = (now) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(from + (to - from) * eased);
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// ---------------- Filters ----------------
function applyFilters() {
    const q = $("#table-search").value.toLowerCase();
    state.filtered = state.leads.filter((l) => {
        const text = `${l.name} ${l.address} ${l.brand || ""}`.toLowerCase();
        if (q && !text.includes(q)) return false;
        if (state.filter === "HIGH") return l.potential_score === "HIGH";
        if (state.filter === "contacts") return l.website || l.phone;
        if (state.filter === "independent") return !l.is_chain;
        return true;
    });
    renderTable();
    renderMarkers();
}

// ---------------- Table ----------------
function renderSkeleton() {
    const tb = $("#leads-table-body");
    tb.innerHTML = "";
    for (let i = 0; i < 6; i++) {
        const tr = document.createElement("tr");
        tr.className = "sk-row";
        tr.innerHTML = `
            <td><div class="sk w-lg"></div></td>
            <td><div class="sk w-md"></div></td>
            <td><div class="sk w-lg"></div></td>
            <td><div class="sk w-sm"></div></td>
            <td><div class="sk w-sm"></div></td>
            <td><div class="sk w-sm"></div></td>`;
        tb.appendChild(tr);
    }
}

function renderTableEmpty(msg) {
    $("#leads-table-body").innerHTML = `<tr><td colspan="6" class="table-empty">${msg}</td></tr>`;
}

function renderTable() {
    const tb = $("#leads-table-body");
    if (state.filtered.length === 0) {
        renderTableEmpty("Организаций не найдено по выбранным фильтрам.");
        return;
    }
    tb.innerHTML = "";
    state.filtered.forEach((lead) => {
        const tr = document.createElement("tr");
        if (state.selected && state.selected.id === lead.id) tr.classList.add("selected");

        const phoneOn = lead.phone ? "on" : "";
        const webOn = lead.website ? "on" : "";
        const tag = COLOR_TO_TAG[lead.potential_color] || "muted";

        tr.innerHTML = `
            <td><span class="name">${esc(lead.name)}</span></td>
            <td>${esc(lead.category_label)}</td>
            <td>${esc(lead.address)}</td>
            <td><div class="contacts">
                <i class="fa-solid fa-phone ${phoneOn}" title="${lead.phone ? esc(lead.phone) : "Нет телефона"}"></i>
                <i class="fa-solid fa-globe ${webOn}" title="${lead.website ? esc(lead.website) : "Нет сайта"}"></i>
            </div></td>
            <td><span class="tag tag-${tag}">${lead.potential_score}</span></td>
            <td>${lead.brand ? `<span class="tag tag-warning">${esc(lead.brand)}</span>` : '<span class="text-muted">—</span>'}</td>`;

        tr.addEventListener("click", () => selectLead(lead));
        tb.appendChild(tr);
    });
}

// ---------------- Map markers ----------------
function renderMarkers() {
    state.markers.clearLayers();
    state.filtered.forEach((lead) => {
        let color = SCORE_HEX[lead.potential_score] || "#818cf8";
        if (lead.is_chain) color = "#fbbf24";
        const pulse = lead.potential_score === "HIGH" && !lead.is_chain ? "pulse" : "";

        const icon = L.divIcon({
            className: "",
            html: `<div class="pin ${pulse}" style="color:${color}"><span style="background:${color}"></span></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
        });
        const marker = L.marker([lead.lat, lead.lon], { icon }).addTo(state.markers);
        marker.bindPopup(`
            <div class="popup-title">${esc(lead.name)}</div>
            <div class="popup-addr">${esc(lead.address)}</div>
            <button class="popup-btn" onclick="window.selectLeadById(${lead.id})">Открыть карточку</button>`);
    });
}

window.selectLeadById = (id) => {
    const lead = state.leads.find((l) => l.id === id);
    if (lead) selectLead(lead);
};

// ---------------- Lead detail + pitch ----------------
function resetDetail() {
    $("#details-content").classList.add("hidden");
    $("#details-empty").classList.remove("hidden");
}

async function selectLead(lead) {
    state.selected = lead;
    document.querySelectorAll("#leads-table-body tr").forEach((r) => r.classList.remove("selected"));
    renderTable();
    state.map.setView([lead.lat, lead.lon], 15);

    $("#details-empty").classList.add("hidden");
    const panel = $("#details-content");
    panel.classList.remove("hidden");

    const bannerClass = COLOR_TO_TAG[lead.potential_color] || "brand";
    const bannerIcon = lead.potential_score === "HIGH" ? "fa-circle-check"
        : lead.potential_score === "MEDIUM" ? "fa-circle-half-stroke" : "fa-circle-minus";

    panel.innerHTML = `
        <div class="lead-head">
            <h3>${esc(lead.name)}</h3>
            <div class="lead-meta">
                <span class="tag tag-brand">${esc(lead.category_label)}</span>
                ${lead.brand ? `<span class="tag tag-warning">Сеть: ${esc(lead.brand)}</span>` : '<span class="tag tag-success">Независимый</span>'}
            </div>
        </div>
        <div class="lead-rows">
            <div class="lead-row"><i class="fa-solid fa-location-dot"></i><span class="k">Адрес</span><span class="v">${esc(lead.address)}</span></div>
            <div class="lead-row"><i class="fa-solid fa-phone"></i><span class="k">Телефон</span><span class="v">${lead.phone ? esc(lead.phone) : '<span class="text-muted">не указан</span>'}</span></div>
            <div class="lead-row"><i class="fa-solid fa-globe"></i><span class="k">Сайт</span><span class="v">${lead.website ? `<a href="${esc(lead.website)}" target="_blank" rel="noopener">${esc(lead.website)}</a>` : '<span class="text-muted">не указан</span>'}</span></div>
            ${lead.opening_hours ? `<div class="lead-row"><i class="fa-solid fa-clock"></i><span class="k">Часы</span><span class="v">${esc(lead.opening_hours)}</span></div>` : ""}
        </div>
        <div class="banner ${bannerClass}">
            <i class="fa-solid ${bannerIcon}"></i>
            <div><strong>Оценка: ${lead.potential_score}</strong><div style="margin-top:3px;color:var(--text-2)">${esc(lead.potential_reason)}</div></div>
        </div>

        <div class="audit">
            <div class="audit-top">
                <h4><i class="fa-solid fa-clipboard-check"></i> Чек-лист «золотой середины»</h4>
                <span class="audit-score" id="audit-score">0%</span>
            </div>
            <div class="audit-bar"><div class="audit-fill" id="audit-fill"></div></div>
            <div class="audit-list">
                <label class="audit-item"><input type="checkbox" class="acb"><i class="fa-solid fa-users"></i> Команда 5–30 человек</label>
                <label class="audit-item"><input type="checkbox" class="acb" ${lead.website ? "checked" : ""}><i class="fa-solid fa-desktop"></i> Есть цифровой след (касса/CRM/сайт)</label>
                <label class="audit-item"><input type="checkbox" class="acb"><i class="fa-solid fa-chart-line"></i> Поток более 15–20 чеков в день</label>
                <label class="audit-item"><input type="checkbox" class="acb" ${!lead.is_chain ? "checked" : ""}><i class="fa-solid fa-ban"></i> Без красных флагов (не сеть)</label>
            </div>
        </div>

        <div class="seg">
            <button class="seg-btn active" data-type="analytics"><i class="fa-solid fa-chart-pie"></i> Аналитика</button>
            <button class="seg-btn" data-type="startup"><i class="fa-solid fa-rocket"></i> Стартап</button>
            <button class="seg-btn" data-type="ai"><i class="fa-solid fa-wand-magic-sparkles"></i> ИИ</button>
        </div>
        <div id="pitch-area"></div>`;

    panel.querySelectorAll(".acb").forEach((cb) => cb.addEventListener("change", updateAudit));
    updateAudit();

    let type = "analytics";
    panel.querySelectorAll(".seg-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            panel.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            type = btn.dataset.type;
            renderPitch(lead, type);
        });
    });
    renderPitch(lead, "analytics");
}

function updateAudit() {
    const boxes = [...document.querySelectorAll(".acb")];
    const pct = Math.round((boxes.filter((b) => b.checked).length / boxes.length) * 100);
    const fill = $("#audit-fill"), score = $("#audit-score");
    if (fill) fill.style.width = `${pct}%`;
    if (score) score.textContent = `${pct}%`;
}

// ---------------- Pitch rendering ----------------
async function renderPitch(lead, type) {
    const area = $("#pitch-area");
    if (!area) return;

    if (type === "ai") { renderAI(lead, area); return; }

    area.innerHTML = `
        <div class="pitch-area">
            <div class="pitch-bar">
                <h4><i class="fa-solid fa-envelope"></i> Готовое письмо</h4>
                <button class="copy-btn" id="copy-all"><i class="fa-solid fa-copy"></i> Копировать</button>
            </div>
            <div class="field"><div class="field-row"><span class="k">Тема</span><input id="p-subject" readonly value="Загрузка…">
                <button class="copy-btn" id="copy-subject"><i class="fa-solid fa-copy"></i></button></div></div>
            <div class="field"><textarea id="p-body" readonly>Генерация предложения…</textarea>
                <button class="copy-btn copy-float" id="copy-body"><i class="fa-solid fa-copy"></i> Текст</button></div>
        </div>`;

    try {
        const res = await fetch("/api/pitch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ business_name: lead.name, category_key: lead.category_key, website: lead.website, phone: lead.phone, pitch_type: type }),
        });
        const pitch = await res.json();
        $("#p-subject").value = pitch.subject;
        $("#p-body").value = pitch.body;
        wireCopy(pitch.subject, pitch.body);
    } catch {
        $("#p-subject").value = "Ошибка генерации";
        $("#p-body").value = "Не удалось сгенерировать предложение.";
        toast("error", "Не удалось сгенерировать письмо");
    }
}

function renderAI(lead, area) {
    const key = localStorage.getItem("openrouter_api_key");
    if (!key) {
        area.innerHTML = `
            <div class="ai-setup">
                <h4><i class="fa-solid fa-robot"></i> Настройка ИИ-генератора</h4>
                <p>Для генерации уникальных писем нейросетью укажите API-ключ от <strong>OpenRouter</strong>. Это бесплатно, без VPN и карт.</p>
                <p><a class="link" href="https://openrouter.ai/keys" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Получить бесплатный ключ</a></p>
                <div class="field"><div class="field-row"><span class="k">Ключ</span><input type="password" id="ai-key" placeholder="sk-or-v1-…"></div></div>
                <button class="btn btn-primary btn-block btn-sm" id="ai-save"><i class="fa-solid fa-floppy-disk"></i> Сохранить ключ</button>
            </div>`;
        $("#ai-save").addEventListener("click", () => {
            const v = $("#ai-key").value.trim();
            if (!v) { toast("error", "Введите API-ключ"); return; }
            localStorage.setItem("openrouter_api_key", v);
            toast("success", "Ключ сохранён");
            renderAI(lead, area);
        });
        return;
    }

    area.innerHTML = `
        <div class="pitch-area">
            <div class="pitch-bar">
                <h4><i class="fa-solid fa-robot"></i> ИИ-генератор</h4>
                <button class="ai-reset" id="ai-reset"><i class="fa-solid fa-trash-can"></i> Сбросить ключ</button>
            </div>
            <div class="ai-row">
                <div class="field"><div class="field-row"><span class="k">Модель</span>
                    <select id="ai-model" style="border:none;background:none;padding:0">
                        <option value="openai/gpt-oss-20b:free">GPT-OSS 20B (быстрая, бесплатно)</option>
                        <option value="openai/gpt-oss-120b:free">GPT-OSS 120B (мощная, бесплатно)</option>
                        <option value="google/gemma-2-9b-it:free">Gemma 2 9B (бесплатно)</option>
                        <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (бесплатно)</option>
                    </select></div></div>
                <button class="btn btn-primary btn-sm" id="ai-gen"><i class="fa-solid fa-wand-magic-sparkles"></i> Сгенерировать</button>
            </div>
            <div class="pitch-bar">
                <h4><i class="fa-solid fa-envelope"></i> Письмо</h4>
                <button class="copy-btn" id="copy-all" disabled><i class="fa-solid fa-copy"></i> Копировать</button>
            </div>
            <div class="field"><div class="field-row"><span class="k">Тема</span><input id="p-subject" readonly placeholder="Появится тема…">
                <button class="copy-btn" id="copy-subject" disabled><i class="fa-solid fa-copy"></i></button></div></div>
            <div class="field"><textarea id="p-body" readonly placeholder="Нажмите «Сгенерировать»…"></textarea>
                <button class="copy-btn copy-float" id="copy-body" disabled><i class="fa-solid fa-copy"></i> Текст</button></div>
        </div>`;

    $("#ai-reset").addEventListener("click", () => {
        if (confirm("Удалить сохранённый API-ключ?")) {
            localStorage.removeItem("openrouter_api_key");
            renderAI(lead, area);
        }
    });

    $("#ai-gen").addEventListener("click", async () => {
        const model = $("#ai-model").value;
        const btn = $("#ai-gen");
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Пишет…`;
        $("#p-subject").value = "ИИ формулирует…";
        $("#p-body").value = "Нейросеть пишет письмо (5–15 секунд)…";
        try {
            const res = await fetch("/api/pitch/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ business_name: lead.name, category_label: lead.category_label, website: lead.website, phone: lead.phone, api_key: key, model }),
            });
            if (!res.ok) throw new Error(await res.text());
            const pitch = await res.json();
            $("#p-subject").value = pitch.subject;
            $("#p-body").value = pitch.body;
            area.querySelectorAll(".copy-btn").forEach((b) => (b.disabled = false));
            wireCopy(pitch.subject, pitch.body);
            toast("success", "Письмо сгенерировано");
        } catch (err) {
            $("#p-subject").value = "Ошибка генерации";
            $("#p-body").value = `Не удалось сгенерировать письмо.\nВозможно, неверный ключ или лимит модели.\n\n${shortErr(err)}`;
            toast("error", "Ошибка генерации ИИ");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Сгенерировать`;
        }
    });
}

function wireCopy(subject, body) {
    const bind = (id, text, label) => {
        const el = $(`#${id}`);
        if (!el) return;
        el.onclick = () => {
            navigator.clipboard.writeText(text);
            const orig = el.innerHTML;
            el.innerHTML = `<i class="fa-solid fa-check" style="color:var(--success)"></i>${label ? " " + label : ""}`;
            setTimeout(() => (el.innerHTML = orig), 1600);
            toast("success", "Скопировано в буфер обмена");
        };
    };
    bind("copy-subject", subject, "");
    bind("copy-body", body, "Текст");
    bind("copy-all", `Тема: ${subject}\n\n${body}`, "Копировать");
}

// ---------------- Export ----------------
async function exportData(format) {
    if (state.filtered.length === 0) return;
    const btn = $(`#export-${format === "xlsx" ? "excel" : "csv"}-btn`);
    const orig = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Сборка…`;
    try {
        const res = await fetch("/api/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leads: state.filtered, format }),
        });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analytics_leads_${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast("success", `Экспортировано ${state.filtered.length} лидов`);
    } catch {
        toast("error", "Не удалось экспортировать данные");
    } finally {
        btn.innerHTML = orig;
    }
}

// ---------------- Loader ----------------
function showLoader(text) { setLoaderText(text); $("#loader-overlay").classList.remove("hidden"); }
function hideLoader() { $("#loader-overlay").classList.add("hidden"); }
function setLoaderText(text) { $("#loader-status").textContent = text; }

// ---------------- Toasts ----------------
function toast(type, msg) {
    const icons = { success: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info" };
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span class="toast-msg">${esc(msg)}</span>`;
    $("#toasts").appendChild(el);
    setTimeout(() => {
        el.classList.add("out");
        setTimeout(() => el.remove(), 250);
    }, 3600);
}

// ---------------- Utils ----------------
function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function shortErr(err) {
    const m = err && err.message ? err.message : String(err);
    return m.length > 160 ? m.slice(0, 160) + "…" : m;
}
