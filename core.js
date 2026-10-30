(function (namespace) {
    'use strict';

    const config = namespace.config;
    if (!config) throw new Error('Larp Autopot config must load before core.js');

    const STORAGE_KEY = 'larpAutopotSettings';
    const SAVE_DEBOUNCE_MS = 750;
    const REFILL_TIMING = {
        shopOpenMs: 1000,
        purchaseClickMs: 200,
        quantityVerifyTimeoutMs: 10000,
        shopCloseMs: 1000,
        townLoadMs: 1000
    };

    const state = {
        autopot: {
            enabled: true,
            hpThreshold: 250,
            spThreshold: 50
        },
        autorefiller: {
            enabled: false,
            minToRefill: 10,
            maxToBuy: 50,
            phase: 'idle',
            lastAction: 0
        },
        settings: {
            checkMs: 500,
            hpHotbar: '1',
            spHotbar: '2',
            hpPotionType: 'potion-red',
            spPotionType: 'potion-blue'
        },
        autohunt: {
            map: 'clover_meadow'
        },
        observer: null,
        intervalId: null
    };
    let purchaseTargets = [];
    let purchaseVerificationStartedAt = 0;
    let saveSettingsTimeout = null;
    let settingsDirty = false;

    const log = (...args) => console.log('[Larp Autopot]', ...args);

    const getPersistedSettings = () => ({
        autopot: {
            enabled: state.autopot.enabled,
            hpThreshold: state.autopot.hpThreshold,
            spThreshold: state.autopot.spThreshold
        },
        autorefiller: {
            enabled: state.autorefiller.enabled,
            minToRefill: state.autorefiller.minToRefill,
            maxToBuy: state.autorefiller.maxToBuy
        },
        settings: {
            checkMs: state.settings.checkMs,
            hpHotbar: state.settings.hpHotbar,
            spHotbar: state.settings.spHotbar,
            hpPotionType: state.settings.hpPotionType,
            spPotionType: state.settings.spPotionType
        },
        autohunt: {
            map: state.autohunt.map
        }
    });

    const applyStoredSettings = (stored) => {
        if (!stored || typeof stored !== 'object') {
            log('Stored settings are invalid; using defaults');
            return;
        }

        if (typeof stored.autopot?.enabled === 'boolean') {
            state.autopot.enabled = stored.autopot.enabled;
        }
        if (Number.isFinite(stored.autopot?.hpThreshold) && stored.autopot.hpThreshold >= 0) {
            state.autopot.hpThreshold = stored.autopot.hpThreshold;
        }
        if (Number.isFinite(stored.autopot?.spThreshold) && stored.autopot.spThreshold >= 0) {
            state.autopot.spThreshold = stored.autopot.spThreshold;
        }

        if (typeof stored.autorefiller?.enabled === 'boolean') {
            state.autorefiller.enabled = stored.autorefiller.enabled;
        }
        if (Number.isFinite(stored.autorefiller?.minToRefill) && stored.autorefiller.minToRefill >= 0) {
            state.autorefiller.minToRefill = stored.autorefiller.minToRefill;
        }
        if (Number.isFinite(stored.autorefiller?.maxToBuy) && stored.autorefiller.maxToBuy >= 0) {
            state.autorefiller.maxToBuy = stored.autorefiller.maxToBuy;
        }

        if (Number.isFinite(stored.settings?.checkMs)) {
            state.settings.checkMs = Math.max(200, Math.min(1000, stored.settings.checkMs));
        }
        if (/^[1-9]$/.test(stored.settings?.hpHotbar)) {
            state.settings.hpHotbar = stored.settings.hpHotbar;
        }
        if (/^[1-9]$/.test(stored.settings?.spHotbar)) {
            state.settings.spHotbar = stored.settings.spHotbar;
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
    };

    const loadSettings = (onLoaded) => {
        const storage = globalThis.chrome?.storage?.sync;
        if (!storage) {
            log('chrome.storage.sync is unavailable; using default settings');
            onLoaded();
            return;
        }

        storage.get(STORAGE_KEY, result => {
            const error = globalThis.chrome.runtime.lastError;
            if (error) {
                log(`Could not load settings: ${error.message}`);
                onLoaded();
                return;
            }

            if (result[STORAGE_KEY] !== undefined) {
                applyStoredSettings(result[STORAGE_KEY]);
                log('Settings loaded from chrome.storage.sync');
            }
            onLoaded();
        });
    };

    const saveSettingsNow = () => {
        if (saveSettingsTimeout !== null) {
            clearTimeout(saveSettingsTimeout);
            saveSettingsTimeout = null;
        }
        if (!settingsDirty) return;

        const storage = globalThis.chrome?.storage?.sync;
        if (!storage) {
            log('chrome.storage.sync is unavailable; settings were not saved');
            return;
        }

        settingsDirty = false;
        storage.set({ [STORAGE_KEY]: getPersistedSettings() }, () => {
            const error = globalThis.chrome.runtime.lastError;
            if (error) {
                settingsDirty = true;
                log(`Could not save settings: ${error.message}`);
                return;
            }
            log('Settings saved to chrome.storage.sync');
        });
    };

    const saveSettings = () => {
        settingsDirty = true;
        if (saveSettingsTimeout !== null) clearTimeout(saveSettingsTimeout);
        saveSettingsTimeout = setTimeout(saveSettingsNow, SAVE_DEBOUNCE_MS);
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

    const getPotionQty = (index) => {
        const slot = getHotbarSlot(index);
        const quantityElement = slot && slot.querySelector('.qty');
        if (!quantityElement) return null;
        const quantity = parseInt(quantityElement.textContent, 10);
        return Number.isNaN(quantity) ? null : quantity;
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
            const slot = getHotbarSlot(state.settings.hpHotbar);
            if (slot) {
                slot.click();
                log(`Autopot HP: ${hp} < ${state.autopot.hpThreshold}, clicked slot ${state.settings.hpHotbar}`);
            }
        }

        if (sp !== null && sp < state.autopot.spThreshold) {
            const slot = getHotbarSlot(state.settings.spHotbar);
            if (slot) {
                slot.click();
                log(`Autopot SP: ${sp} < ${state.autopot.spThreshold}, clicked slot ${state.settings.spHotbar}`);
            }
        }
    };

    const checkAutorefiller = () => {
        if (!state.autorefiller.enabled) return;

        const now = Date.now();
        const { phase, minToRefill, maxToBuy } = state.autorefiller;

        if (phase === 'idle') {
            if (now - state.autorefiller.lastAction < 3000) return;

            const hpQty = getPotionQty(state.settings.hpHotbar);
            const spQty = getPotionQty(state.settings.spHotbar);
            const needHp = hpQty !== null && hpQty < minToRefill;
            const needSp = spQty !== null && spQty < minToRefill;

            if (needHp || needSp) {
                log(`Refill needed - HP: ${hpQty} (min ${minToRefill}), SP: ${spQty} (min ${minToRefill})`);
                state.autorefiller.phase = 'goToShop';
                state.autorefiller.lastAction = now;
            }
            return;
        }

        if (phase === 'goToShop') {
            state.autorefiller.phase = 'openingShop';
            clickMenuButton('town');
            setTimeout(() => {
                clickMenuButton('shop');
                state.autorefiller.phase = 'buying';
                state.autorefiller.lastAction = Date.now();
            }, REFILL_TIMING.shopOpenMs);
            return;
        }

        if (phase === 'buying') {
            const hpQty = getPotionQty(state.settings.hpHotbar);
            const spQty = getPotionQty(state.settings.spHotbar);
            const requests = [
                { label: 'HP', potionType: state.settings.hpPotionType, qty: hpQty },
                { label: 'SP', potionType: state.settings.spPotionType, qty: spQty }
            ].filter(item => item.qty !== null && item.qty < minToRefill);
            const purchases = [];

            for (const item of requests) {
                const amount = Math.max(0, maxToBuy - item.qty);
                const plan = buildShopPurchasePlan(item.potionType, amount);
                if (plan === null) {
                    log(`Cannot exactly buy ${amount} ${item.label} potions (${item.potionType}); available buy quantities do not match`);
                    purchaseTargets = [];
                    purchaseVerificationStartedAt = Date.now();
                    state.autorefiller.phase = 'verifyPurchase';
                    return;
                }

                purchaseTargets.push({
                    label: item.label,
                    slot: item.label === 'HP' ? state.settings.hpHotbar : state.settings.spHotbar,
                    quantity: maxToBuy
                });
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
                purchaseVerificationStartedAt = Date.now();
                state.autorefiller.phase = 'verifyPurchase';
                return;
            }

            state.autorefiller.phase = 'purchasing';
            let purchaseIndex = 0;
            let purchaseCount = 0;
            const clickNextPurchase = () => {
                const purchase = purchases[purchaseIndex];
                if (!clickShopPurchase(purchase.potionType, purchase.quantity)) {
                    purchaseVerificationStartedAt = Date.now();
                    state.autorefiller.phase = 'verifyPurchase';
                    return;
                }

                purchaseCount++;
                if (purchaseCount >= purchase.count) {
                    purchaseIndex++;
                    purchaseCount = 0;
                }
                if (purchaseIndex < purchases.length) {
                    setTimeout(clickNextPurchase, REFILL_TIMING.purchaseClickMs);
                    return;
                }
                purchaseVerificationStartedAt = Date.now();
                state.autorefiller.phase = 'verifyPurchase';
            };
            clickNextPurchase();
            return;
        }

        if (phase === 'verifyPurchase') {
            const quantitiesReady = purchaseTargets.every(target => {
                const quantity = getPotionQty(target.slot);
                return quantity !== null && quantity >= target.quantity;
            });
            const verificationExpired = now - purchaseVerificationStartedAt >= REFILL_TIMING.quantityVerifyTimeoutMs;

            if (!quantitiesReady && !verificationExpired) return;
            if (!quantitiesReady) {
                const remaining = purchaseTargets
                    .filter(target => {
                        const quantity = getPotionQty(target.slot);
                        return quantity === null || quantity < target.quantity;
                    })
                    .map(target => {
                        const quantity = getPotionQty(target.slot);
                        return `${target.label}: ${quantity ?? '?'} / ${target.quantity}`;
                    });
                log(`Refill quantity check timed out (${remaining.join(', ')})`);
            } else {
                log('Refill quantities verified');
            }

            state.autorefiller.phase = 'closingShop';
            purchaseTargets = [];
            clickMenuButton('shop');
            setTimeout(() => {
                state.autorefiller.phase = 'returning';
                clickMenuButton('town');
                setTimeout(() => {
                    const hpSlot = getHotbarSlot(state.settings.hpHotbar);
                    const spSlot = getHotbarSlot(state.settings.spHotbar);
                    if (hpSlot) hpSlot.click();
                    if (spSlot) spSlot.click();
                    returnToHunt();
                    log('Refilling complete');
                    state.autorefiller.phase = 'idle';
                    state.autorefiller.lastAction = Date.now();
                }, REFILL_TIMING.townLoadMs);
            }, REFILL_TIMING.shopCloseMs);
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
        loadSettings(() => start(buildUI));
    };

    namespace.core = {
        state,
        config,
        parseValue,
        getHotbarSlots,
        getPotionQty,
        saveSettings,
        restartInterval,
        initialize
    };
})(globalThis.LarpAutopot = globalThis.LarpAutopot || {});
