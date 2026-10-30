(function (namespace) {
    'use strict';

    namespace.config = {
        selectors: {
            hp: 'hud-hp-text',
            sp: 'hud-sp-text',
            hotbar: 'hotbar'
        },
        menus: {
            town: { id: 'btn-town', label: 'Vila' },
            map: { selector: '[data-win="travel"]', label: 'Mapa' },
            shop: { selector: '[data-win="shop"]', label: 'Loja' }
        },
        shops: {
            buyButton: 'button[data-action="buy"]',
            potionTypes: {
                hp: ['potion-red', 'potion-red-2', 'potion-red-3', 'potion-red-4'],
                sp: ['potion-blue', 'potion-blue-2', 'potion-blue-3', 'potion-blue-4']
            }
        },
        maps: [
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
            'puffton'
        ]
    };
})(globalThis.LarpAutopot = globalThis.LarpAutopot || {});
