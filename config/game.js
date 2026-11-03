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
            },
            potionNames: {
                'potion-red': 'Poção Vermelha',
                'potion-red-2': 'Poção Vermelha Grande',
                'potion-red-3': 'Poção Carmesim',
                'potion-red-4': 'Elixir Rubro',
                'potion-blue': 'Poção Azul',
                'potion-blue-2': 'Poção Azul Grande',
                'potion-blue-3': 'Poção Safira',
                'potion-blue-4': 'Elixir de Mana'
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
            'coral_depths',
            'thunder_plateau',
            'bone_desert',
            'obsidian_forge',
            'eternal_glacier',
            'mirror_marsh',
            'clockwork_citadel',
            'dream_grove',
            'solar_crown',
            'origin_core'
        ],
        mapNames: {
            clover_meadow: 'Campos do Trevo',
            whisper_woods: 'Bosque dos Sussurros',
            dewdrop_pond: 'Lagoa do Orvalho',
            glimmer_cave: 'Caverna Cintilante',
            honeyhill_farm: 'Colina do Mel',
            mistmoor_swamp: 'Pântano da Névoa',
            frostpeak: 'Pico Gélido',
            sunken_ruins: 'Ruínas Submersas',
            ember_volcano: 'Vulcão de Brasa',
            skyreach_spire: 'Torre Celeste',
            lunar_garden: 'Jardim Lunar',
            starfall_abyss: 'Abismo Estelar',
            crystal_sanctum: 'Santuário Cristalino',
            coral_depths: 'Profundezas de Coral',
            thunder_plateau: 'Planalto dos Trovões',
            bone_desert: 'Deserto de Ossos',
            obsidian_forge: 'Forja de Obsidiana',
            eternal_glacier: 'Geleira Eterna',
            mirror_marsh: 'Pântano do Espelho',
            clockwork_citadel: 'Cidadela de Engrenagens',
            dream_grove: 'Bosque dos Sonhos',
            solar_crown: 'Coroa Solar',
            origin_core: 'Núcleo da Origem'
        }
    };
})(globalThis.LarpAutopot = globalThis.LarpAutopot || {});
