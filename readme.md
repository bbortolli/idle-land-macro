# Larp Automate V2

## Objetivo
Extensão Chrome (Manifest V3) para automatizar poções, reposição e retorno à caça em `https://www.cuteidleland.com/`.

## Estrutura de Arquivos
```
larp-automate-v2/
├── manifest.json
├── content.js          # Inicialização da extensão
├── ws-bridge.js        # Relay seguro para a API WebSocket do jogo
├── config/
│   └── game.js         # Poções, quantidades de compra e mapas
├── core.js             # Estado, autopot, refiller e ações de jogo
└── ui/
    ├── panel.js        # Painel, abas e eventos da interface
    └── panel.css       # Tema escuro e dourado inspirado no jogo
```

## manifest.json (atual)
```json
{
  "manifest_version": 3,
  "name": "Larp Automate V2",
  "version": "2.0.0",
  "description": "Automação de poções e caça para Cute Idle Land",
  "minimum_chrome_version": "111",
  "permissions": ["storage"],
  "host_permissions": ["https://www.cuteidleland.com/*"],
  "content_scripts": [
    {
      "matches": ["https://www.cuteidleland.com/*"],
      "js": ["ws-bridge.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://www.cuteidleland.com/*"],
      "css": ["ui/panel.css"],
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

## Dados Conhecidos do WebSocket
- O relay observa mensagens `state`/`sync` recebidas por `window.fv.net.ws`.
- HP, SP, mapa e experiência são lidos do objeto `player` enviado pelo jogo.
- O inventário é atualizado quando `player.inventory` está disponível. Cada entrada de poção conhecida é filtrada pelos tipos configurados e encaminhada com `item`, `uid` e `qty`.
- A hotbar ainda é usada para descobrir skills automáticas, mas não para ler quantidade ou usar poções.
- Itens da loja (`data-item`):
  - HP: `potion-red` (Poção Vermelha), `potion-red-2` (Poção Vermelha Grande), `potion-red-3` (Poção Carmesim), `potion-red-4` (Elixir Rubro)
  - SP: `potion-blue` (Poção Azul), `potion-blue-2` (Poção Azul Grande), `potion-blue-3` (Poção Safira), `potion-blue-4` (Elixir de Mana)
- Tipos de compra: mensagens WebSocket `buy` com quantidade 1, 10 ou 100
- Mapas: mensagens WebSocket `setMap`; `puffton` é a Vila, não uma opção de caça
- WebSocket exposto pelo jogo: `window.fv.net.ws`

## Funcionalidades Implementadas

### 1. Autopot
- Monitora HP e SP recebidos por WebSocket, usando a verificação periódica configurada
- Default: HP < 250, SP < 50
- Ao cair abaixo do threshold, envia `useItem` pela conexão WebSocket do jogo
- O UID é localizado dinamicamente no inventário recebido do jogo; não há UIDs fixos nem busca no DOM

### 2. Autorefiller
- Lê a quantidade somando as entradas do tipo de poção selecionado no inventário recebido por WebSocket
- Permite ativar/desativar a recarga de poções de HP e SP separadamente
- Exibe controles de mínimo, máximo e quantidade em seções independentes para HP e SP
- Só verifica e compra uma poção quando o respectivo controle estiver ativado
- Limites mínimo e máximo de refill configuráveis independentemente para HP e SP
- Reutiliza os tipos de poção configurados em Settings
- Faz compras diretamente pelo WebSocket, sem precisar abrir Vila ou Loja
- Fluxo em fases (`idle → preparing → buying → purchasing → settlingPurchases → verifyPurchase → returning → idle`):
  1. Verifica quantidades; se abaixo do mínimo, aguarda de 0,8 a 1,6 s antes de iniciar a reposição
  2. Calcula as quantidades 1, 10 e 100 para reduzir mensagens (ex.: 190 usa 1×100 + 9×10)
  3. Envia cada compra com intervalo variável de 0,7 a 1,4 s; depois aguarda de 1,2 a 2,2 s
  4. Confere se as quantidades chegaram ao máximo configurado (aguarda até 10 segundos)
  5. Retorna ao mapa configurado usando `setMap`
- Cooldown entre ações: 3000ms

### 3. Autohunt
- Seleciona o mapa para retomar automaticamente a caça após o refiller
- Opção para voltar ao mapa selecionado caso o personagem saia dele
- A verificação acontece a cada 10 segundos, somente com o fluxo de recarga ocioso e sem outra troca de mapa pendente
- Viaja diretamente com `setMap`; `puffton` não aparece na lista por ser a Vila
- Os mapas são exibidos em português: Campos do Trevo, Bosque dos Sussurros, Lagoa do Orvalho, Caverna Cintilante, Colina do Mel, Pântano da Névoa, Pico Gélido, Ruínas Submersas, Vulcão de Brasa, Torre Celeste, Jardim Lunar, Abismo Estelar, Santuário Cristalino, Profundezas de Coral, Planalto dos Trovões, Deserto de Ossos, Forja de Obsidiana, Geleira Eterna, Pântano do Espelho, Cidadela de Engrenagens, Bosque dos Sonhos, Coroa Solar e Núcleo da Origem

### 4. Settings
- Taxa de verificação: 200–1000 ms (padrão 500, com limite automático)
- Seleciona o tipo de poção para HP e SP na aba Poções; o Autopot usa o WebSocket e não depende da hotbar
- O Autorefiller usa `player.inventory` recebido no estado do jogo para localizar os UIDs e as quantidades das poções
- Os nomes exibidos para as poções correspondem aos nomes apresentados na loja do jogo

### 5. Personagem e métricas
- Recebe os estados `state`/`sync` do WebSocket para exibir nome, classe e níveis do personagem
- Exibe XP/Hora calculada pela variação de `player.baseExp` em janelas de pelo menos 3 segundos; mostra a média móvel das últimas seis amostras
- Contador de tempo desde o início/reset da seção e botão para zerar as métricas

### 6. Logs
- Exibe os tipos das mensagens WebSocket enviadas e recebidas, sem guardar ou exibir o conteúdo completo
- Exemplo: `ENVIADO - cast` e `RECEBIDO - Sync`
- Mantém no máximo 100 eventos em memória e permite limpar a lista

### 7. Fastkill
- Lista skills aprendidas e marcadas como automáticas em `player.settings.hotbar`
- Permite selecionar skills para uso repetido e configurar o intervalo de 100 a 10000 ms
- Envia ações WebSocket como `{"type":"cast","skill":"backstab"}` e `{"type":"cast","skill":"shadow_step"}`

## Detalhes Técnicos Importantes
- O painel usa as cores, fontes e molduras escuras/douradas observadas na página do jogo (Barlow, Cinzel, azul-marinho e dourado)
- UI fixa à direita: painel `#larp-automate-v2-panel` com `z-index: 2147483647`
- Ações de poção e refill usam estado e comandos WebSocket, sem consultar ou clicar em elementos do HUD, hotbar ou loja
- Clamp de valores: rate forçado entre 200–1000ms mesmo se usuário digitar fora
- A extensão usa um relay no mundo principal (`ws-bridge.js`) porque o content script isolado não acessa `window.fv`
- O relay valida ações e envia JSON por `window.fv.net.ws`; `useItem` usa o UID atualizado a partir do inventário filtrado
- O relay observa mensagens WebSocket do jogo, encaminhando dados de personagem, HP/SP e inventário filtrado, além do tipo de cada mensagem nos logs
- A interface mostra se a conexão WebSocket está disponível; as ações falham com mensagem no console se o jogo não estiver conectado ou o item não estiver no inventário
- `config/game.js` centraliza os tipos de poção, quantidades de compra e mapas
- Os scripts do content script são declarados no `manifest.json`; o relay roda no mundo principal desde `document_start`
- Logs com prefixo `[Larp Automate V2]`

## Persistência das Configurações
- As opções são gravadas imediatamente em uma chave própria do `localStorage` do site, além de `chrome.storage.local`; também são sincronizadas com debounce para `chrome.storage.sync`.
- Na inicialização, as cópias disponíveis são comparadas pela data de atualização e a mais recente é carregada.
- O `localStorage` do site permite recuperar as configurações após remover e recriar a extensão, mesmo quando a nova instalação recebe outro ID e não consegue acessar o armazenamento associado ao ID anterior.
- Registros antigos sem versão são migrados e, se existirem nos dois locais, combinados por seção para preservar campos que estejam faltando em uma das cópias.
- Configurações antigas com controles ou limites compartilhados do Autorefiller são migradas automaticamente para HP e SP.
- Apenas configurações são persistidas; o estado temporário do fluxo de recarga começa em `idle` quando a página é carregada.
- As configurações do site permanecem no mesmo perfil/navegador e domínio do jogo. O `chrome.storage.sync` continua vinculado ao ID da extensão; para sincronizar entre dispositivos, use o mesmo ID e uma conta Chrome sincronizada.
- A chave interna de armazenamento permanece `larpAutopotSettings` para preservar as configurações já salvas na V1.
- Se a leitura ou gravação falhar, o erro é registrado no console com o prefixo `[Larp Automate V2]`.

## Como Instalar (para testes)
1. Manter a estrutura completa da extensão conforme a seção [Estrutura de Arquivos](#estrutura-de-arquivos)
2. Abrir `chrome://extensions/`
3. Ativar Modo do desenvolvedor
4. Clicar em Carregar sem compactação → selecionar a pasta
5. Acessar `https://www.cuteidleland.com/` → painel aparece à direita