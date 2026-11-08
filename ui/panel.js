(function (namespace) {
    'use strict';

    const core = namespace.core;
    if (!core) throw new Error('Larp Automate V2 core must load before ui/panel.js');

    const { config, state } = core;

    const buildPotionTypeOptions = (selected, type) => config.shops.potionTypes[type].map(potion =>
        `<option value="${potion}" ${potion === selected ? 'selected' : ''}>${config.shops.potionNames[potion]}</option>`
    ).join('');

    const buildMapOptions = (selected) => config.maps.map(map =>
        `<option value="${map}" ${map === selected ? 'selected' : ''}>${config.mapNames[map]}</option>`
    ).join('');

    const build = () => {
        if (document.getElementById('larp-automate-v2-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'larp-automate-v2-panel';
        panel.className = 'lam-panel';

        const sectionStyle = (color) => `
            border: 1px solid ${color};
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 10px;
            background: rgba(255,255,255,0.02);
        `;
        const rowStyle = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;';
        const inputStyle = 'width:88px;min-width:0;padding:2px 4px;background:#2a2a33;color:#eee;border:1px solid #555;border-radius:4px;';
        const selectStyle = 'padding:2px;background:#2a2a33;color:#eee;border:1px solid #555;border-radius:4px;';
        panel.innerHTML = `
            <div class="lam-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
                <span class="lam-brand" style="font-weight:700;font-size:14px;color:#ffd700;">Larp Automate V2</span>
                <button id="larp-minimize" type="button" aria-label="Minimizar painel" aria-expanded="true"
                    style="padding:0 6px;background:#2a2a33;color:#eee;border:1px solid #555;border-radius:4px;cursor:pointer;">−</button>
            </div>
            <div id="larp-panel-content">
                <div role="tablist" aria-label="Seções da macro"
                    style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;border-bottom:1px solid #444;padding-bottom:6px;">
                    <button type="button" role="tab" data-tab="character" aria-selected="true"
                        style="flex:1;padding:5px 2px;background:#3a3a46;color:#ffd700;border:1px solid #555;border-radius:4px;cursor:pointer;">Geral</button>
                    <button type="button" role="tab" data-tab="autopot" aria-selected="false"
                        style="flex:1;padding:5px 2px;background:#22222a;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;">Healer</button>
                    <button type="button" role="tab" data-tab="autorefiller" aria-selected="false"
                        style="flex:1;padding:5px 2px;background:#22222a;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;">Refiller</button>
                    <button type="button" role="tab" data-tab="autohunt" aria-selected="false"
                        style="flex:1;padding:5px 2px;background:#22222a;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;">Hunt</button>
                    <button type="button" role="tab" data-tab="fastskill" aria-selected="false"
                        style="flex:1;padding:5px 2px;background:#22222a;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;">Fast Skill</button>
                    <button type="button" role="tab" data-tab="logs" aria-selected="false"
                        style="flex:1;padding:5px 2px;background:#22222a;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;">Logs</button>
                    <button type="button" role="tab" data-tab="settings" aria-selected="false"
                        style="flex:1;padding:5px 2px;background:#22222a;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;">Config</button>
                </div>

                <div role="tabpanel" data-tab-panel="character">
                    <div class="lam-section lam-character" style="${sectionStyle('#c8a24e')}">
                        <div style="font-weight:700;margin-bottom:8px;color:#e6c77a;">Geral</div>
                        <div id="character-summary" class="lam-character-summary">Aguardando sincronização do jogo</div>
                        <div class="lam-hero-status">
                            <div>HP: <strong id="character-hp">–</strong></div>
                            <div>SP: <strong id="character-sp">–</strong></div>
                            <div>EXP base: <strong id="character-base-exp">–</strong></div>
                            <div>Mapa: <strong id="character-map">–</strong></div>
                        </div>
                        <div class="lam-hero-metrics">
                            <div>XP por hora: <strong id="metrics-xp-hour">Aguardando dados</strong></div>
                            <div style="${rowStyle};margin-top:8px;">
                                <span>Tempo:</span><strong id="metrics-elapsed">00:00:00</strong>
                                <button id="metrics-reset" type="button" style="padding:3px 7px;">Resetar</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div role="tabpanel" data-tab-panel="autopot">
                    <div class="lam-section lam-hp" style="${sectionStyle('#ff6b6b')}">
                        <div style="${rowStyle};margin-bottom:8px;">
                            <input type="checkbox" id="autopot-enabled" ${state.autopot.enabled ? 'checked' : ''}>
                            <span style="color:#ff6b6b;font-weight:700;">Poções automáticas</span>
                        </div>
                        <div style="${rowStyle}">
                            <span style="color:#ff6b6b;">HP</span><span>Abaixo de:</span>
                            <input type="number" id="autopot-hp-thr" value="${state.autopot.hpThreshold}" style="${inputStyle}">
                            <select id="settings-hp-type" aria-label="Poção de HP" style="${selectStyle}">
                                ${buildPotionTypeOptions(state.settings.hpPotionType, 'hp')}
                            </select>
                        </div>
                        <div style="${rowStyle}">
                            <span style="color:#6bb5ff;">SP</span><span>Abaixo de:</span>
                            <input type="number" id="autopot-sp-thr" value="${state.autopot.spThreshold}" style="${inputStyle}">
                            <select id="settings-sp-type" aria-label="Poção de SP" style="${selectStyle}">
                                ${buildPotionTypeOptions(state.settings.spPotionType, 'sp')}
                            </select>
                        </div>
                    </div>
                </div>

                <div role="tabpanel" data-tab-panel="autorefiller" hidden>
                    <div class="lam-section lam-hp" style="${sectionStyle('#ff6b6b')}">
                        <div style="${rowStyle};margin-bottom:8px;">
                            <input type="checkbox" id="refiller-hp-enabled" ${state.autorefiller.hpEnabled ? 'checked' : ''}>
                            <label for="refiller-hp-enabled" style="color:#ff6b6b;font-weight:700;">Poção de HP</label>
                        </div>
                        <div style="${rowStyle}">
                            <span>Mínimo:</span>
                            <input type="number" id="refiller-hp-min" value="${state.autorefiller.hpMinToRefill}" style="${inputStyle}">
                        </div>
                        <div style="${rowStyle}">
                            <span>Máximo:</span>
                            <input type="number" id="refiller-hp-max" value="${state.autorefiller.hpMaxToBuy}" style="${inputStyle}">
                        </div>
                        <div id="refiller-hp-info" style="font-size:10px;color:#aaa;margin-top:4px;"></div>
                    </div>
                    <div class="lam-section lam-sp" style="${sectionStyle('#6bb5ff')}">
                        <div style="${rowStyle};margin-bottom:8px;">
                            <input type="checkbox" id="refiller-sp-enabled" ${state.autorefiller.spEnabled ? 'checked' : ''}>
                            <label for="refiller-sp-enabled" style="color:#6bb5ff;font-weight:700;">Poção de SP</label>
                        </div>
                        <div style="${rowStyle}">
                            <span>Mínimo:</span>
                            <input type="number" id="refiller-sp-min" value="${state.autorefiller.spMinToRefill}" style="${inputStyle}">
                        </div>
                        <div style="${rowStyle}">
                            <span>Máximo:</span>
                            <input type="number" id="refiller-sp-max" value="${state.autorefiller.spMaxToBuy}" style="${inputStyle}">
                        </div>
                        <div id="refiller-sp-info" style="font-size:10px;color:#aaa;margin-top:4px;"></div>
                    </div>
                </div>

                <div role="tabpanel" data-tab-panel="autohunt" hidden>
                    <div class="lam-section lam-world" style="${sectionStyle('#58b368')}">
                        <div style="font-weight:700;margin-bottom:8px;color:#58b368;">Caça automática</div>
                        <div class="lam-hunt-controls">
                            <select id="autohunt-map" aria-label="Mapa de caça" style="${selectStyle};">
                                ${buildMapOptions(state.autohunt.map)}
                            </select>
                            <input type="checkbox" id="autohunt-return-enabled"
                                ${state.autohunt.returnToMapEnabled ? 'checked' : ''}>
                        </div>
                        <div class="lam-hunt-hint">
                            <span class="lam-info-icon" title="Retorna ao mapa automaticamente" aria-label="Retorna ao mapa automaticamente">i</span>
                            Retorna ao mapa automaticamente
                        </div>
                    </div>
                </div>

                <div role="tabpanel" data-tab-panel="logs" hidden>
                    <div class="lam-section lam-logs" style="${sectionStyle('#8b9bb4')}">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                            <span style="font-weight:700;color:#c5d0df;">WebSocket</span>
                            <button id="websocket-logs-clear" type="button" style="padding:3px 7px;">Limpar</button>
                        </div>
                        <div style="${rowStyle};margin-bottom:8px;">
                            <input type="checkbox" id="websocket-logs-enabled"
                                ${state.settings.logsEnabled ? 'checked' : ''}>
                            <label for="websocket-logs-enabled">Extrair logs WebSocket</label>
                        </div>
                        <div id="websocket-logs" class="lam-log-list">Aguardando mensagens</div>
                    </div>
                </div>

                <div role="tabpanel" data-tab-panel="fastskill" hidden>
                    <div class="lam-section lam-action" style="${sectionStyle('#e6a23c')}">
                        <div style="font-weight:700;margin-bottom:8px;color:#e6a23c;">Fast Skill</div>
                        <div style="${rowStyle}">
                            <span>Intervalo:</span>
                            <input type="number" id="fastskill-interval" value="${state.fastSkill.intervalMs}"
                                min="100" max="10000" step="50" style="${inputStyle}">
                            <span>ms</span>
                        </div>
                        <div style="font-size:10px;color:#aaa;margin-bottom:6px;">
                            Skills aprendidas e marcadas como automáticas na hotbar:
                        </div>
                        <div id="fastskill-options" class="lam-fastskill-options">
                            Aguardando sincronização do jogo
                        </div>
                    </div>
                </div>

                <div role="tabpanel" data-tab-panel="settings" hidden>
                    <div class="lam-section lam-settings" style="${sectionStyle('#666')}">
                        <div style="font-weight:700;margin-bottom:8px;color:#aaa;">Config</div>
                        <div style="${rowStyle}">
                            <span>Rate:</span>
                            <input type="number" id="settings-rate" value="${state.settings.checkMs}"
                                min="200" max="1000" step="50" style="${inputStyle}">
                            <span>ms</span>
                        </div>
                        <div style="${rowStyle};margin-top:8px;">
                            <input type="checkbox" id="settings-lite-mode"
                                ${state.settings.liteMode ? 'checked' : ''}>
                            <label for="settings-lite-mode">Lite mode</label>
                        </div>
                    </div>
                </div>
                <div id="larp-connection-status" class="lam-connection" role="status">
                    <span class="lam-connection-dot"></span>Aguardando conexão com o jogo
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
        wireFastSkill(panel);
        wireLogs(panel);
        wireMetrics(panel);
        refreshPotionDetails();
        refreshGameData(panel);
        startStatusUpdates();
    };

    const wireTabs = (panel) => {
        panel.querySelectorAll('[data-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                const selectedTab = tab.dataset.tab;
                panel.querySelectorAll('[data-tab]').forEach(button => {
                    const selected = button.dataset.tab === selectedTab;
                    button.setAttribute('aria-selected', String(selected));
                });
                panel.querySelectorAll('[data-tab-panel]').forEach(tabPanel => {
                    tabPanel.hidden = tabPanel.dataset.tabPanel !== selectedTab;
                });
            });
        });
    };

    const wireMinimize = (panel) => {
        panel.querySelector('#larp-minimize').addEventListener('click', event => {
            const content = panel.querySelector('#larp-panel-content');
            const minimized = !content.hidden;
            content.hidden = minimized;
            panel.classList.toggle('lam-minimized', minimized);
            event.currentTarget.textContent = minimized ? '+' : '−';
            event.currentTarget.setAttribute('aria-label', minimized ? 'Expandir painel' : 'Minimizar painel');
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
        panel.querySelector('#settings-hp-type').addEventListener('change', event => {
            state.settings.hpPotionType = event.target.value;
            refreshPotionDetails();
            core.saveSettings();
        });
        panel.querySelector('#settings-sp-type').addEventListener('change', event => {
            state.settings.spPotionType = event.target.value;
            refreshPotionDetails();
            core.saveSettings();
        });
    };

    const wireAutorefiller = (panel) => {
        const wirePotionRefill = (id, setting) => {
            panel.querySelector(id).addEventListener('change', event => {
                state.autorefiller[setting] = event.target.checked;
                if (event.target.checked && state.autorefiller.phase === 'idle') {
                    state.autorefiller.lastAction = 0;
                }
                core.saveSettings();
            });
        };
        wirePotionRefill('#refiller-hp-enabled', 'hpEnabled');
        wirePotionRefill('#refiller-sp-enabled', 'spEnabled');
        panel.querySelector('#refiller-hp-min').addEventListener('input', event => {
            const value = parseInt(event.target.value, 10);
            if (!Number.isNaN(value) && value >= 0) {
                state.autorefiller.hpMinToRefill = value;
                core.saveSettings();
            }
        });
        panel.querySelector('#refiller-sp-min').addEventListener('input', event => {
            const value = parseInt(event.target.value, 10);
            if (!Number.isNaN(value) && value >= 0) {
                state.autorefiller.spMinToRefill = value;
                core.saveSettings();
            }
        });
        panel.querySelector('#refiller-hp-max').addEventListener('input', event => {
            const value = parseInt(event.target.value, 10);
            if (!Number.isNaN(value) && value >= 0) {
                state.autorefiller.hpMaxToBuy = value;
                core.saveSettings();
            }
        });
        panel.querySelector('#refiller-sp-max').addEventListener('input', event => {
            const value = parseInt(event.target.value, 10);
            if (!Number.isNaN(value) && value >= 0) {
                state.autorefiller.spMaxToBuy = value;
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
        panel.querySelector('#settings-lite-mode').addEventListener('change', event => {
            core.setLiteMode(event.target.checked);
        });
    };

    const wireAutohunt = (panel) => {
        panel.querySelector('#autohunt-map').addEventListener('change', event => {
            state.autohunt.map = event.target.value;
            core.saveSettings();
        });
        panel.querySelector('#autohunt-return-enabled').addEventListener('change', event => {
            state.autohunt.returnToMapEnabled = event.target.checked;
            core.saveSettings();
        });
    };

    const wireFastSkill = (panel) => {
        panel.querySelector('#fastskill-interval').addEventListener('change', event => {
            let interval = parseInt(event.target.value, 10);
            if (Number.isNaN(interval)) interval = 500;
            interval = Math.max(100, Math.min(10000, interval));
            state.fastSkill.intervalMs = interval;
            event.target.value = interval;
            core.updateFastSkillInterval();
            core.saveSettings();
        });

        panel.querySelector('#fastskill-options').addEventListener('change', event => {
            const checkbox = event.target.closest('[data-fastskill-id]');
            if (!checkbox) return;
            state.fastSkill.skills[checkbox.dataset.fastskillId] = checkbox.checked;
            core.updateFastSkillInterval();
            core.saveSettings();
        });
    };

    const wireLogs = (panel) => {
        panel.querySelector('#websocket-logs-enabled').addEventListener('change', event => {
            core.setWebSocketLogging(event.target.checked);
            refreshGameData(panel);
        });
        panel.querySelector('#websocket-logs-clear').addEventListener('click', () => {
            state.logs.length = 0;
            refreshGameData(panel);
        });
    };

    const wireMetrics = (panel) => {
        panel.querySelector('#metrics-reset').addEventListener('click', () => {
            core.resetMetrics();
            refreshGameData(panel);
        });
    };

    const startStatusUpdates = () => {
        let checkingConnection = false;
        const refreshConnection = async () => {
            if (checkingConnection) return;
            checkingConnection = true;
            const result = await core.checkGameConnection();
            const connection = document.getElementById('larp-connection-status');
            if (connection) {
                connection.classList.toggle('is-online', result.ok);
                connection.innerHTML = `<span class="lam-connection-dot"></span>${result.ok
                    ? 'WebSocket conectado'
                    : 'Aguardando conexão com o jogo'}`;
            }
            checkingConnection = false;
        };

        setInterval(() => {
            refreshPotionDetails();
            const panel = document.getElementById('larp-automate-v2-panel');
            if (panel) refreshGameData(panel);
        }, 500);
        refreshConnection();
        setInterval(refreshConnection, 1500);
    };

    const refreshPotionDetails = () => {
        [
            { type: 'hp', potion: state.settings.hpPotionType },
            { type: 'sp', potion: state.settings.spPotionType }
        ].forEach(({ type, potion }) => {
            const quantity = core.getPotionQtyForType(potion);
            const refillInfo = document.getElementById(`refiller-${type}-info`);
            const potionName = config.shops.potionNames[potion];
            if (refillInfo) {
                refillInfo.textContent = `${potionName} · Qty: ${quantity ?? '?'}`;
            }
        });
    };

    const formatNumber = value => Number.isFinite(value)
        ? new Intl.NumberFormat('pt-BR').format(value)
        : '–';

    const formatJob = job => job
        ? job.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toLocaleUpperCase())
        : '–';

    const refreshGameData = (panel) => {
        const { player, metrics, logs } = state;
        const summary = panel.querySelector('#character-summary');
        if (summary) {
            summary.textContent = player.name
                ? `${player.name}\nClasse: ${formatJob(player.job)}\nNível base: ${formatNumber(player.baseLevel)} · Nível de classe: ${formatNumber(player.jobLevel)}`
                : 'Aguardando sincronização do jogo';
        }
        const characterStatus = [
            ['#character-hp', player.hp],
            ['#character-sp', player.sp],
            ['#character-base-exp', player.baseExp]
        ];
        characterStatus.forEach(([selector, value]) => {
            const element = panel.querySelector(selector);
            if (element) element.textContent = formatNumber(value);
        });
        const characterMap = panel.querySelector('#character-map');
        if (characterMap) {
            characterMap.textContent = player.map
                ? (config.mapNames[player.map] || player.map)
                : '–';
        }

        const xpPerHour = panel.querySelector('#metrics-xp-hour');
        if (xpPerHour) {
            xpPerHour.textContent = metrics.xpPerHour === null
                ? 'Calculando...'
                : `${formatNumber(metrics.xpPerHour)} XP`;
        }
        const elapsed = panel.querySelector('#metrics-elapsed');
        if (elapsed) {
            const elapsedSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
            const hours = Math.floor(elapsedSeconds / 3600);
            const minutes = Math.floor((elapsedSeconds % 3600) / 60);
            const seconds = elapsedSeconds % 60;
            elapsed.textContent = [hours, minutes, seconds]
                .map(value => String(value).padStart(2, '0'))
                .join(':');
        }

        const skillOptions = panel.querySelector('#fastskill-options');
        if (skillOptions) {
            const eligibleSkills = core.getEligibleSkills();
            const skillSignature = JSON.stringify(eligibleSkills);
            if (skillOptions.dataset.signature !== skillSignature) {
                skillOptions.dataset.signature = skillSignature;
                skillOptions.replaceChildren();
                if (eligibleSkills.length === 0) {
                    skillOptions.textContent = 'Nenhuma skill aprendida e automática na hotbar';
                } else {
                    eligibleSkills.forEach(skill => {
                        const label = document.createElement('label');
                        label.className = 'lam-fastskill-option';
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.dataset.fastskillId = skill.id;
                        checkbox.checked = state.fastSkill.skills[skill.id] === true;
                        const description = document.createElement('span');
                        description.textContent = `${skill.id} · Nv. ${skill.level}`;
                        label.append(checkbox, description);
                        skillOptions.appendChild(label);
                    });
                }
            }
        }

        const logList = panel.querySelector('#websocket-logs');
        if (logList) {
            if (!state.settings.logsEnabled) {
                if (logList.dataset.signature !== 'disabled') {
                    logList.dataset.signature = 'disabled';
                    logList.replaceChildren();
                    logList.textContent = 'Extração de logs desativada';
                }
                return;
            }
            const lastLog = logs[logs.length - 1];
            const logSignature = `${logs.length}:${lastLog?.id ?? ''}`;
            if (logList.dataset.signature !== logSignature) {
                logList.dataset.signature = logSignature;
                logList.replaceChildren();
                if (logs.length === 0) {
                    logList.textContent = 'Aguardando mensagens';
                } else {
                    logs.slice(-60).forEach(entry => {
                        const line = document.createElement('div');
                        const type = ['state', 'sync'].includes(entry.messageType)
                            ? 'Sync'
                            : entry.messageType;
                        line.textContent = `${entry.timestamp} · ${entry.direction} - ${type}`;
                        logList.appendChild(line);
                    });
                }
            }
        }
    };

    namespace.ui = { build };
})(globalThis.LarpAutomate = globalThis.LarpAutomate || {});
