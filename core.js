(function (namespace) {
    'use strict';

    const config = namespace.config;
    if (!config) throw new Error('Larp Autopot config must load before core.js');

    const STORAGE_KEY = 'larpAutopotSettings';
    const SAVE_DEBOUNCE_MS = 750;
    const REFILL_TIMING = {
        preparationMs: [800, 1600],
        townToShopMs: [1600, 2600],
        shopToBuyingMs: [1000, 1800],
        purchaseClickMs: [700, 1400],
        afterPurchasesMs: [1200, 2200],
        quantityVerifyTimeoutMs: 10000,
        shopCloseMs: [1000, 1800],
        townLoadMs: [1500, 2500]
    };

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
            map: 'clover_meadow'
        },
        fastClick: {
            intervalMs: 500,
            slots: Object.fromEntries(
                Array.from({ length: 9 }, (_, index) => [String(index + 1), false])
            )
        },
        observer: null,
        intervalId: null
    };
    let purchaseTargets = [];
    let purchaseVerificationStartedAt = 0;
    let saveSettingsTimeout = null;
    let settingsDirty = false;
    let fastClickIntervalId = null;

    const log = (...args) => console.log('[Larp Autopot]', ...args);

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
            map: state.autohunt.map
        },
        fastClick: {
            intervalMs: state.fastClick.intervalMs,
            slots: { ...state.fastClick.slots }
        }
    });

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
        if (Number.isFinite(stored.fastClick?.intervalMs)) {
            state.fastClick.intervalMs = Math.max(100, Math.min(10000, stored.fastClick.intervalMs));
        }
        if (stored.fastClick?.slots && typeof stored.fastClick.slots === 'object') {
            Object.keys(state.fastClick.slots).forEach(slot => {
                if (typeof stored.fastClick.slots[slot] === 'boolean') {
                    state.fastClick.slots[slot] = stored.fastClick.slots[slot];
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

    const updateFastClickInterval = () => {
        if (fastClickIntervalId !== null) {
            clearInterval(fastClickIntervalId);
            fastClickIntervalId = null;
        }

        const enabledSlots = Object.keys(state.fastClick.slots)
            .filter(slot => state.fastClick.slots[slot]);
        if (enabledSlots.length === 0) return;

        fastClickIntervalId = setInterval(() => {
            enabledSlots.forEach(slotIndex => {
                const slot = getHotbarSlot(slotIndex);
                if (slot) slot.click();
            });
        }, state.fastClick.intervalMs);
    };

    const clickMenuButton = (key) => {
        const menu = config.menus[key];
        if (!menu) return false;
        const element = menu.id
            ? document.getElementById(menu.id)
            : document.querySelector(menu.selector);
        if (!element) {
            log(`Menu not found: ${menu.label}`);
            return false;
        }
        element.click();
        log(`Clicked menu: ${menu.label}`);
        return true;
    };

    const getShopBuyButtons = (potionType) => Array.from(
        document.querySelectorAll(config.shops.buyButton)
    ).filter(element => element.dataset.item === potionType);

    const buildShopPurchasePlan = (potionType, amount) => {
        const quantities = getShopBuyButtons(potionType)
            .map(element => parseInt(element.dataset.qty, 10))
            .filter(quantity => Number.isInteger(quantity) && quantity > 0)
            .sort((a, b) => b - a);
        const availableQuantities = [...new Set(quantities)];
        const plan = [];
        let remaining = amount;

        for (const quantity of availableQuantities) {
            const count = Math.floor(remaining / quantity);
            if (count > 0) plan.push({ quantity, count });
            remaining %= quantity;
        }

        return remaining === 0 ? plan : null;
    };

    const clickShopPurchase = (potionType, quantity) => {
        const button = getShopBuyButtons(potionType)
            .find(element => parseInt(element.dataset.qty, 10) === quantity);
        if (!button) {
            log(`Shop buy button not found: ${potionType} x${quantity}`);
            return false;
        }
        button.click();
        return true;
    };

    const returnToHunt = () => {
        if (!clickMenuButton('map')) {
            log('Cannot return to hunt: map menu could not be opened');
            return;
        }

        setTimeout(() => {
            const map = document.querySelector(`[data-map="${state.autohunt.map}"]`);
            if (!map) {
                log(`Hunt map not found: ${state.autohunt.map}`);
                return;
            }
            map.click();
            log(`Returning to hunt: ${state.autohunt.map}`);
        }, 500);
    };

    const checkAutopot = () => {
        if (!state.autopot.enabled) return;

        const hp = parseValue(document.getElementById(config.selectors.hp));
        const sp = parseValue(document.getElementById(config.selectors.sp));

        if (hp !== null && hp < state.autopot.hpThreshold) {
            const hotbarIndex = getHotbarIndexForPotion(state.settings.hpPotionType);
            const slot = hotbarIndex === null ? null : getHotbarSlot(hotbarIndex);
            if (slot) {
                slot.click();
                log(`Autopot HP: ${hp} < ${state.autopot.hpThreshold}, clicked slot ${hotbarIndex}`);
            }
        }

        if (sp !== null && sp < state.autopot.spThreshold) {
            const hotbarIndex = getHotbarIndexForPotion(state.settings.spPotionType);
            const slot = hotbarIndex === null ? null : getHotbarSlot(hotbarIndex);
            if (slot) {
                slot.click();
                log(`Autopot SP: ${sp} < ${state.autopot.spThreshold}, clicked slot ${hotbarIndex}`);
            }
        }
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
            if (!state.autorefiller.hpEnabled && !state.autorefiller.spEnabled) return;
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
                        state.autorefiller.phase = 'goToShop';
                    }
                }, randomDelay(REFILL_TIMING.preparationMs));
            }
            return;
        }

        if (phase === 'goToShop') {
            state.autorefiller.phase = 'openingTown';
            clickMenuButton('town');
            setTimeout(() => {
                if (state.autorefiller.phase !== 'openingTown') return;
                clickMenuButton('shop');
                state.autorefiller.phase = 'openingShop';
                setTimeout(() => {
                    if (state.autorefiller.phase !== 'openingShop') return;
                    state.autorefiller.phase = 'buying';
                    state.autorefiller.lastAction = Date.now();
                }, randomDelay(REFILL_TIMING.shopToBuyingMs));
            }, randomDelay(REFILL_TIMING.townToShopMs));
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
                    slot: getHotbarIndexForPotion(state.settings.hpPotionType),
                    maxToBuy: hpMaxToBuy
                },
                {
                    label: 'SP',
                    enabled: state.autorefiller.spEnabled,
                    potionType: state.settings.spPotionType,
                    qty: spQty,
                    slot: getHotbarIndexForPotion(state.settings.spPotionType),
                    maxToBuy: spMaxToBuy
                }
            ].filter(item => {
                const minQty = item.label === 'HP' ? hpMinToRefill : spMinToRefill;
                return item.enabled && item.slot !== null && item.qty !== null && item.qty < minQty;
            });
            const purchases = [];
            purchaseTargets = [];

            for (const item of requests) {
                const amount = Math.max(0, item.maxToBuy - item.qty);
                const plan = buildShopPurchasePlan(item.potionType, amount);
                if (plan === null) {
                    log(`Cannot exactly buy ${amount} ${item.label} potions (${item.potionType}); available buy quantities do not match`);
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
            const clickNextPurchase = () => {
                const purchase = purchases[purchaseIndex];
                if (!clickShopPurchase(purchase.potionType, purchase.quantity)) {
                    schedulePurchaseVerification();
                    return;
                }

                purchaseCount++;
                if (purchaseCount >= purchase.count) {
                    purchaseIndex++;
                    purchaseCount = 0;
                }
                if (purchaseIndex < purchases.length) {
                    setTimeout(clickNextPurchase, randomDelay(REFILL_TIMING.purchaseClickMs));
                    return;
                }
                schedulePurchaseVerification();
            };
            clickNextPurchase();
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

            state.autorefiller.phase = 'closingShop';
            const slotsToUse = quantitiesReady
                ? purchaseTargets
                    .map(target => getHotbarIndexForPotion(target.potionType))
                    .filter(slot => slot !== null)
                : [];
            purchaseTargets = [];
            clickMenuButton('shop');
            setTimeout(() => {
                if (state.autorefiller.phase !== 'closingShop') return;
                state.autorefiller.phase = 'returning';
                clickMenuButton('town');
                setTimeout(() => {
                    if (state.autorefiller.phase !== 'returning') return;
                    slotsToUse.forEach(slotIndex => {
                        const slot = getHotbarSlot(slotIndex);
                        if (slot) slot.click();
                    });
                    returnToHunt();
                    log('Refilling complete');
                    state.autorefiller.phase = 'idle';
                    state.autorefiller.lastAction = Date.now();
                }, randomDelay(REFILL_TIMING.townLoadMs));
            }, randomDelay(REFILL_TIMING.shopCloseMs));
        }
    };

    const check = () => {
        checkAutopot();
        checkAutorefiller();
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
            log('Larp Autopot v1.0 started');
        };
        boot();
    };

    const initialize = (buildUI) => {
        loadSettings(() => {
            updateFastClickInterval();
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
        updateFastClickInterval,
        saveSettings,
        restartInterval,
        initialize
    };
})(globalThis.LarpAutopot = globalThis.LarpAutopot || {});
