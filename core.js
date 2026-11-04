(function (namespace) {
    'use strict';

    const config = namespace.config;
    if (!config) throw new Error('Larp Automate V2 config must load before core.js');

    const STORAGE_KEY = 'larpAutopotSettings';
    const BRIDGE_CHANNEL = 'larp-automate-v2';
    const SAVE_DEBOUNCE_MS = 750;
    const REFILL_TIMING = {
        preparationMs: [800, 1600],
        purchaseClickMs: [700, 1400],
        afterPurchasesMs: [1200, 2200],
        quantityVerifyTimeoutMs: 10000
    };
    const AUTOHUNT_CHECK_INTERVAL_MS = 30000;
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
            spPotionType: 'potion-blue'
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
            baseExp: null,
            skills: {},
            hotbar: []
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
        observer: null,
        intervalId: null
    };
    let purchaseTargets = [];
    let purchaseVerificationStartedAt = 0;
    let saveSettingsTimeout = null;
    let settingsDirty = false;
    let fastSkillIntervalId = null;
    let gameRequestId = 0;
    let websocketLogSequence = 0;
    let lastAutohuntCheckAt = 0;
    let autohuntRequestPending = false;
    let pendingGameActions = 0;
    let xpSample = null;
    const pendingGameRequests = new Map();
    const lastPotionUse = new Map();
    const reportedActionErrors = new Set();
    const MAX_WEBSOCKET_LOGS = 100;

    const log = (...args) => console.log('[Larp Automate V2]', ...args);

    window.addEventListener('message', event => {
        const response = event.data;
        if (event.source !== window || response?.channel !== BRIDGE_CHANNEL) return;

        if (response.type === 'websocket-log') {
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
            spPotionType: state.settings.spPotionType
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
        state.player.baseExp = Number.isFinite(player.baseExp) ? player.baseExp : null;
        state.player.skills = player.skills && typeof player.skills === 'object'
            ? player.skills
            : {};
        state.player.hotbar = Array.isArray(player.hotbar) ? player.hotbar.slice(0, 9) : [];

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
            saveSettings();
        }
    };

    const writeSettings = (storage, settings, areaName) => {
        if (!storage) return;
        storage.set({ [STORAGE_KEY]: settings }, () => {
            const error = globalThis.chrome.runtime.lastError;
            if (error) {
                log(`Could not save settings to chrome.storage.${areaName}: ${error.message}`);
                return;
            }
            if (areaName === 'sync') {
                log('Settings saved to chrome.storage.sync');
            }
        });
    };

    const readSyncSettings = (onLoaded) => {
        const syncStorage = globalThis.chrome?.storage?.sync;
        if (!syncStorage) {
            log('chrome.storage.sync is unavailable');
            onLoaded(false);
            return;
        }

        syncStorage.get(STORAGE_KEY, result => {
            const error = globalThis.chrome.runtime.lastError;
            if (error) {
                log(`Could not load settings from chrome.storage.sync: ${error.message}`);
                onLoaded(false);
                return;
            }

            const stored = result[STORAGE_KEY];
            if (stored !== undefined) {
                applyStoredSettings(stored);
                log('Settings loaded from chrome.storage.sync');
                onLoaded(true);
                return;
            }
            onLoaded(false);
        });
    };

    const loadSettings = (onLoaded) => {
        const localStorage = globalThis.chrome?.storage?.local;
        if (!localStorage) {
            readSyncSettings(() => onLoaded());
            return;
        }

        localStorage.get(STORAGE_KEY, result => {
            const error = globalThis.chrome.runtime.lastError;
            if (error) {
                log(`Could not load settings from chrome.storage.local: ${error.message}`);
                readSyncSettings(() => onLoaded());
                return;
            }

            const stored = result[STORAGE_KEY];
            if (stored !== undefined) {
                applyStoredSettings(stored);
                log('Settings loaded from chrome.storage.local');
                onLoaded();
                return;
            }

            readSyncSettings(foundInSync => {
                if (foundInSync) {
                    writeSettings(localStorage, getPersistedSettings(), 'local');
                    log('Migrated existing settings to chrome.storage.local');
                }
                onLoaded();
            });
        });
    };

    const saveSettingsNow = (persistLocal = true) => {
        if (saveSettingsTimeout !== null) {
            clearTimeout(saveSettingsTimeout);
            saveSettingsTimeout = null;
        }
        if (!settingsDirty) return;

        settingsDirty = false;
        const settings = getPersistedSettings();
        const storage = globalThis.chrome?.storage;
        if (!storage) {
            log('Chrome extension storage is unavailable; settings were not saved');
            return;
        }
        if (persistLocal) writeSettings(storage.local, settings, 'local');
        writeSettings(storage.sync, settings, 'sync');
    };

    const saveSettings = () => {
        settingsDirty = true;
        const localStorage = globalThis.chrome?.storage?.local;
        if (localStorage) {
            writeSettings(localStorage, getPersistedSettings(), 'local');
        } else {
            log('chrome.storage.local is unavailable; settings are not persisted locally');
        }
        if (saveSettingsTimeout !== null) clearTimeout(saveSettingsTimeout);
        saveSettingsTimeout = setTimeout(() => saveSettingsNow(false), SAVE_DEBOUNCE_MS);
    };

    window.addEventListener('pagehide', saveSettingsNow);

    const parseValue = (element) => {
        if (!element) return null;
        const match = element.textContent.match(/(\d+)\s*\//);
        return match ? parseInt(match[1], 10) : null;
    };

    const getHotbarSlots = () => {
        const hotbar = document.getElementById(config.selectors.hotbar);
        return hotbar ? Array.from(hotbar.children) : [];
    };

    const getHotbarSlot = (index) => getHotbarSlots()[parseInt(index, 10) - 1] || null;

    const getHotbarIndexForPotion = (potionType) => {
        const serverSlot = state.player.hotbar.findIndex(slot => slot?.item === potionType);
        if (serverSlot >= 0) return String(serverSlot + 1);

        const potionName = config.shops.potionNames[potionType];
        const identityAttributes = ['data-item', 'data-item-id', 'data-id', 'data-uid', 'data-type'];
        const labelAttributes = ['title', 'aria-label', 'alt'];
        const matchesIdentity = value =>
            value === potionType || value.endsWith(`:${potionType}`);
        const matchesLabel = value => value.trim() === potionName;

        for (const [index, slot] of getHotbarSlots().entries()) {
            const elements = [slot, ...slot.querySelectorAll(
                '[data-item], [data-item-id], [data-id], [data-uid], [data-type], [title], [aria-label], [alt]'
            )];
            const found = elements.some(element =>
                identityAttributes.some(attribute => {
                    const value = element.getAttribute(attribute);
                    return value !== null && matchesIdentity(value);
                }) || (potionName && labelAttributes.some(attribute => {
                    const value = element.getAttribute(attribute);
                    return value !== null && matchesLabel(value);
                }))
            );
            if (found) return String(index + 1);
        }
        return null;
    };

    const getPotionQty = (index) => {
        const slot = getHotbarSlot(index);
        const quantityElement = slot && slot.querySelector('.qty');
        if (!quantityElement) return null;
        const quantity = parseInt(quantityElement.textContent, 10);
        return Number.isNaN(quantity) ? null : quantity;
    };

    const getPotionQtyForType = (potionType) => {
        const slot = getHotbarIndexForPotion(potionType);
        return slot === null ? null : getPotionQty(slot);
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

        const hp = parseValue(document.getElementById(config.selectors.hp));
        const sp = parseValue(document.getElementById(config.selectors.sp));

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
                    log(`Cannot refill ${item.label}: selected potion is not detected in the hotbar`);
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
            const hpElement = document.getElementById(config.selectors.hp);
            const spElement = document.getElementById(config.selectors.sp);
            if (!hpElement || !spElement) {
                setTimeout(boot, 500);
                return;
            }

            buildUI();
            state.observer = new MutationObserver(check);
            [hpElement, spElement].forEach(element => {
                state.observer.observe(element, {
                    childList: true,
                    characterData: true,
                    subtree: true
                });
            });
            restartInterval();
            check();
            log('Larp Automate V2 started');
        };
        boot();
    };

    const initialize = (buildUI) => {
        loadSettings(() => {
            updateFastSkillInterval();
            start(buildUI);
        });
    };

    namespace.core = {
        state,
        config,
        parseValue,
        getHotbarSlots,
        getHotbarIndexForPotion,
        getPotionQty,
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
