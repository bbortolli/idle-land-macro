# Resumo do Projeto: Larp Autopot (Extensão Chrome)

## Objetivo
Extensão Chrome (Manifest V3) que funciona **apenas** em `https://www.cuteidleland.com/` para automatizar o uso de poções (Autopot) e a compra/recarga de poções (Autorefiller) em um jogo idle.

## Estrutura de Arquivos
```
larp-autopot/
├── manifest.json
├── content.js          # Inicialização da extensão
├── config/
│   └── game.js         # Seletores, menus, loja, poções e mapas do jogo
├── core.js             # Estado, autopot, refiller e ações de jogo
└── ui/
    └── panel.js        # Painel, abas e eventos da interface
```

## manifest.json (atual)
```json
{
  "manifest_version": 3,
  "name": "Larp Autopot",
  "version": "1.0",
  "description": "Autopot e Autorefiller para Cute Idle Land",
  "permissions": ["storage"],
  "host_permissions": ["https://www.cuteidleland.com/*"],
  "content_scripts": [
    {
      "matches": ["https://www.cuteidleland.com/*"],
      "js": [
        "config/game.js",
        "core.js",
        "ui/panel.js",
        "content.js"
      ],
      "run_at": "document_idle"
    }
  ]
}
```

## Seletores e Elementos Conhecidos
- HP HUD: `#hud-hp-text` → texto tipo `"Vida 930 / 1008"` → valor antes da `/`
- SP HUD: `#hud-sp-text` → mesmo formato
- Hotbar: `#hotbar` → filhos são os slots (índice 0 = slot "1")
- Quantidade de poção no slot: filho com classe `.qty`
- Botões de menu (configurados em `config/game.js`, dentro de `menus`):
  - Vila: `id="btn-town"`
  - Mapa: `[data-win="travel"]`
  - Loja: `[data-win="shop"]`
- Itens da loja (`data-item`):
  - HP: `potion-red`, `potion-red-2`, `potion-red-3`, `potion-red-4`
  - SP: `potion-blue`, `potion-blue-2`, `potion-blue-3`, `potion-blue-4`
- Botões de compra: `button[data-action="buy"]`, com `data-item` identificando a poção e `data-qty` indicando a quantidade comprada (1, 10 ou 100)
- Mapas: elementos com `data-map` (por exemplo, `clover_meadow`); o menu de viagem precisa ser aberto antes de selecionar o mapa

## Funcionalidades Implementadas

### 1. Autopot
- Monitora HP e SP via `MutationObserver` + `setInterval` (fallback)
- Default: HP < 250, SP < 50
- Ao cair abaixo do threshold, clica no slot configurado em Settings (não simula tecla — usa `.click()` no filho do `#hotbar`)
- Slots default em Settings: HP = 1, SP = 2

### 2. Autorefiller
- Lê quantidade via `.qty` no slot da hotbar
- Permite ativar/desativar a recarga de poções de HP e SP separadamente
- Só verifica, compra e usa o slot de uma poção quando o respectivo controle estiver ativado
- Configurável: mínimo para recarregar e máximo para comprar
- Reutiliza os tipos de poção e slots configurados em Settings
- Fluxo em fases (`idle → goToShop → openingShop → buying → purchasing → verifyPurchase → closingShop → returning → idle`):
  1. Verifica quantidades; se abaixo do mínimo → vai para loja
  2. Clica Vila uma vez → aguarda → clica Loja
  3. Calcula as compras necessárias com os valores de `data-qty` disponíveis, priorizando as maiores quantidades para reduzir cliques (ex.: comprar 190 poções usa 1x100 + 9x10)
  4. Clica nos botões de compra com 200ms entre cada clique
  5. Confere se as quantidades chegaram ao máximo configurado (aguarda até 10 segundos)
  6. Clica Loja novamente para fechá-la → aguarda 1 segundo → clica Vila uma vez
  7. Aguarda a Vila carregar, usa os slots configurados e abre o menu Mapa para selecionar o mapa configurado na aba Autohunt
- Cooldown entre ações: 3000ms

### 3. Autohunt
- Seleciona o mapa para retomar automaticamente a caça após o refiller
- Abre primeiro o menu `[data-win="travel"]` (Mapa) e, após ele abrir, clica no elemento `[data-map="<mapa selecionado>"]`
- Mapas disponíveis: `clover_meadow`, `whisper_woods`, `dewdrop_pond`, `glimmer_cave`, `honeyhill_farm`, `mistmoor_swamp`, `frostpeak`, `sunken_ruins`, `ember_volcano`, `skyreach_spire`, `lunar_garden`, `starfall_abyss`, `crystal_sanctum`, `coral_depths`, `thunder_plateau`, `bone_desert`, `obsidian_forge`, `eternal_glacier`, `mirror_marsh`, `clockwork_citadel`, `dream_grove`, `solar_crown`, `origin_core` e `puffton`

### 4. Settings
- Taxa de verificação: 200–1000 ms (default 500, com clamp)
- Slot da hotbar e tipo de poção para HP e SP, configurados somente nesta seção
- O Autopot e o Autorefiller usam os slots definidos aqui; o Autorefiller também usa os tipos de poção definidos aqui
- Dropdowns de hotbar auto-sincronizam via `MutationObserver` no `#hotbar`

## Detalhes Técnicos Importantes
- Sem simulação de teclado — cliques diretos nos elementos evitam problemas de `isTrusted` em jogos canvas
- UI fixa à direita: painel `#larp-autopot-panel` com `z-index: 2147483647`
- Dupla verificação: `MutationObserver` (reage na hora) + `setInterval` (fallback, taxa configurável)
- Clamp de valores: rate forçado entre 200–1000ms mesmo se usuário digitar fora
- `config/game.js` centraliza os seletores do jogo, menus, itens de loja, tipos de poção e mapas
- Os scripts de conteúdo são carregados na ordem configurada no `manifest.json`: configuração → lógica → interface → inicialização
- Logs com prefixo `[Larp Autopot]`
- Para adicionar um botão de menu, edite `menus` em `config/game.js`:

```javascript
menus: {
    town: { id: 'btn-town', label: 'Vila' },
    map:  { selector: '[data-win="travel"]', label: 'Mapa' },
    shop: { selector: '[data-win="shop"]',   label: 'Loja' },
    // bank: { selector: '[data-win="bank"]', label: 'Banco' }
}
```

## Persistência das Configurações
- As opções de Autopot, Autorefiller (incluindo os controles separados de HP e SP), Autohunt e Settings são carregadas de `chrome.storage.sync` antes da interface e da macro iniciarem.
- Alterações são salvas automaticamente, com debounce para evitar excesso de gravações durante a digitação.
- Configurações antigas com um único controle do Autorefiller são migradas automaticamente para os controles de HP e SP.
- Apenas configurações são persistidas; o estado temporário do fluxo de recarga começa em `idle` quando a página é carregada.
- Se a leitura ou gravação falhar, o erro é registrado no console com o prefixo `[Larp Autopot]`.

## Como Instalar (para testes)
1. Manter a estrutura completa da extensão conforme a seção [Estrutura de Arquivos](#estrutura-de-arquivos)
2. Abrir `chrome://extensions/`
3. Ativar Modo do desenvolvedor
4. Clicar em Carregar sem compactação → selecionar a pasta
5. Acessar `https://www.cuteidleland.com/` → painel aparece à direita