# Norty Car — Visualizador 3D de veículos

O componente `apps/car-web/src/components/viewer3d/Vehicle3DViewer.tsx` é usado no catálogo
interno, no site público e no portal. Ele **não inventa modelos**: sem um arquivo `.glb` real,
mostra a galeria de fotos do modelo.

## Como funciona

1. Se o modelo de catálogo tiver um arquivo 3D (`VehicleModel.model3dFileId`) e o aparelho
   tiver WebGL, o Three.js é carregado sob demanda (pedaço `three` do build) e o `.glb` é
   aberto com `GLTFLoader`.
2. O modelo é centralizado e a câmera se afasta conforme o tamanho (enquadramento automático).
3. Arrastar gira 360°, rolar ou fazer pinça aproxima; há botões para pausar a rotação e voltar
   ao enquadramento inicial. No celular, o toque funciona do mesmo jeito.
4. Sem WebGL, sem arquivo ou com falha no download, cai para a galeria (carrossel acessível por
   teclado). Configuração sem unidade livre aparece dessaturada, com o selo **Indisponível**.

## Subir o arquivo de um modelo

1. **Frota › Modelos › (modelo) › Arquivo 3D**: envie o `.glb` (o servidor confere a assinatura
   binária `glTF`; outros formatos são recusados). Limite padrão: 15 MB (`UPLOAD_MAX_MB`).
2. O arquivo fica no armazenamento da empresa (categoria `model3d`) e o modelo passa a apontar
   para ele. Todas as unidades daquele modelo compartilham o mesmo arquivo.

## Requisitos do arquivo

- Formato **glTF binário (.glb)**, escala em metros, eixo Y para cima, frente do carro para +Z.
- Até ~100 mil triângulos e texturas de até 2048 px para abrir bem em celulares. Compressão
  Draco/Meshopt **não** está habilitada no carregador hoje.
- **Troca de cor:** os materiais da pintura devem ter no nome uma destas palavras:
  `body`, `paint`, `carroceria`, `pintura` ou `lataria`. O visualizador altera só esses
  materiais quando recebe `colorHex`; sem eles, a cor exibida é a do arquivo.
- Direitos de uso: use apenas arquivos que a locadora tem licença para publicar. Não use
  ativos de montadoras ou de outras locadoras sem autorização.

## Pontos de interesse

Cadastre em `VehicleModel.hotspots` (JSON) uma lista:

```json
[{ "key": "porta-malas", "label": "Porta-malas", "description": "520 litros", "position": [0, 0.9, -2.1] }]
```

`position` é a coordenada no espaço do modelo (metros). Cada ponto vira um botão HTML
acessível sobre a cena; ao tocar, mostra rótulo e descrição.

## Interface do componente

```ts
<Vehicle3DViewer
  title="Fiat Cronos"
  modelUrl={urlDoGlb}          // opcional; sem ele, fotos
  photos={[url1, url2]}
  hotspots={[...]}
  colorHex="#C0C0C0"           // opcional
  unavailable={false}
  height={380}
/>
```
