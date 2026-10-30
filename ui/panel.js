(function (namespace) {
    'use strict';

    const core = namespace.core;
    if (!core) throw new Error('Larp Autopot core must load before ui/panel.js');

    const { config, state } = core;

    const buildHotkeyOptions = (selected) => {
        const slots = core.getHotbarSlots();
        const count = slots.length > 0 ? Math.min(slots.length, 9) : 9;
        return Array.from({ length: count }, (_, index) => {
            const key = String(index + 1);
            return `<option value="${key}" ${key === selected ? 'selected' : ''}>${key}</option>`;
        }).join('');
    };

    const buildPotionTypeOptions = (selected, type) => config.shops.potionTypes[type].map(potion =>
        `<option value="${potion}" ${potion === selected ? 'selected' : ''}>${potion}</option>`
    ).join('');

    const buildMapOptions = (selected) => config.maps.map(map =>
        `<option value="${map}" ${map === selected ? 'selected' : ''}>${map.replace(/_/g, ' ')}</option>`
    ).join('');

    const build = () => {
        if (document.getElementById('larp-autopot-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'larp-autopot-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            right: 12px;
            transform: translateY(-50%);
            z-index: 2147483647;
            background: rgba(20, 20, 28, 0.95);
            color: #eee;
            font: 12px/1.4 system-ui, sans-serif;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #444;
            box-shadow: 0 4px 14px rgba(0,0,0,0.6);
            width: 240px;
            max-height: 90vh;
            overflow-y: auto;
            user-select: none;
        `;

        const sectionStyle = (color) => `
            border: 1px solid ${color};
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 10px;
            background: rgba(255,255,255,0.02);
        `;
        const rowStyle = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;';
        const inputStyle = 'width:55px;padding:2px 4px;background:#2a2a33;color:#eee;border:1px solid #555;border-radius:4px;';
        const selectStyle = 'padding:2px;background:#2a2a33;color:#eee;border:1px solid #555;border-radius:4px;';

        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
                <span style="font-weight:700;font-size:14px;color:#ffd700;">Larp Autopot v1.0</span>
                <button id="larp-minimize" type="button" aria-label="Minimize panel" aria-expanded="true"
                    style="padding:0 6px;background:#2a2a33;color:#eee;border:1px solid #555;border-radius:4px;cursor:pointer;">−</button>
            </div>
            <div id="larp-panel-content">
                <div role="tablist" aria-label="Macro sections"
                    style="display:flex;gap:4px;margin-bottom:10px;border-bottom:1px solid #444;padding-bottom:6px;">
                    <button type="button" role="tab" data-tab="autopot" aria-selected="true"
                        style="flex:1;padding:5px 2px;background:#3a3a46;color:#ffd700;border:1px solid #555;border-radius:4px;cursor:pointer;">Autopot</button>
                    <button type="button" role="tab" data-tab="autorefiller" aria-selected="false"
                        style="flex:1;padding:5px 2px;background:#22222a;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;">Refill</button>
                    <button type="button" role="tab" data-tab="autohunt" aria-selected="false"
                        style="flex:1;padding:5px 2px;background:#22222a;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;">Hunt</button>
                    <button type="button" role="tab" data-tab="settings" aria-selected="false"
                        style="flex:1;padding:5px 2px;background:#22222a;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;">Settings</button>
                </div>

                <div role="tabpanel" data-tab-panel="autopot">
                    <div style="${sectionStyle('#ff6b6b')}">
                        <div style="${rowStyle};margin-bottom:8px;">
                            <input type="checkbox" id="autopot-enabled" ${state.autopot.enabled ? 'checked' : ''}>
                            <span style="color:#ff6b6b;font-weight:700;">Autopot</span>
                        </div>
                        <div style="${rowStyle}">
                            <span style="color:#ff6b6b;">HP</span><span>Below:</span>
                            <input type="number" id="autopot-hp-thr" value="${state.autopot.hpThreshold}" style="${inputStyle}">
                        </div>
                        <div style="${rowStyle}">
                            <span style="color:#6bb5ff;">SP</span><span>Below:</span>
                            <input type="number" id="autopot-sp-thr" value="${state.autopot.spThreshold}" style="${inputStyle}">
                        </div>
                    </div>
                </div>

                <div role="tabpanel" data-tab-panel="autorefiller" style="display:none;">
                    <div style="${sectionStyle('#9b59b6')}">
                        <div style="${rowStyle};margin-bottom:8px;">
                            <input type="checkbox" id="refiller-enabled" ${state.autorefiller.enabled ? 'checked' : ''}>
                            <span style="color:#9b59b6;font-weight:700;">Autorefiller</span>
                        </div>
                        <div style="${rowStyle}">
                            <span>Min to refill:</span>
                            <input type="number" id="refiller-min" value="${state.autorefiller.minToRefill}" style="${inputStyle}">
                            <span>Max to buy:</span>
                            <input type="number" id="refiller-max" value="${state.autorefiller.maxToBuy}" style="${inputStyle}">
                        </div>
                        <div id="refiller-qty" style="font-size:10px;color:#889;margin-top:4px;">
                            Qty: HP ${core.getPotionQty(state.settings.hpHotbar) ?? '?'} / SP ${core.getPotionQty(state.settings.spHotbar) ?? '?'}
                        </div>
                    </div>
                </div>

                <div role="tabpanel" data-tab-panel="autohunt" style="display:none;">
                    <div style="${sectionStyle('#58b368')}">
                        <div style="font-weight:700;margin-bottom:8px;color:#58b368;">Autohunt</div>
                        <div style="${rowStyle}">
                            <label for="autohunt-map">Map:</label>
                            <select id="autohunt-map" style="${selectStyle};max-width:160px;">
                                ${buildMapOptions(state.autohunt.map)}
                            </select>
                        </div>
                        <div style="font-size:10px;color:#889;margin-top:4px;">
                            Returns to this map after refilling.
                        </div>
                    </div>
                </div>

                <div role="tabpanel" data-tab-panel="settings" style="display:none;">
                    <div style="${sectionStyle('#666')}">
                        <div style="font-weight:700;margin-bottom:8px;color:#aaa;">Settings</div>
                        <div style="${rowStyle}">
                            <span>Check rate:</span>
                            <input type="number" id="settings-rate" value="${state.settings.checkMs}"
                                min="200" max="1000" step="50" style="${inputStyle}">
                            <span>ms</span>
                        </div>
                        <div style="${rowStyle}">
                            <span style="color:#ff6b6b;">HP hotbar:</span>
                            <select id="settings-hp-hotbar" style="${selectStyle}">
                                ${buildHotkeyOptions(state.settings.hpHotbar)}
                            </select>
                        </div>
                        <div style="${rowStyle}">
                            <span style="color:#6bb5ff;">SP hotbar:</span>
                            <select id="settings-sp-hotbar" style="${selectStyle}">
                                ${buildHotkeyOptions(state.settings.spHotbar)}
                            </select>
                        </div>
                        <div style="${rowStyle}">
                            <span style="color:#ff6b6b;">HP potion:</span>
                            <select id="settings-hp-type" style="${selectStyle}">
                                ${buildPotionTypeOptions(state.settings.hpPotionType, 'hp')}
                            </select>
                        </div>
                        <div style="${rowStyle}">
                            <span style="color:#6bb5ff;">SP potion:</span>
                            <select id="settings-sp-type" style="${selectStyle}">
                                ${buildPotionTypeOptions(state.settings.spPotionType, 'sp')}
                            </select>
                        </div>
                    </div>
                </div>
                <div id="larp-status" style="font-size:11px;color:#9aa;border-top:1px solid #333;padding-top:8px;text-align:center;">
                    HP: – / SP: –
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        wireTabs(panel);
        wireMinimize(panel);
        wireAutopot(panel);
        wireAutorefiller(panel);
        wireSettings(panel);
        wireAutohunt(panel);
        startStatusUpdates();
        observeHotbarChanges();
    };

    const wireTabs = (panel) => {
        panel.querySelectorAll('[data-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                const selectedTab = tab.dataset.tab;
                panel.querySelectorAll('[data-tab]').forEach(button => {
                    const selected = button.dataset.tab === selectedTab;
                    button.setAttribute('aria-selected', String(selected));
                    button.style.background = selected ? '#3a3a46' : '#22222a';
                    button.style.color = selected ? '#ffd700' : '#aaa';
                });
                panel.querySelectorAll('[data-tab-panel]').forEach(tabPanel => {
                    tabPanel.style.display = tabPanel.dataset.tabPanel === selectedTab ? '' : 'none';
                });
            });
        });
    };

    const wireMinimize = (panel) => {
        panel.querySelector('#larp-minimize').addEventListener('click', event => {
            const content = panel.querySelector('#larp-panel-content');
            const minimized = content.style.display !== 'none';
            content.style.display = minimized ? 'none' : '';
            panel.style.width = minimized ? 'auto' : '240px';
            event.currentTarget.textContent = minimized ? '+' : '−';
            event.currentTarget.setAttribute('aria-label', minimized ? 'Expand panel' : 'Minimize panel');
            event.currentTarget.setAttribute('aria-expanded', String(!minimized));
        });
    };

    const wireAutopot = (panel) => {
        panel.querySelector('#autopot-enabled').addEventListener('change', event => {
            state.autopot.enabled = event.target.checked;
            core.saveSettings();
        });
        panel.querySelector('#autopot-hp-thr').addEventListener('input', event => {
            const value = parseInt(event.target.value, 10);
            if (!Number.isNaN(value) && value >= 0) {
                state.autopot.hpThreshold = value;
                core.saveSettings();
            }
        });
        panel.querySelector('#autopot-sp-thr').addEventListener('input', event => {
            const value = parseInt(event.target.value, 10);
            if (!Number.isNaN(value) && value >= 0) {
                state.autopot.spThreshold = value;
                core.saveSettings();
            }
        });
    };

    const wireAutorefiller = (panel) => {
        panel.querySelector('#refiller-enabled').addEventListener('change', event => {
            state.autorefiller.enabled = event.target.checked;
            if (event.target.checked) {
                state.autorefiller.phase = 'idle';
                state.autorefiller.lastAction = 0;
            }
            core.saveSettings();
        });
        panel.querySelector('#refiller-min').addEventListener('input', event => {
            const value = parseInt(event.target.value, 10);
            if (!Number.isNaN(value) && value >= 0) {
                state.autorefiller.minToRefill = value;
                core.saveSettings();
            }
        });
        panel.querySelector('#refiller-max').addEventListener('input', event => {
            const value = parseInt(event.target.value, 10);
            if (!Number.isNaN(value) && value >= 0) {
                state.autorefiller.maxToBuy = value;
                core.saveSettings();
            }
        });
    };

    const wireSettings = (panel) => {
        panel.querySelector('#settings-rate').addEventListener('change', event => {
            let value = parseInt(event.target.value, 10);
            if (Number.isNaN(value)) value = 500;
            value = Math.max(200, Math.min(1000, value));
            state.settings.checkMs = value;
            event.target.value = value;
            core.restartInterval();
            core.saveSettings();
        });
        panel.querySelector('#settings-hp-hotbar').addEventListener('change', event => {
            state.settings.hpHotbar = event.target.value;
            core.saveSettings();
        });
        panel.querySelector('#settings-sp-hotbar').addEventListener('change', event => {
            state.settings.spHotbar = event.target.value;
            core.saveSettings();
        });
        panel.querySelector('#settings-hp-type').addEventListener('change', event => {
            state.settings.hpPotionType = event.target.value;
            core.saveSettings();
        });
        panel.querySelector('#settings-sp-type').addEventListener('change', event => {
            state.settings.spPotionType = event.target.value;
            core.saveSettings();
        });
    };

    const wireAutohunt = (panel) => {
        panel.querySelector('#autohunt-map').addEventListener('change', event => {
            state.autohunt.map = event.target.value;
            core.saveSettings();
        });
    };

    const startStatusUpdates = () => {
        setInterval(() => {
            const hp = core.parseValue(document.getElementById(config.selectors.hp));
            const sp = core.parseValue(document.getElementById(config.selectors.sp));
            const status = document.getElementById('larp-status');
            const quantities = document.getElementById('refiller-qty');
            if (status) status.textContent = `HP: ${hp ?? '–'} / SP: ${sp ?? '–'}`;
            if (quantities) {
                const hpQty = core.getPotionQty(state.settings.hpHotbar);
                const spQty = core.getPotionQty(state.settings.spHotbar);
                quantities.textContent = `Qty: HP ${hpQty ?? '?'} / SP ${spQty ?? '?'}`;
            }
        }, 500);
    };

    const observeHotbarChanges = () => {
        const hotbar = document.getElementById(config.selectors.hotbar);
        if (!hotbar) return;

        const observer = new MutationObserver(() => {
            ['settings-hp-hotbar', 'settings-sp-hotbar'].forEach(id => {
                const select = document.getElementById(id);
                if (!select) return;
                const current = select.value;
                select.innerHTML = buildHotkeyOptions(current);
            });
        });
        observer.observe(hotbar, { childList: true });
    };

    namespace.ui = { build };
})(globalThis.LarpAutopot = globalThis.LarpAutopot || {});
