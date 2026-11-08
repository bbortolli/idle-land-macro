(function (namespace) {
    'use strict';

    const config = namespace.config;
    if (!config) throw new Error('Larp Automate V2 config must load before core.js');

    const STORAGE_KEY = 'larpAutopotSettings';
    const PAGE_STORAGE_KEY = 'larpAutomateV2Settings';
    const SETTINGS_SCHEMA_VERSION = 1;
    const BRIDGE_CHANNEL = 'larp-automate-v2';
    const SAVE_DEBOUNCE_MS = 750;
    const REFILL_TIMING = {
        preparationMs: [800, 1600],
        purchaseClickMs: [700, 1400],
        afterPurchasesMs: [1200, 2200],
        quantityVerifyTimeoutMs: 10000
    };
    const AUTOHUNT_CHECK_INTERVAL_MS = 10000;
    const METRICS_SAMPLE_INTERVAL_MS = 3000;

    const state = {
        autopot: {
            enabled: true,
            hpThreshold: 250,
            spThreshold: 50
        },
        autorefiller: {
            hpEnabled: false,
            spEnabled: false,
            hpMinToRefill: 10,
            spMinToRefill: 10,
            hpMaxToBuy: 50,
            spMaxToBuy: 50,
            phase: 'idle',
            lastAction: 0
        },
        settings: {
            checkMs: 500,
            hpPotionType: 'potion-red',
            spPotionType: 'potion-blue',
            liteMode: false,
            logsEnabled: true
        },
        autohunt: {
            map: 'clover_meadow',
            returnToMapEnabled: false
        },
        fastSkill: {
            intervalMs: 500,
            skills: {}
        },
        player: {
            name: '',
            job: '',
            baseLevel: null,
            jobLevel: null,
            map: '',
            hp: null,
            sp: null,
            baseExp: null,
            skills: {},
            hotbar: [],
            inventoryReady: false,
            potions: []
        },
        metrics: {
            baseExp: null,
            xpPerHour: null,
            samples: [],
            startedAt: Date.now(),
            elapsedSeconds: 0
        },
        logs: [],
        connection: {
            online: false
        },
        intervalId: null
    };
    let purchaseTargets = [];
    let purchaseVerificationStartedAt = 0;
    let saveSettingsTimeout = null;
    let settingsDirty = false;
    let fastSkillIntervalId = null;
    let liteModeObserver = null;
    let gameRequestId = 0;
    let websocketLogSequence = 0;
    let lastAutohuntCheckAt = 0;
    let autohuntRequestPending = false;
    let pendingGameActions = 0;
    let xpSample = null;
    const pendingGameRequests = new Map();
    const lastPotionUse = new Map();
    const originalScreenGameDisplay = new WeakMap();
    const reportedActionErrors = new Set();
    const MAX_WEBSOCKET_LOGS = 100;

    const log = (...args) => console.log('[Larp Automate V2]', ...args);

    window.addEventListener('message', event => {
        const response = event.data;
        if (event.source !== window || response?.channel !== BRIDGE_CHANNEL) return;

        if (response.type === 'websocket-log') {
            if (!state.settings.logsEnabled) return;
            if (!['ENVIADO', 'RECEBIDO'].includes(response.direction) ||
                typeof response.messageType !== 'string') return;
            state.logs.push({
                id: ++websocketLogSequence,
                direction: response.direction,
                messageType: response.messageType,
                timestamp: new Date().toLocaleTimeString()
            });
            if (state.logs.length > MAX_WEBSOCKET_LOGS) state.logs.shift();
            return;
        }

        if (response.type === 'game-state') {
            updateGameState(response.player);
            return;
        }

        if (response.type !== 'response' || typeof response.requestId !== 'string') return;

        const pending = pendingGameRequests.get(response.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        pendingGameRequests.delete(response.requestId);
        pending.resolve({
            ok: response.ok === true,
            error: response.error || null
        });
    });

    const requestGameBridge = (action) => new Promise(resolve => {
        const requestId = `${Date.now()}-${++gameRequestId}`;
        const timeout = setTimeout(() => {
            pendingGameRequests.delete(requestId);
            resolve({ ok: false, error: 'bridge-timeout' });
        }, 1500);
        pendingGameRequests.set(requestId, { resolve, timeout });
        window.postMessage({
            channel: BRIDGE_CHANNEL,
            type: 'request',
            requestId,
            action
        }, location.origin);
    });

    const checkGameConnection = async () => {
        const result = await requestGameBridge({ type: 'status' });
        state.connection.online = result.ok;
        return result;
    };

    const sendGameAction = async (action) => {
        pendingGameActions++;
        try {
            const result = await requestGameBridge(action);
            if (result.error === 'socket-not-open') {
                state.connection.online = false;
            }
            return result;
        } finally {
            pendingGameActions--;
        }
    };

    const randomDelay = ([minimum, maximum]) =>
        Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;

    const schedulePurchaseVerification = () => {
        purchaseVerificationStartedAt = Date.now();
        state.autorefiller.phase = 'settlingPurchases';
        setTimeout(() => {
            if (state.autorefiller.phase === 'settlingPurchases') {
                state.autorefiller.phase = 'verifyPurchase';
            }
        }, randomDelay(REFILL_TIMING.afterPurchasesMs));
    };

    const getPersistedSettings = () => ({
        autopot: {
            enabled: state.autopot.enabled,
            hpThreshold: state.autopot.hpThreshold,
            spThreshold: state.autopot.spThreshold
        },
        autorefiller: {
            hpEnabled: state.autorefiller.hpEnabled,
            spEnabled: state.autorefiller.spEnabled,
            hpMinToRefill: state.autorefiller.hpMinToRefill,
            spMinToRefill: state.autorefiller.spMinToRefill,
            hpMaxToBuy: state.autorefiller.hpMaxToBuy,
            spMaxToBuy: state.autorefiller.spMaxToBuy
        },
        settings: {
            checkMs: state.settings.checkMs,
            hpPotionType: state.settings.hpPotionType,
            spPotionType: state.settings.spPotionType,
            liteMode: state.settings.liteMode,
            logsEnabled: state.settings.logsEnabled
        },
        autohunt: {
            map: state.autohunt.map,
            returnToMapEnabled: state.autohunt.returnToMapEnabled
        },
        fastSkill: {
            intervalMs: state.fastSkill.intervalMs,
            skills: { ...state.fastSkill.skills }
        }
    });

    const createSettingsRecord = (settings) => ({
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        updatedAt: Date.now(),
        settings
    });

    const parseSettingsRecord = (record) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
        if (record.schemaVersion === SETTINGS_SCHEMA_VERSION &&
            record.settings && typeof record.settings === 'object' &&
            !Array.isArray(record.settings) && Number.isFinite(record.updatedAt)) {
            return { settings: record.settings, updatedAt: record.updatedAt, legacy: false };
        }

        const hasSettings = ['autopot', 'autorefiller', 'settings', 'autohunt', 'fastSkill']
            .some(key => record[key] && typeof record[key] === 'object');
        return hasSettings ? { settings: record, updatedAt: 0, legacy: true } : null;
    };

    const mergeLegacySettings = (syncSettings, localSettings) => {
        const merged = { ...syncSettings, ...localSettings };
        ['autopot', 'autorefiller', 'settings', 'autohunt', 'fastSkill'].forEach(section => {
            if (syncSettings[section] || localSettings[section]) {
                merged[section] = {
                    ...(syncSettings[section] || {}),
                    ...(localSettings[section] || {})
                };
            }
        });
        return merged;
    };

    const updateGameState = (player) => {
        if (!player || typeof player !== 'object') return;
        const playerName = typeof player.name === 'string' ? player.name : '';
        if (state.player.name && playerName && state.player.name !== playerName) {
            xpSample = null;
            state.metrics.samples = [];
            state.metrics.xpPerHour = null;
        }
        state.player.name = playerName;
        state.player.job = typeof player.job === 'string' ? player.job : '';
        state.player.map = typeof player.map === 'string' ? player.map : '';
        state.player.baseLevel = Number.isFinite(player.baseLevel) ? player.baseLevel : null;
        state.player.jobLevel = Number.isFinite(player.jobLevel) ? player.jobLevel : null;
        state.player.hp = Number.isFinite(player.hp) ? player.hp : null;
        state.player.sp = Number.isFinite(player.sp) ? player.sp : null;
        state.player.baseExp = Number.isFinite(player.baseExp) ? player.baseExp : null;
        state.player.skills = player.skills && typeof player.skills === 'object'
            ? player.skills
            : {};
        state.player.hotbar = Array.isArray(player.hotbar) ? player.hotbar.slice(0, 9) : [];
        state.player.inventoryReady = player.inventoryReady === true;
        state.player.potions = Array.isArray(player.potions)
            ? player.potions.filter(entry =>
                entry && config.shops.potionTypes.hp.concat(config.shops.potionTypes.sp).includes(entry.item) &&
                typeof entry.uid === 'string' && entry.uid.length > 0 &&
                Number.isFinite(entry.qty) && entry.qty >= 0
            )
            : [];

        if (state.player.baseExp === null) return;
        const now = Date.now();
        state.metrics.baseExp = state.player.baseExp;
        state.metrics.elapsedSeconds = Math.floor((now - state.metrics.startedAt) / 1000);
        if (!xpSample || state.player.baseExp < xpSample.baseExp) {
            xpSample = { baseExp: state.player.baseExp, timestamp: now };
            state.metrics.samples = [];
            state.metrics.xpPerHour = null;
            return;
        }

        const elapsed = now - xpSample.timestamp;
        if (elapsed < METRICS_SAMPLE_INTERVAL_MS) return;
        const hourlyRate = Math.max(0, (state.player.baseExp - xpSample.baseExp) * 3600000 / elapsed);
        state.metrics.samples.push(hourlyRate);
        if (state.metrics.samples.length > 6) state.metrics.samples.shift();
        state.metrics.xpPerHour = Math.round(
            state.metrics.samples.reduce((sum, sample) => sum + sample, 0) / state.metrics.samples.length
        );
        xpSample = { baseExp: state.player.baseExp, timestamp: now };
    };

    const applyStoredSettings = (stored) => {
        if (!stored || typeof stored !== 'object') {
            log('Stored settings are invalid; using defaults');
            return;
        }

        let migratedSettings = false;
        if (typeof stored.autopot?.enabled === 'boolean') {
            state.autopot.enabled = stored.autopot.enabled;
        }
        if (Number.isFinite(stored.autopot?.hpThreshold) && stored.autopot.hpThreshold >= 0) {
            state.autopot.hpThreshold = stored.autopot.hpThreshold;
        }
        if (Number.isFinite(stored.autopot?.spThreshold) && stored.autopot.spThreshold >= 0) {
            state.autopot.spThreshold = stored.autopot.spThreshold;
        }

        if (typeof stored.autorefiller?.hpEnabled === 'boolean') {
            state.autorefiller.hpEnabled = stored.autorefiller.hpEnabled;
        }
        if (typeof stored.autorefiller?.spEnabled === 'boolean') {
            state.autorefiller.spEnabled = stored.autorefiller.spEnabled;
        }
        if (typeof stored.autorefiller?.enabled === 'boolean') {
            if (typeof stored.autorefiller.hpEnabled !== 'boolean') {
                state.autorefiller.hpEnabled = stored.autorefiller.enabled;
                migratedSettings = true;
            }
            if (typeof stored.autorefiller.spEnabled !== 'boolean') {
                state.autorefiller.spEnabled = stored.autorefiller.enabled;
                migratedSettings = true;
            }
        }
        if (Number.isFinite(stored.autorefiller?.hpMinToRefill) && stored.autorefiller.hpMinToRefill >= 0) {
            state.autorefiller.hpMinToRefill = stored.autorefiller.hpMinToRefill;
        } else if (Number.isFinite(stored.autorefiller?.minToRefill) && stored.autorefiller.minToRefill >= 0) {
            state.autorefiller.hpMinToRefill = stored.autorefiller.minToRefill;
            migratedSettings = true;
        }
        if (Number.isFinite(stored.autorefiller?.spMinToRefill) && stored.autorefiller.spMinToRefill >= 0) {
            state.autorefiller.spMinToRefill = stored.autorefiller.spMinToRefill;
        } else if (Number.isFinite(stored.autorefiller?.minToRefill) && stored.autorefiller.minToRefill >= 0) {
            state.autorefiller.spMinToRefill = stored.autorefiller.minToRefill;
            migratedSettings = true;
        }
        if (Number.isFinite(stored.autorefiller?.hpMaxToBuy) && stored.autorefiller.hpMaxToBuy >= 0) {
            state.autorefiller.hpMaxToBuy = stored.autorefiller.hpMaxToBuy;
        } else if (Number.isFinite(stored.autorefiller?.maxToBuy) && stored.autorefiller.maxToBuy >= 0) {
            state.autorefiller.hpMaxToBuy = stored.autorefiller.maxToBuy;
            migratedSettings = true;
        }
        if (Number.isFinite(stored.autorefiller?.spMaxToBuy) && stored.autorefiller.spMaxToBuy >= 0) {
            state.autorefiller.spMaxToBuy = stored.autorefiller.spMaxToBuy;
        } else if (Number.isFinite(stored.autorefiller?.maxToBuy) && stored.autorefiller.maxToBuy >= 0) {
            state.autorefiller.spMaxToBuy = stored.autorefiller.maxToBuy;
            migratedSettings = true;
        }

        if (Number.isFinite(stored.settings?.checkMs)) {
            state.settings.checkMs = Math.max(200, Math.min(1000, stored.settings.checkMs));
        }
        if (config.shops.potionTypes.hp.includes(stored.settings?.hpPotionType)) {
            state.settings.hpPotionType = stored.settings.hpPotionType;
        }
        if (config.shops.potionTypes.sp.includes(stored.settings?.spPotionType)) {
            state.settings.spPotionType = stored.settings.spPotionType;
        }
        if (typeof stored.settings?.liteMode === 'boolean') {
            state.settings.liteMode = stored.settings.liteMode;
        }
        if (typeof stored.settings?.logsEnabled === 'boolean') {
            state.settings.logsEnabled = stored.settings.logsEnabled;
        }
        if (config.maps.includes(stored.autohunt?.map)) {
            state.autohunt.map = stored.autohunt.map;
        }
        if (typeof stored.autohunt?.returnToMapEnabled === 'boolean') {
            state.autohunt.returnToMapEnabled = stored.autohunt.returnToMapEnabled;
        }
        if (Number.isFinite(stored.fastSkill?.intervalMs)) {
            state.fastSkill.intervalMs = Math.max(100, Math.min(10000, stored.fastSkill.intervalMs));
        }
        if (stored.fastSkill?.skills && typeof stored.fastSkill.skills === 'object') {
            Object.entries(stored.fastSkill.skills).forEach(([skill, enabled]) => {
                if (/^[a-z0-9_-]+$/i.test(skill) && typeof enabled === 'boolean') {
                    state.fastSkill.skills[skill] = enabled;
                }
            });
        }
        if (migratedSettings) {
            log('Migrating saved autorefiller settings');
        }
        return migratedSettings;
    };

    const writeSettings = (storage, record, areaName) => {
        if (!storage) {
            log(`chrome.storage.${areaName} is unavailable; settings were not saved there`);
            return;
        }
        storage.set({ [STORAGE_KEY]: record }, () => {
            const error = globalThis.chrome?.runtime?.lastError;
            if (error) {
                log(`Could not save settings to chrome.storage.${areaName}: ${error.message}`);
                return;
            }
            if (areaName === 'sync') log('Settings saved to chrome.storage.sync');
        });
    };

    const readPageSettings = () => {
        try {
            const value = window.localStorage.getItem(PAGE_STORAGE_KEY);
            if (!value) return null;
            const parsed = JSON.parse(value);
            return parseSettingsRecord(parsed);
        } catch (error) {
            log(`Could not read settings from page storage: ${error.message}`);
            return null;
        }
    };

    const writePageSettings = (record) => {
        try {
            window.localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify(record));
        } catch (error) {
            log(`Could not save settings to page storage: ${error.message}`);
        }
    };

    const loadSettings = (onLoaded) => {
        const pageRecord = readPageSettings();
        const storage = globalThis.chrome?.storage;
        if (!storage) {
            if (pageRecord) {
                applyStoredSettings(pageRecord.settings);
                log('Settings loaded from page storage');
                if (pageRecord.legacy) saveSettings();
            } else {
                log('Chrome extension storage is unavailable; using defaults');
            }
            onLoaded();
            return;
        }

        const areas = ['local', 'sync'].filter(area => storage[area]);
        if (areas.length === 0) {
            if (pageRecord) {
                applyStoredSettings(pageRecord.settings);
                log('Settings loaded from page storage');
                if (pageRecord.legacy) saveSettings();
            } else {
                log('No Chrome storage area is available; using defaults');
            }
            onLoaded();
            return;
        }

        const records = { page: pageRecord };
        let pendingReads = areas.length;
        let readFailed = false;
        const finishLoading = () => {
            pendingReads--;
            if (pendingReads > 0) return;

            const localRecord = records.local;
            const syncRecord = records.sync;
            const legacyRecords = [syncRecord, localRecord, records.page]
                .filter(record => record?.legacy);
            let selected;
            if (legacyRecords.length > 1 &&
                [syncRecord, localRecord, records.page]
                    .filter(Boolean)
                    .every(record => record.legacy)) {
                selected = {
                    settings: legacyRecords.reduce(
                        (merged, record) => mergeLegacySettings(merged, record.settings),
                        {}
                    ),
                    legacy: true,
                    source: 'legacy storage'
                };
            } else if (localRecord && syncRecord) {
                selected = { ...localRecord, source: 'local' };
            } else {
                selected = null;
            }

            const candidates = [
                { record: syncRecord, source: 'sync' },
                { record: localRecord, source: 'local' },
                { record: records.page, source: 'page' }
            ].filter(candidate => candidate.record && !candidate.record.legacy);
            candidates.forEach(candidate => {
                if (!selected || candidate.record.updatedAt >= selected.updatedAt) {
                    selected = { ...candidate.record, source: candidate.source };
                }
            });
            if (!selected) {
                selected = [records.page, localRecord, syncRecord]
                    .find(record => record) || null;
            }

            if (!selected) {
                if (readFailed) {
                    log('Could not read settings from any Chrome storage area; using defaults');
                } else {
                    log('No saved settings found; using defaults');
                }
                onLoaded();
                return;
            }

            const migratedSettings = applyStoredSettings(selected.settings);
            log(`Settings loaded from ${selected.source || 'legacy storage'}`);
            if (selected.legacy || migratedSettings ||
                !records.page || !localRecord || !syncRecord ||
                localRecord.updatedAt !== syncRecord.updatedAt ||
                localRecord.updatedAt !== records.page?.updatedAt ||
                syncRecord.updatedAt !== records.page?.updatedAt) {
                saveSettings();
            }
            onLoaded();
        };

        areas.forEach(area => {
            storage[area].get(STORAGE_KEY, result => {
                const error = globalThis.chrome?.runtime?.lastError;
                if (error) {
                    readFailed = true;
                    log(`Could not load settings from chrome.storage.${area}: ${error.message}`);
                } else {
                    records[area] = parseSettingsRecord(result?.[STORAGE_KEY]);
                }
                finishLoading();
            });
        });
    };

    const saveSettingsNow = (persistLocal = true) => {
        if (saveSettingsTimeout !== null) {
            clearTimeout(saveSettingsTimeout);
            saveSettingsTimeout = null;
        }
        if (!settingsDirty) return;

        const record = createSettingsRecord(getPersistedSettings());
        writePageSettings(record);
        const storage = globalThis.chrome?.storage;
        if (!storage) {
            settingsDirty = false;
            log('Chrome extension storage is unavailable; settings were saved only to page storage');
            return;
        }
        if (persistLocal) writeSettings(storage.local, record, 'local');
        writeSettings(storage.sync, record, 'sync');
        settingsDirty = false;
    };

    const saveSettings = () => {
        settingsDirty = true;
        const record = createSettingsRecord(getPersistedSettings());
        writePageSettings(record);
        const localStorage = globalThis.chrome?.storage?.local;
        if (localStorage) {
            writeSettings(localStorage, record, 'local');
        } else {
            log('chrome.storage.local is unavailable; settings are not persisted locally');
        }
        if (saveSettingsTimeout !== null) clearTimeout(saveSettingsTimeout);
        saveSettingsTimeout = setTimeout(() => saveSettingsNow(false), SAVE_DEBOUNCE_MS);
    };

    window.addEventListener('pagehide', () => saveSettingsNow());

    const applyLiteMode = (enabled = state.settings.liteMode) => {
        const screenGame = document.getElementById('screen-game');
        if (!enabled) {
            if (liteModeObserver) {
                liteModeObserver.disconnect();
                liteModeObserver = null;
            }
            if (screenGame && originalScreenGameDisplay.has(screenGame)) {
                const original = originalScreenGameDisplay.get(screenGame);
                if (original.value) {
                    screenGame.style.setProperty('display', original.value, original.priority);
                } else {
                    screenGame.style.removeProperty('display');
                }
                originalScreenGameDisplay.delete(screenGame);
            }
            return;
        }

        if (screenGame) {
            if (!originalScreenGameDisplay.has(screenGame)) {
                originalScreenGameDisplay.set(screenGame, {
                    value: screenGame.style.getPropertyValue('display'),
                    priority: screenGame.style.getPropertyPriority('display')
                });
            }
            if (screenGame.style.getPropertyValue('display') !== 'none' ||
                screenGame.style.getPropertyPriority('display') !== 'important') {
                screenGame.style.setProperty('display', 'none', 'important');
            }
        }
        if (!liteModeObserver && document.documentElement) {
            liteModeObserver = new MutationObserver(() => {
                if (state.settings.liteMode) applyLiteMode(true);
            });
            liteModeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['style'],
                childList: true,
                subtree: true
            });
        }
    };

    const setLiteMode = (enabled) => {
        state.settings.liteMode = enabled === true;
        applyLiteMode();
        saveSettings();
    };

    const setWebSocketLogging = (enabled) => {
        state.settings.logsEnabled = enabled === true;
        if (!state.settings.logsEnabled) state.logs.length = 0;
        window.postMessage({
            channel: BRIDGE_CHANNEL,
            type: 'logging-setting',
            enabled: state.settings.logsEnabled
        }, location.origin);
        saveSettings();
    };

    const syncWebSocketLogging = () => {
        window.postMessage({
            channel: BRIDGE_CHANNEL,
            type: 'logging-setting',
            enabled: state.settings.logsEnabled
        }, location.origin);
    };

    const getPotionQtyForType = (potionType) => {
        if (!state.player.inventoryReady) return null;
        const potions = config.shops.potionTypes.hp.concat(config.shops.potionTypes.sp);
        if (!potions.includes(potionType)) return null;
        return state.player.potions
            .filter(entry => entry.item === potionType)
            .reduce((total, entry) => total + entry.qty, 0);
    };

    const getEligibleSkills = () => {
        const learnedSkills = state.player.skills;
        const skills = new Map();
        state.player.hotbar.forEach((slot, index) => {
            if (slot?.auto !== true || typeof slot.skill !== 'string' ||
                !Number.isFinite(learnedSkills[slot.skill]) || learnedSkills[slot.skill] <= 0) return;
            skills.set(slot.skill, {
                id: slot.skill,
                level: learnedSkills[slot.skill],
                slot: index + 1
            });
        });
        return [...skills.values()];
    };

    const updateFastSkillInterval = () => {
        if (fastSkillIntervalId !== null) {
            clearInterval(fastSkillIntervalId);
            fastSkillIntervalId = null;
        }
        if (!Object.values(state.fastSkill.skills).some(Boolean)) return;

        fastSkillIntervalId = setInterval(() => {
            if (!state.connection.online) return;
            getEligibleSkills()
                .filter(skill => state.fastSkill.skills[skill.id])
                .forEach(skill => {
                    const errorKey = `skill:${skill.id}`;
                    sendGameAction({ type: 'cast', skill: skill.id }).then(result => {
                        if (!result.ok && !reportedActionErrors.has(errorKey)) {
                            reportedActionErrors.add(errorKey);
                            log(`Fast Skill ${skill.id} failed: ${result.error}`);
                        } else if (result.ok) {
                            reportedActionErrors.delete(errorKey);
                        }
                    });
                });
        }, state.fastSkill.intervalMs);
    };

    const buildPurchasePlan = (amount) => {
        const availableQuantities = [...new Set(config.shops.purchaseQuantities)]
            .filter(quantity => Number.isInteger(quantity) && quantity > 0)
            .sort((a, b) => b - a);
        const plan = [];
        let remaining = amount;

        for (const quantity of availableQuantities) {
            const count = Math.floor(remaining / quantity);
            if (count > 0) plan.push({ quantity, count });
            remaining %= quantity;
        }

        return remaining === 0 ? plan : null;
    };

    const sendRefillPurchase = async (purchase) => {
        const result = await sendGameAction({
            type: 'buy',
            item: purchase.potionType,
            qty: purchase.quantity
        });
        if (!result.ok) {
            log(`Purchase failed (${purchase.potionType} x${purchase.quantity}): ${result.error}`);
        }
        return result.ok;
    };

    const checkAutopot = () => {
        if (!state.autopot.enabled || !state.connection.online) return;

        const hp = state.player.hp;
        const sp = state.player.sp;

        const requests = [
            { label: 'HP', value: hp, threshold: state.autopot.hpThreshold, potion: state.settings.hpPotionType },
            { label: 'SP', value: sp, threshold: state.autopot.spThreshold, potion: state.settings.spPotionType }
        ];
        requests.forEach(({ label, value, threshold, potion }) => {
            if (value === null || value >= threshold) return;
            const now = Date.now();
            if (now - (lastPotionUse.get(potion) || 0) < 1000) return;
            lastPotionUse.set(potion, now);
            sendGameAction({ type: 'useItem', item: potion }).then(result => {
                if (!result.ok) {
                    log(`Autopot ${label} failed: ${result.error}`);
                    return;
                }
                log(`Autopot ${label}: ${value} < ${threshold}`);
            });
        });
    };

    const checkAutorefiller = () => {
        const now = Date.now();
        const {
            phase,
            hpMinToRefill,
            spMinToRefill,
            hpMaxToBuy,
            spMaxToBuy
        } = state.autorefiller;

        if (phase === 'idle') {
            if (!state.connection.online ||
                (!state.autorefiller.hpEnabled && !state.autorefiller.spEnabled)) return;
            if (now - state.autorefiller.lastAction < 3000) return;

            const hpQty = getPotionQtyForType(state.settings.hpPotionType);
            const spQty = getPotionQtyForType(state.settings.spPotionType);
            const needHp = state.autorefiller.hpEnabled && hpQty !== null && hpQty < hpMinToRefill;
            const needSp = state.autorefiller.spEnabled && spQty !== null && spQty < spMinToRefill;

            if (needHp || needSp) {
                log(`Refill needed - HP: ${hpQty} (min ${hpMinToRefill}), SP: ${spQty} (min ${spMinToRefill})`);
                state.autorefiller.phase = 'preparing';
                state.autorefiller.lastAction = now;
                setTimeout(() => {
                    if (state.autorefiller.phase === 'preparing') {
                        state.autorefiller.phase = 'buying';
                    }
                }, randomDelay(REFILL_TIMING.preparationMs));
            }
            return;
        }

        if (phase === 'buying') {
            const hpQty = getPotionQtyForType(state.settings.hpPotionType);
            const spQty = getPotionQtyForType(state.settings.spPotionType);
            const requests = [
                {
                    label: 'HP',
                    enabled: state.autorefiller.hpEnabled,
                    potionType: state.settings.hpPotionType,
                    qty: hpQty,
                    maxToBuy: hpMaxToBuy
                },
                {
                    label: 'SP',
                    enabled: state.autorefiller.spEnabled,
                    potionType: state.settings.spPotionType,
                    qty: spQty,
                    maxToBuy: spMaxToBuy
                }
            ].filter(item => {
                const minQty = item.label === 'HP' ? hpMinToRefill : spMinToRefill;
                if (!item.enabled) return false;
                if (item.qty === null) {
                    log(`Cannot refill ${item.label}: waiting for potion inventory from WebSocket state`);
                    return false;
                }
                return item.qty < minQty;
            });
            const purchases = [];
            purchaseTargets = [];

            for (const item of requests) {
                const amount = Math.max(0, item.maxToBuy - item.qty);
                const plan = buildPurchasePlan(amount);
                if (plan === null) {
                    log(`Cannot exactly buy ${amount} ${item.label} potions (${item.potionType}) with quantities ${config.shops.purchaseQuantities.join(', ')}`);
                    purchaseTargets = [];
                    schedulePurchaseVerification();
                    return;
                }

                if (amount > 0) {
                    purchaseTargets.push({
                        label: item.label,
                        potionType: item.potionType,
                        quantity: item.maxToBuy
                    });
                }
                plan.forEach(step => purchases.push({
                    potionType: item.potionType,
                    quantity: step.quantity,
                    count: step.count
                }));
                if (amount > 0) {
                    log(`Buying ${amount} ${item.label} potions (${item.potionType}) in ${plan
                        .map(step => `${step.count}x${step.quantity}`)
                        .join(' + ')}`);
                }
            }

            if (purchases.length === 0) {
                schedulePurchaseVerification();
                return;
            }

            state.autorefiller.phase = 'purchasing';
            let purchaseIndex = 0;
            let purchaseCount = 0;
            const sendNextPurchase = async () => {
                const purchase = purchases[purchaseIndex];
                const sent = await sendRefillPurchase(purchase);
                if (!sent) {
                    schedulePurchaseVerification();
                    return;
                }

                purchaseCount++;
                if (purchaseCount >= purchase.count) {
                    purchaseIndex++;
                    purchaseCount = 0;
                }
                if (purchaseIndex < purchases.length) {
                    setTimeout(() => {
                        if (state.autorefiller.phase === 'purchasing') sendNextPurchase();
                    }, randomDelay(REFILL_TIMING.purchaseClickMs));
                    return;
                }
                schedulePurchaseVerification();
            };
            sendNextPurchase();
            return;
        }

        if (phase === 'verifyPurchase') {
            const quantitiesReady = purchaseTargets.every(target => {
                const quantity = getPotionQtyForType(target.potionType);
                return quantity !== null && quantity >= target.quantity;
            });
            const verificationExpired = now - purchaseVerificationStartedAt >= REFILL_TIMING.quantityVerifyTimeoutMs;

            if (!quantitiesReady && !verificationExpired) return;
            if (!quantitiesReady) {
                const remaining = purchaseTargets
                    .filter(target => {
                        const quantity = getPotionQtyForType(target.potionType);
                        return quantity === null || quantity < target.quantity;
                    })
                    .map(target => {
                        const quantity = getPotionQtyForType(target.potionType);
                        return `${target.label}: ${quantity ?? '?'} / ${target.quantity}`;
                    });
                log(`Refill quantity check timed out (${remaining.join(', ')})`);
            } else {
                log('Refill quantities verified');
            }

            purchaseTargets = [];
            state.autorefiller.phase = 'returning';
            sendGameAction({ type: 'setMap', map: state.autohunt.map }).then(result => {
                if (!result.ok) {
                    log(`Could not return to hunt (${state.autohunt.map}): ${result.error}`);
                } else {
                    log(`Refill complete; returning to ${state.autohunt.map}`);
                }
                lastAutohuntCheckAt = Date.now();
                state.autorefiller.phase = 'idle';
                state.autorefiller.lastAction = Date.now();
            });
        }
    };

    const checkAutohunt = () => {
        const now = Date.now();
        if (!state.autohunt.returnToMapEnabled ||
            !state.connection.online ||
            state.autorefiller.phase !== 'idle' ||
            pendingGameActions > 0 ||
            autohuntRequestPending ||
            now - lastAutohuntCheckAt < AUTOHUNT_CHECK_INTERVAL_MS ||
            !state.player.map ||
            state.player.map === state.autohunt.map) return;

        lastAutohuntCheckAt = now;
        autohuntRequestPending = true;
        log(`Current map is ${state.player.map}; returning to ${state.autohunt.map}`);
        sendGameAction({ type: 'setMap', map: state.autohunt.map }).then(result => {
            if (!result.ok) log(`Could not return to hunt (${state.autohunt.map}): ${result.error}`);
            autohuntRequestPending = false;
        });
    };

    const resetMetrics = () => {
        const now = Date.now();
        state.metrics.startedAt = now;
        state.metrics.elapsedSeconds = 0;
        state.metrics.samples = [];
        state.metrics.xpPerHour = null;
        xpSample = Number.isFinite(state.player.baseExp)
            ? { baseExp: state.player.baseExp, timestamp: now }
            : null;
    };

    const check = () => {
        checkAutopot();
        checkAutorefiller();
        checkAutohunt();
    };

    const restartInterval = () => {
        if (state.intervalId) clearInterval(state.intervalId);
        state.intervalId = setInterval(check, state.settings.checkMs);
        log(`Check rate: ${state.settings.checkMs}ms`);
    };

    const start = (buildUI) => {
        const boot = () => {
            buildUI();
            restartInterval();
            check();
            log('Larp Automate V2 started');
        };
        boot();
    };

    const initialize = (buildUI) => {
        loadSettings(() => {
            applyLiteMode();
            syncWebSocketLogging();
            updateFastSkillInterval();
            start(buildUI);
        });
    };

    namespace.core = {
        state,
        config,
        setLiteMode,
        setWebSocketLogging,
        getPotionQtyForType,
        getEligibleSkills,
        checkGameConnection,
        sendGameAction,
        updateFastSkillInterval,
        resetMetrics,
        saveSettings,
        restartInterval,
        initialize
    };
})(globalThis.LarpAutomate = globalThis.LarpAutomate || {});
