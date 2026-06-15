// Global state
let leads = [];
let filteredLeads = [];
let selectedLead = null;
let map = null;
let markersGroup = null;
let activeFilter = 'all';

// City coordinates mapping for centering map
const CITY_COORDS = {
    "Москва": [55.7558, 37.6173],
    "Санкт-Петербург": [59.9343, 30.3351],
    "Новосибирск": [55.0084, 82.9357],
    "Екатеринбург": [56.8389, 60.6057],
    "Казань": [55.7887, 49.1221],
    "Нижний Новгород": [56.3269, 44.0059],
    "Краснодар": [45.0355, 38.9753],
    "Сочи": [43.6028, 39.7342],
    "Владивосток": [43.1198, 131.8869]
};

// Document Ready
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    initMap();
    await loadCities();
    await loadCategories();
    setupEventListeners();
}

// Initialize Leaflet Map
function initMap() {
    // Center at Moscow initially
    map = L.map('map').setView(CITY_COORDS["Москва"], 11);
    
    // CartoDB Dark Matter layer for sleek dark theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
    
    markersGroup = L.layerGroup().addTo(map);
}

// Load cities list from API
async function loadCities() {
    try {
        const res = await fetch("/api/cities");
        const cities = await res.json();
        
        const select = document.getElementById("city-select");
        select.innerHTML = "";
        
        cities.forEach(city => {
            const option = document.createElement("option");
            option.value = city.name;
            option.textContent = city.name;
            if (city.name === "Москва") option.selected = true;
            select.appendChild(option);
        });
    } catch (err) {
        console.error("Error loading cities:", err);
    }
}

// Load categories list from API
async function loadCategories() {
    try {
        const res = await fetch("/api/categories");
        const categories = await res.json();
        
        const listContainer = document.getElementById("categories-list");
        listContainer.innerHTML = "";
        
        categories.forEach(cat => {
            const div = document.createElement("div");
            div.className = "checkbox-item";
            
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = cat.id;
            checkbox.id = `cat-${cat.id}`;
            // Pre-select Cafe and Bakery as defaults
            if (cat.id === "cafe" || cat.id === "bakery") checkbox.checked = true;
            
            const label = document.createElement("label");
            label.htmlFor = `cat-${cat.id}`;
            label.textContent = cat.name;
            
            div.appendChild(checkbox);
            div.appendChild(label);
            listContainer.appendChild(div);
        });
    } catch (err) {
        console.error("Error loading categories:", err);
    }
}

// Set up event listeners
function setupEventListeners() {
    const searchBtn = document.getElementById("search-btn");
    const citySelect = document.getElementById("city-select");
    const searchInput = document.getElementById("table-search");
    const filterButtons = document.querySelectorAll(".badge-btn");
    
    const exportExcelBtn = document.getElementById("export-excel-btn");
    const exportCsvBtn = document.getElementById("export-csv-btn");

    // City Selection - fly to coordinates
    citySelect.addEventListener("change", (e) => {
        const city = e.target.value;
        if (CITY_COORDS[city]) {
            map.flyTo(CITY_COORDS[city], 11);
        }
    });

    // Search Trigger
    searchBtn.addEventListener("click", runSearch);

    // Text search in table
    searchInput.addEventListener("input", filterLeads);

    // Filter badge buttons
    filterButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
            filterButtons.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            activeFilter = e.target.dataset.filter;
            filterLeads();
        });
    });

    // Exports
    exportExcelBtn.addEventListener("click", () => exportData("xlsx"));
    exportCsvBtn.addEventListener("click", () => exportData("csv"));
}

// Main search execution
async function runSearch() {
    const city = document.getElementById("city-select").value;
    const checkedBoxes = document.querySelectorAll("#categories-list input:checked");
    
    if (checkedBoxes.length === 0) {
        alert("Пожалуйста, выберите хотя бы одну сферу бизнеса.");
        return;
    }
    
    const categories = Array.from(checkedBoxes).map(cb => cb.value);
    
    // Show Loader
    const overlay = document.getElementById("loader-overlay");
    const statusTxt = document.getElementById("loader-status");
    overlay.classList.remove("hidden");
    statusTxt.textContent = "Формирование запроса и отправка в Overpass API...";
    
    try {
        statusTxt.textContent = "Идет сбор заведений от OpenStreetMap (обычно 5-20 сек)...";
        const res = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ city, categories })
        });
        
        if (!res.ok) throw new Error(await res.text());
        
        statusTxt.textContent = "Обработка и оценка потенциала лидов...";
        const data = await res.json();
        
        leads = data.leads;
        filteredLeads = [...leads];
        
        // Render stats & UI
        updateStats();
        renderLeadsTable();
        renderMapMarkers();
        
        // Center map on the city and zoom to contain data
        if (CITY_COORDS[city]) {
            map.setView(CITY_COORDS[city], 12);
        }
        
        // Enable exports
        document.getElementById("export-excel-btn").disabled = leads.length === 0;
        document.getElementById("export-csv-btn").disabled = leads.length === 0;
        
        // Close Loader
        overlay.classList.add("hidden");
        
    } catch (err) {
        console.error("Search error:", err);
        alert(`Ошибка при сборе данных: ${err.message || err}`);
        overlay.classList.add("hidden");
    }
}

// Update stats cards
function updateStats() {
    const total = leads.length;
    const high = leads.filter(l => l.potential_score === "HIGH").length;
    const medium = leads.filter(l => l.potential_score === "MEDIUM").length;
    const low = leads.filter(l => l.potential_score === "LOW").length;

    document.querySelector("#stat-total h3").textContent = total;
    document.querySelector("#stat-high h3").textContent = high;
    document.querySelector("#stat-medium h3").textContent = medium;
    document.querySelector("#stat-low h3").textContent = low;
    
    document.getElementById("map-counter").textContent = `${total} отметок`;
}

// Filter leads logic
function filterLeads() {
    const searchText = document.getElementById("table-search").value.toLowerCase();
    
    filteredLeads = leads.filter(lead => {
        // Text Match
        const nameMatch = lead.name.toLowerCase().includes(searchText);
        const addressMatch = lead.address.toLowerCase().includes(searchText);
        const brandMatch = lead.brand && lead.brand.toLowerCase().includes(searchText);
        const textMatch = nameMatch || addressMatch || brandMatch;
        
        if (!textMatch) return false;
        
        // Badge Filter Match
        if (activeFilter === 'all') return true;
        if (activeFilter === 'HIGH') return lead.potential_score === 'HIGH';
        if (activeFilter === 'contacts') return lead.website || lead.phone;
        if (activeFilter === 'independent') return !lead.is_chain;
        
        return true;
    });

    renderLeadsTable();
    renderMapMarkers();
}

// Render leads into table
function renderLeadsTable() {
    const tbody = document.getElementById("leads-table-body");
    tbody.innerHTML = "";
    
    if (filteredLeads.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center">Организаций не найдено по выбранным фильтрам.</td></tr>`;
        return;
    }
    
    filteredLeads.forEach(lead => {
        const tr = document.createElement("tr");
        if (selectedLead && selectedLead.id === lead.id) tr.className = "selected";
        
        // Contacts icon indicators
        let contactIcons = "";
        if (lead.phone) contactIcons += `<i class="fa-solid fa-phone active" title="${lead.phone}"></i>`;
        else contactIcons += `<i class="fa-solid fa-phone" title="Нет телефона"></i>`;
        
        if (lead.website) contactIcons += `<i class="fa-solid fa-globe active" title="${lead.website}"></i>`;
        else contactIcons += `<i class="fa-solid fa-globe" title="Нет сайта/соцсети"></i>`;
        
        // Potential score styling
        const scoreBadge = `<span class="tag tag-${lead.potential_color}">${lead.potential_score}</span>`;
        
        tr.innerHTML = `
            <td><strong>${lead.name}</strong></td>
            <td>${lead.category_label}</td>
            <td>${lead.address}</td>
            <td><div class="contact-icons">${contactIcons}</div></td>
            <td>${scoreBadge}</td>
            <td>${lead.brand ? `<span class="tag tag-warning">${lead.brand}</span>` : '<span class="text-muted">—</span>'}</td>
        `;
        
        tr.addEventListener("click", () => {
            selectLead(lead);
            // Highlight row
            document.querySelectorAll("#leads-table-body tr").forEach(r => r.classList.remove("selected"));
            tr.classList.add("selected");
        });
        
        tbody.appendChild(tr);
    });
}

// Render Leaflet Map Markers
function renderMapMarkers() {
    markersGroup.clearLayers();
    
    filteredLeads.forEach(lead => {
        // Determine marker color based on potential
        let color = '#3b82f6'; // blue default
        if (lead.potential_score === 'HIGH') color = '#10b981'; // green
        else if (lead.potential_score === 'MEDIUM') color = '#a78bfa'; // purple
        else if (lead.potential_score === 'LOW') color = '#ef4444'; // red
        if (lead.is_chain) color = '#f59e0b'; // orange for chains

        const markerHtml = `
            <div style="
                background-color: ${color}; 
                width: 14px; 
                height: 14px; 
                border-radius: 50%; 
                border: 2px solid #ffffff; 
                box-shadow: 0 0 8px rgba(0,0,0,0.5);
            "></div>
        `;
        
        const customIcon = L.divIcon({
            html: markerHtml,
            className: 'custom-div-icon',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
        
        const marker = L.marker([lead.lat, lead.lon], { icon: customIcon }).addTo(markersGroup);
        
        const popupContent = `
            <div class="map-popup-title">${lead.name}</div>
            <div class="map-popup-address">${lead.address}</div>
            <button class="map-popup-btn" onclick="selectLeadById(${lead.id})">Открыть питч</button>
        `;
        
        marker.bindPopup(popupContent);
    });
}

// Selection helper (called from Leaflet popup button)
window.selectLeadById = function(id) {
    const lead = leads.find(l => l.id === id);
    if (lead) {
        selectLead(lead);
        // Find and highlight in table
        renderLeadsTable();
        // Pan map center
        map.setView([lead.lat, lead.lon], 15);
    }
};

// Select a lead and render details / pitch
async function selectLead(lead) {
    selectedLead = lead;
    
    // Zoom to coordinate on map
    map.setView([lead.lat, lead.lon], 15);
    
    const emptyPanel = document.getElementById("details-empty");
    const contentPanel = document.getElementById("details-content");
    
    emptyPanel.classList.add("hidden");
    contentPanel.classList.remove("hidden");
    
    // Set default check states based on OSM data
    const hasDigitalFootprint = lead.website ? "checked" : "";
    const hasNoRedFlags = !lead.is_chain ? "checked" : "";
    
    contentPanel.innerHTML = `
        <div class="lead-detail-header">
            <h3>${lead.name}</h3>
            <div class="lead-detail-meta">
                <span class="tag tag-primary">${lead.category_label}</span>
                ${lead.brand ? `<span class="tag tag-warning">Сеть: ${lead.brand}</span>` : '<span class="tag tag-success">Независимый</span>'}
            </div>
        </div>

        <div class="detail-row">
            <i class="fa-solid fa-map-marker-alt"></i>
            <span class="label">Адрес:</span>
            <span>${lead.address}</span>
        </div>
        
        <div class="detail-row">
            <i class="fa-solid fa-phone"></i>
            <span class="label">Телефон:</span>
            <span>${lead.phone ? `<strong>${lead.phone}</strong>` : '<span class="text-muted">Не указан</span>'}</span>
        </div>

        <div class="detail-row">
            <i class="fa-solid fa-globe"></i>
            <span class="label">Сайт:</span>
            <span>${lead.website ? `<a href="${lead.website}" target="_blank">${lead.website}</a>` : '<span class="text-muted">Не указан</span>'}</span>
        </div>
        
        ${lead.opening_hours ? `
        <div class="detail-row">
            <i class="fa-solid fa-clock"></i>
            <span class="label">Режим работы:</span>
            <span>${lead.opening_hours}</span>
        </div>` : ''}

        <div class="potential-box ${lead.potential_color}">
            <i class="fa-solid ${lead.potential_score === 'HIGH' ? 'fa-check-circle' : lead.potential_score === 'MEDIUM' ? 'fa-exclamation-circle' : 'fa-minus-circle'}"></i>
            <div>
                <strong>Первичная оценка: ${lead.potential_score}</strong>
                <div style="font-size: 11px; margin-top: 2px;">${lead.potential_reason}</div>
            </div>
        </div>

        <!-- Golden Middle Interactive Checklist -->
        <div class="golden-middle-audit">
            <div class="audit-header">
                <h4>🔎 Чек-лист «Золотой Середины»</h4>
                <div class="audit-score">Соответствие: <strong id="audit-score-pct">0%</strong></div>
            </div>
            <div class="audit-progress"><div class="audit-progress-fill" id="audit-progress-bar"></div></div>
            <div class="audit-checklist">
                <label class="audit-item">
                    <input type="checkbox" class="audit-cb" id="audit-size">
                    <span>👥 Команда от 5 до 30 человек</span>
                </label>
                <label class="audit-item">
                    <input type="checkbox" class="audit-cb" id="audit-digital" ${hasDigitalFootprint}>
                    <span>💻 Наличие цифрового следа (касса/CRM/сайт)</span>
                </label>
                <label class="audit-item">
                    <input type="checkbox" class="audit-cb" id="audit-volume">
                    <span>📈 Поток >15-20 транзакций в день</span>
                </label>
                <label class="audit-item">
                    <input type="checkbox" class="audit-cb" id="audit-noflags" ${hasNoRedFlags}>
                    <span>🚫 Без красных флагов (не франшиза/крупняк)</span>
                </label>
            </div>
        </div>

        <!-- Pitch Mode Tabs -->
        <div class="pitch-mode-selector">
            <button class="pitch-mode-btn active" data-type="analytics">
                <i class="fa-solid fa-chart-pie"></i> Аналитика (iiko/YClients)
            </button>
            <button class="pitch-mode-btn" data-type="startup">
                <i class="fa-solid fa-rocket"></i> Стартап (FastAPI/ML)
            </button>
            <button class="pitch-mode-btn" data-type="ai">
                <i class="fa-solid fa-robot"></i> ИИ Генератор (OpenRouter)
            </button>
        </div>

        <div class="pitch-container" id="pitch-container-inner">
            <!-- Loaded dynamically in updatePitchText -->
        </div>
    `;

    // Initialize Checklist Audit Score
    updateAuditScore();
    
    // Attach Checklist listeners
    document.querySelectorAll(".audit-cb").forEach(cb => {
        cb.addEventListener("change", updateAuditScore);
    });

    // Attach Pitch Mode Tabs listeners
    let currentPitchType = "analytics";
    document.querySelectorAll(".pitch-mode-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const clickedBtn = e.target.closest(".pitch-mode-btn");
            if (!clickedBtn) return;
            
            document.querySelectorAll(".pitch-mode-btn").forEach(b => b.classList.remove("active"));
            clickedBtn.classList.add("active");
            currentPitchType = clickedBtn.dataset.type;
            
            await updatePitchText(lead, currentPitchType);
        });
    });
    
    // Fetch Pitch from Backend initially
    await updatePitchText(lead, currentPitchType);
}

// Function to fetch and update pitch fields (includes OpenRouter AI support)
async function updatePitchText(lead, type) {
    const pitchContainer = document.getElementById("pitch-container-inner");
    if (!pitchContainer) return;
    
    if (type === "ai") {
        const apiKey = localStorage.getItem("openrouter_api_key");
        
        if (!apiKey) {
            // Setup Screen HTML
            pitchContainer.innerHTML = `
                <div class="ai-setup-container" style="padding: 10px 0;">
                    <h4 style="font-size: 13px; font-weight:600; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-robot" style="color: var(--primary)"></i> Настройка ИИ-генератора
                    </h4>
                    <p style="font-size: 11px; color: var(--text-secondary); margin: 10px 0 14px; line-height: 1.6;">
                        Для генерации уникальных писем с помощью нейросетей укажите ваш API-ключ от сервиса <strong>OpenRouter</strong>. 
                        Это бесплатно, не требует VPN и банковских карт.
                    </p>
                    <div style="font-size: 11px; margin-bottom: 14px;">
                        <a href="https://openrouter.ai/keys" target="_blank" style="color: var(--primary); text-decoration: none; font-weight:600;">
                            <i class="fa-solid fa-external-link"></i> Получить бесплатный API-ключ на OpenRouter.ai
                        </a>
                    </div>
                    <div class="pitch-subject-field" style="margin-bottom: 16px; border-radius: 8px;">
                        <span class="text-muted" style="font-size: 11px; font-weight: 600;">API-ключ:</span>
                        <input type="password" id="openrouter-key-input" placeholder="sk-or-v1-..." style="width: 80%; border:none; background:none; color:white; font-size:12px;">
                    </div>
                    <button id="save-key-btn" class="btn btn-primary btn-block btn-sm">
                        <i class="fa-solid fa-save"></i> Сохранить ключ
                    </button>
                </div>
            `;
            
            // Attach save key listener
            document.getElementById("save-key-btn").addEventListener("click", () => {
                const val = document.getElementById("openrouter-key-input").value.trim();
                if (val) {
                    localStorage.setItem("openrouter_api_key", val);
                    updatePitchText(lead, "ai"); // Reload view
                } else {
                    alert("Пожалуйста, введите API-ключ.");
                }
            });
            
        } else {
            // AI controls Screen HTML
            pitchContainer.innerHTML = `
                <div class="ai-generator-controls">
                    <div class="pitch-header" style="border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center;">
                        <h4 style="font-size: 12px; font-weight:600; display:flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-robot" style="color: var(--primary)"></i> ИИ Генератор (OpenRouter)
                        </h4>
                        <button id="reset-key-link" style="background: none; border: none; color: var(--danger); font-size: 11px; cursor: pointer; display:flex; align-items:center; gap:4px;">
                            <i class="fa-solid fa-trash-can"></i> Сбросить API-ключ
                        </button>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 16px; align-items: flex-end;">
                        <div style="flex-grow: 1;">
                            <label style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 6px;">Выберите модель ИИ:</label>
                            <select id="ai-model-select" style="padding: 8px 12px; font-size: 12px; background-color: var(--bg-workspace); border: 1px solid var(--border-color); border-radius: 8px; color: white; width:100%;">
                                <option value="google/gemma-4-31b-it:free">Gemma 4 31B (Бесплатно, новейшая от Google - Рекомендуется)</option>
                                <option value="openai/gpt-oss-120b:free">GPT OSS 120B (Бесплатно, мощная и быстрая)</option>
                                <option value="openai/gpt-oss-20b:free">GPT OSS 20B (Бесплатно, легкая и очень быстрая)</option>
                                <option value="liquid/lfm-2.5-1.2b-instruct:free">LFM 2.5 1.2B (Бесплатно, компактная)</option>
                            </select>
                        </div>
                        <button id="generate-ai-btn" class="btn btn-primary" style="padding: 8px 16px; font-size: 12px; height: 34px; border-radius:8px;">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Сгенерировать
                        </button>
                    </div>

                    <div class="pitch-header">
                        <h4><i class="fa-solid fa-envelope"></i> Сгенерированное письмо</h4>
                        <button class="copy-btn" id="copy-all-btn" title="Копировать всё предложение" disabled><i class="fa-solid fa-copy"></i> Копировать</button>
                    </div>
                    
                    <div class="pitch-subject-field">
                        <span class="text-muted" style="font-size: 11px; font-weight: 600;">Тема:</span>
                        <input type="text" id="pitch-subject" readonly placeholder="Здесь появится тема письма..." style="font-size:12px; color: white;">
                        <button class="copy-btn" id="copy-subject-btn" title="Копировать тему" disabled><i class="fa-solid fa-copy"></i></button>
                    </div>
                    
                    <div class="pitch-body-field">
                        <textarea id="pitch-body" readonly style="height: 200px; font-size:12px; color:white; line-height:1.5;" placeholder="Нажмите «Сгенерировать», чтобы написать письмо с помощью ИИ..."></textarea>
                        <button class="copy-btn" id="copy-body-btn" style="position: absolute; right: 12px; bottom: 12px;" title="Копировать тело письма" disabled><i class="fa-solid fa-copy"></i> Копировать текст</button>
                    </div>
                </div>
            `;
            
            // Attach reset key listener
            document.getElementById("reset-key-link").addEventListener("click", () => {
                if(confirm("Вы действительно хотите удалить сохраненный API-ключ?")) {
                    localStorage.removeItem("openrouter_api_key");
                    updatePitchText(lead, "ai");
                }
            });
            
            // Attach generate key listener
            document.getElementById("generate-ai-btn").addEventListener("click", async () => {
                const model = document.getElementById("ai-model-select").value;
                const genBtn = document.getElementById("generate-ai-btn");
                const pitchSubject = document.getElementById("pitch-subject");
                const pitchBody = document.getElementById("pitch-body");
                
                genBtn.disabled = true;
                genBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Пишет...`;
                
                pitchSubject.value = "ИИ формулирует тему...";
                pitchBody.value = "ИИ думает и пишет сопроводительное письмо (обычно 5-15 секунд)... Пожалуйста, подождите.";
                
                try {
                    const res = await fetch("/api/pitch/ai", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            business_name: lead.name,
                            category_label: lead.category_label,
                            website: lead.website,
                            phone: lead.phone,
                            api_key: apiKey,
                            model: model
                        })
                    });
                    
                    if (!res.ok) {
                        const errText = await res.text();
                        throw new Error(errText);
                    }
                    
                    const pitch = await res.json();
                    
                    pitchSubject.value = pitch.subject;
                    pitchBody.value = pitch.body;
                    
                    // Enable copy buttons
                    const copyBtns = document.querySelectorAll(".pitch-container .copy-btn");
                    copyBtns.forEach(btn => btn.removeAttribute("disabled"));
                    
                    // Setup copy listeners
                    setupCopyListeners(pitch.subject, pitch.body);
                    
                } catch (err) {
                    console.error("AI Generation error:", err);
                    pitchSubject.value = "Ошибка генерации";
                    pitchBody.value = `Не удалось сгенерировать письмо нейросетью.\n\nВозможная причина: неверный API-ключ или лимиты на сервере.\nДетали ошибки: ${err.message || err}`;
                } finally {
                    genBtn.disabled = false;
                    genBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Сгенерировать`;
                }
            });
        }
        
    } else {
        // Standard template view HTML
        pitchContainer.innerHTML = `
            <div class="pitch-header">
                <h4><i class="fa-solid fa-magic"></i> Готовый питч (на русском)</h4>
                <button class="copy-btn" id="copy-all-btn" title="Копировать всё предложение"><i class="fa-solid fa-copy"></i> Копировать</button>
            </div>
            
            <div class="pitch-subject-field">
                <span class="text-muted" style="font-size: 11px; font-weight: 600;">Тема:</span>
                <input type="text" id="pitch-subject" readonly value="Загрузка темы...">
                <button class="copy-btn" id="copy-subject-btn" title="Копировать тему"><i class="fa-solid fa-copy"></i></button>
            </div>
            
            <div class="pitch-body-field">
                <textarea id="pitch-body" readonly>Генерация коммерческого предложения...</textarea>
                <button class="copy-btn" id="copy-body-btn" style="position: absolute; right: 12px; bottom: 12px;" title="Копировать тело письма"><i class="fa-solid fa-copy"></i> Копировать текст</button>
            </div>
        `;
        
        const pitchSubject = document.getElementById("pitch-subject");
        const pitchBody = document.getElementById("pitch-body");
        
        try {
            const res = await fetch("/api/pitch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    business_name: lead.name,
                    category_key: lead.category_key,
                    website: lead.website,
                    phone: lead.phone,
                    pitch_type: type
                })
            });
            
            const pitch = await res.json();
            
            pitchSubject.value = pitch.subject;
            pitchBody.value = pitch.body;
            
            // Setup copy buttons listeners
            setupCopyListeners(pitch.subject, pitch.body);
            
        } catch (err) {
            console.error("Error generating pitch:", err);
            pitchSubject.value = "Ошибка генерации";
            pitchBody.value = "Не удалось сгенерировать предложение.";
        }
    }
}

// Dynamic Audit Score calculation
function updateAuditScore() {
    const checkboxes = document.querySelectorAll(".audit-cb");
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const pct = Math.round((checkedCount / checkboxes.length) * 100);
    
    const scoreText = document.getElementById("audit-score-pct");
    const progressFill = document.getElementById("audit-progress-bar");
    
    scoreText.textContent = `${pct}%`;
    progressFill.style.width = `${pct}%`;
    
    // Clear color classes
    progressFill.className = "audit-progress-fill";
    scoreText.className = "";
    
    if (pct <= 25) {
        progressFill.classList.add("bg-danger");
        scoreText.classList.add("text-danger");
    } else if (pct === 50) {
        progressFill.classList.add("bg-warning");
        scoreText.classList.add("text-warning");
    } else if (pct === 75) {
        progressFill.classList.add("bg-primary");
        scoreText.classList.add("text-primary");
    } else if (pct === 100) {
        progressFill.classList.add("bg-success");
        scoreText.classList.add("text-success");
    }
}

// Copy button handlers with micro-animations
function setupCopyListeners(subject, body) {
    const copySubject = document.getElementById("copy-subject-btn");
    const copyBody = document.getElementById("copy-body-btn");
    const copyAll = document.getElementById("copy-all-btn");

    copySubject.addEventListener("click", () => {
        navigator.clipboard.writeText(subject);
        showCopiedFeedback(copySubject, '<i class="fa-solid fa-check" style="color: var(--success)"></i>');
    });

    copyBody.addEventListener("click", () => {
        navigator.clipboard.writeText(body);
        showCopiedFeedback(copyBody, '<i class="fa-solid fa-check" style="color: var(--success)"></i> Скопировано!');
    });

    copyAll.addEventListener("click", () => {
        const combined = `Тема: ${subject}\n\n${body}`;
        navigator.clipboard.writeText(combined);
        showCopiedFeedback(copyAll, '<i class="fa-solid fa-check" style="color: var(--success)"></i> Скопировано всё!');
    });
}

function showCopiedFeedback(btn, successHtml) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = successHtml;
    btn.disabled = true;
    
    setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }, 2000);
}

// Export data as CSV/XLSX
async function exportData(format) {
    if (filteredLeads.length === 0) return;
    
    const btn = document.getElementById(`export-${format}-btn`);
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Сборка...`;
    
    try {
        const res = await fetch("/api/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                leads: filteredLeads,
                format: format
            })
        });
        
        if (!res.ok) throw new Error("Export failed");
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `analytics_leads_${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
    } catch (err) {
        console.error("Export error:", err);
        alert("Не удалось экспортировать данные.");
    } finally {
        btn.innerHTML = originalText;
    }
}
