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
  - HP: `potion-red` (Poção Vermelha), `potion-red-2` (Poção Vermelha Grande), `potion-red-3` (Poção Carmesim), `potion-red-4` (Elixir Rubro)
  - SP: `potion-blue` (Poção Azul), `potion-blue-2` (Poção Azul Grande), `potion-blue-3` (Poção Safira), `potion-blue-4` (Elixir de Mana)
- Botões de compra: `button[data-action="buy"]`, com `data-item` identificando a poção e `data-qty` indicando a quantidade comprada (1, 10 ou 100)
- Mapas: elementos com `data-map` (por exemplo, `clover_meadow`); o menu de viagem precisa ser aberto antes de selecionar o mapa

## Funcionalidades Implementadas

### 1. Autopot
- Monitora HP e SP via `MutationObserver` + `setInterval` (fallback)
- Default: HP < 250, SP < 50
- Ao cair abaixo do threshold, clica no slot em que o tipo de poção configurado foi detectado (não simula tecla — usa `.click()` no filho do `#hotbar`)

### 2. Autorefiller
- Lê a quantidade via `.qty` no slot detectado pelo tipo de poção selecionado
- Permite ativar/desativar a recarga de poções de HP e SP separadamente
- Exibe controles de mínimo, máximo e quantidade em seções independentes para HP e SP
- Só verifica, compra e usa o slot de uma poção quando o respectivo controle estiver ativado
- Limites mínimo e máximo de refill configuráveis independentemente para HP e SP
- Reutiliza os tipos de poção configurados em Settings
- Fluxo em fases (`idle → preparing → goToShop → openingTown → openingShop → buying → purchasing → settlingPurchases → verifyPurchase → closingShop → returning → idle`):
  1. Verifica quantidades; se abaixo do mínimo, aguarda de 0,8 a 1,6 s antes de iniciar a ida à loja
  2. Clica Vila uma vez, aguarda de 1,6 a 2,6 s, clica Loja e espera de 1 a 1,8 s para a interface carregar
  3. Calcula as compras necessárias com os valores de `data-qty` disponíveis, priorizando as maiores quantidades para reduzir cliques (ex.: comprar 190 poções usa 1x100 + 9x10)
  4. Clica nos botões de compra com intervalos variáveis de 0,7 a 1,4 s; depois espera de 1,2 a 2,2 s para a loja atualizar
  5. Confere se as quantidades chegaram ao máximo configurado (aguarda até 10 segundos)
  6. Clica Loja novamente para fechá-la → aguarda de 1 a 1,8 s → clica Vila uma vez
  7. Aguarda de 1,5 a 2,5 s para a Vila carregar, usa os slots configurados e abre o menu Mapa para selecionar o mapa configurado na aba Autohunt
- Cooldown entre ações: 3000ms

### 3. Autohunt
- Seleciona o mapa para retomar automaticamente a caça após o refiller
- Abre primeiro o menu `[data-win="travel"]` (Mapa) e, após ele abrir, clica no elemento `[data-map="<mapa selecionado>"]`
- Os mapas são exibidos em português: Campos do Trevo, Bosque dos Sussurros, Lagoa do Orvalho, Caverna Cintilante, Colina do Mel, Pântano da Névoa, Pico Gélido, Ruínas Submersas, Vulcão de Brasa, Torre Celeste, Jardim Lunar, Abismo Estelar, Santuário Cristalino, Profundezas de Coral, Planalto dos Trovões, Deserto de Ossos, Forja de Obsidiana, Geleira Eterna, Pântano do Espelho, Cidadela de Engrenagens, Bosque dos Sonhos, Coroa Solar e Núcleo da Origem

### 4. Settings
- Taxa de verificação: 200–1000 ms (default 500, com clamp)
- Seleciona o tipo de poção para HP e SP; o slot correspondente é detectado automaticamente na hotbar e exibido ao lado
- O Autopot e o Autorefiller usam o slot detectado para o tipo de poção selecionado
- Os nomes exibidos para as poções correspondem aos nomes apresentados na loja do jogo

### 5. Fastclick
- Permite ativar cliques repetidos independentemente para cada slot da hotbar de 1 a 9
- Usa os mesmos slots da hotbar do jogo que o Autopot
- Intervalo compartilhado e configurável de 100 a 10000 ms (default 500 ms)
- Cada slot habilitado recebe um clique por intervalo; os slots desabilitados não são tocados

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
- As opções são carregadas primeiro de `chrome.storage.local` antes da interface e da macro iniciarem, e também gravadas em `chrome.storage.sync`.
- Alterações são gravadas imediatamente em `chrome.storage.local` e sincronizadas com debounce para evitar excesso de gravações.
- Se não houver cópia local, configurações existentes em `chrome.storage.sync` são carregadas e migradas para o armazenamento local.
- Configurações antigas com controles ou limites compartilhados do Autorefiller são migradas automaticamente para HP e SP.
- Apenas configurações são persistidas; o estado temporário do fluxo de recarga começa em `idle` quando a página é carregada.
- Recarregue a extensão existente em `chrome://extensions/` mantendo o mesmo diretório e ID para preservar os dados locais. Remover e instalar como uma extensão diferente cria outro armazenamento.
- Se a leitura ou gravação falhar, o erro é registrado no console com o prefixo `[Larp Autopot]`.

## Como Instalar (para testes)
1. Manter a estrutura completa da extensão conforme a seção [Estrutura de Arquivos](#estrutura-de-arquivos)
2. Abrir `chrome://extensions/`
3. Ativar Modo do desenvolvedor
4. Clicar em Carregar sem compactação → selecionar a pasta
5. Acessar `https://www.cuteidleland.com/` → painel aparece à direita