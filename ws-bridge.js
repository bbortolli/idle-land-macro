(function () {
    'use strict';

    const CHANNEL = 'larp-automate-v2';
    const POTIONS = new Set([
        'potion-red',
        'potion-red-2',
        'potion-red-3',
        'potion-red-4',
        'potion-blue',
        'potion-blue-2',
        'potion-blue-3',
        'potion-blue-4'
    ]);
    const MAPS = new Set([
        'clover_meadow',
        'whisper_woods',
        'dewdrop_pond',
        'glimmer_cave',
        'honeyhill_farm',
        'mistmoor_swamp',
        'frostpeak',
        'sunken_ruins',
        'ember_volcano',
        'skyreach_spire',
        'lunar_garden',
        'starfall_abyss',
        'crystal_sanctum',
        'coral_depths',
        'thunder_plateau',
        'bone_desert',
        'obsidian_forge',
        'eternal_glacier',
        'mirror_marsh',
        'clockwork_citadel',
        'dream_grove',
        'solar_crown',
        'origin_core',
        'puffton'
    ]);
    const monitoredSockets = new WeakSet();

    const publish = (type, details) => {
        window.postMessage({
            channel: CHANNEL,
            type,
            ...details
        }, location.origin);
    };

    const getMessageType = (data) => {
        if (typeof data !== 'string') return 'Mensagem';
        try {
            const message = JSON.parse(data);
            return typeof message?.type === 'string' ? message.type : 'Mensagem';
        } catch (error) {
            return 'Mensagem';
        }
    };

    const publishPlayerState = (message) => {
        if (!message || !['state', 'sync'].includes(message.type) ||
            !message.player || typeof message.player !== 'object') return;

        const player = message.player;
        const skills = {};
        if (player.skills && typeof player.skills === 'object') {
            Object.entries(player.skills).forEach(([skill, level]) => {
                if (/^[a-z0-9_-]+$/i.test(skill) && Number.isFinite(level)) {
                    skills[skill] = level;
                }
            });
        }

        const hotbar = Array.isArray(player.settings?.hotbar)
            ? player.settings.hotbar.slice(0, 9).map(slot => ({
                skill: typeof slot?.skill === 'string' ? slot.skill : null,
                item: typeof slot?.item === 'string' ? slot.item : null,
                auto: slot?.auto === true
            }))
            : [];
        publish('game-state', {
            player: {
                name: typeof player.name === 'string' ? player.name.slice(0, 80) : '',
                job: typeof player.job === 'string' ? player.job.slice(0, 80) : '',
                map: typeof player.map === 'string' ? player.map.slice(0, 80) : '',
                baseLevel: Number.isFinite(player.baseLevel) ? player.baseLevel : null,
                jobLevel: Number.isFinite(player.jobLevel) ? player.jobLevel : null,
                baseExp: Number.isFinite(player.baseExp) ? player.baseExp : null,
                skills,
                hotbar
            }
        });
    };

    const monitorSocket = (socket) => {
        if (!socket || monitoredSockets.has(socket)) return;
        if (typeof socket.addEventListener !== 'function' || typeof socket.send !== 'function') return;

        socket.addEventListener('message', event => {
            const messageType = getMessageType(event.data);
            publish('websocket-log', { direction: 'RECEBIDO', messageType });
            if (typeof event.data !== 'string') return;
            try {
                publishPlayerState(JSON.parse(event.data));
            } catch (error) {
                return;
            }
        });

        const originalSend = socket.send;
        try {
            socket.send = function (data) {
                const result = originalSend.call(this, data);
                publish('websocket-log', {
                    direction: 'ENVIADO',
                    messageType: getMessageType(data)
                });
                return result;
            };
        } catch (error) {
            console.error('[Larp Automate V2] Could not intercept WebSocket sends', error);
        }
        monitoredSockets.add(socket);
    };

    const respond = (requestId, ok, error = null) => {
        window.postMessage({
            channel: CHANNEL,
            type: 'response',
            requestId,
            ok,
            error
        }, location.origin);
    };

    const getSocket = () => {
        const socket = window.fv?.net?.ws;
        monitorSocket(socket);
        return socket;
    };

    setInterval(() => monitorSocket(window.fv?.net?.ws), 500);

    const makeMessage = (action) => {
        if (!action || typeof action !== 'object') return null;

        if (action.type === 'useItem' && typeof action.item === 'string' &&
            /^[a-z0-9_-]+$/i.test(action.item)) {
            const inventory = window.fv?.ui?.inventory;
            if (!Array.isArray(inventory)) return { error: 'inventory-not-ready' };
            const item = inventory.find(entry => entry.item === action.item);
            if (!item?.uid) return { error: `item-not-owned:${action.item}` };
            return { message: { type: 'useItem', uid: item.uid } };
        }

        if (action.type === 'buy' && POTIONS.has(action.item) &&
            [1, 10, 100].includes(action.qty)) {
            return {
                message: {
                    type: 'buy',
                    item: action.item,
                    qty: action.qty
                }
            };
        }

        if (action.type === 'setMap' && MAPS.has(action.map)) {
            return { message: { type: 'setMap', map: action.map } };
        }

        if (action.type === 'cast' && typeof action.skill === 'string' &&
            /^[a-z0-9_-]+$/i.test(action.skill)) {
            return { message: { type: 'cast', skill: action.skill } };
        }

        return null;
    };

    window.addEventListener('message', event => {
        const request = event.data;
        if (event.source !== window || request?.channel !== CHANNEL ||
            request.type !== 'request' || typeof request.requestId !== 'string') {
            return;
        }

        if (request.action?.type === 'status') {
            const socket = getSocket();
            const online = Boolean(socket && socket.readyState === WebSocket.OPEN);
            respond(request.requestId, online, online ? null : 'socket-not-open');
            return;
        }

        const socket = getSocket();
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            respond(request.requestId, false, 'socket-not-open');
            return;
        }

        const result = makeMessage(request.action);
        if (!result) {
            respond(request.requestId, false, 'invalid-action');
            return;
        }
        if (result.error) {
            respond(request.requestId, false, result.error);
            return;
        }

        try {
            socket.send(JSON.stringify(result.message));
            respond(request.requestId, true);
        } catch (error) {
            respond(request.requestId, false, `send-failed:${error.message}`);
        }
    });
})();
