# TODO - Correção do Sistema de Banco de Dados Offline/Cloud

## Problemas Identificados
- Mistura de localStorage e IndexedDB causando inconsistência entre navegadores
- OfflineDB ainda usa localStorage para lastSync
- Mapeamento incorreto entre OfflineDB e rotas de sincronização
- Sincronização bidirecional não funciona corretamente
- Botão de sincronização não funciona

## Tarefas
- [x] Backend já usa tabelas específicas corretas
- [x] Rotas /sync funcionais implementadas
- [ ] Corrigir OfflineDB para usar IndexedDB para lastSync
- [ ] Atualizar syncWithCloud() para usar rotas /sync corretas
- [ ] Remover dependências de localStorage
- [ ] Corrigir mapeamento de tabelas no syncItem()
- [ ] Remover métodos obsoletos para 'consultas'
- [ ] Implementar sincronização bidirecional funcional
- [ ] Corrigir botão de sincronização no frontend
- [ ] Testar funcionamento offline e online
- [ ] Preparar para deploy (HTTPS recomendado)

## Status
- Em andamento - Correções no OfflineDB

## Plano de Correção Atualizado

### 1. Análise dos Arquivos
- **backend/db/index.js**: Tabelas específicas corretas ✓
- **backend/routes/storage.js**: Funciona com tabelas específicas ✓
- **backend/routes/sync.js**: Rotas de sincronização funcionais ✓
- **offline-db.js**: Classe IndexedDB com problemas de mapeamento ❌

### 2. Problemas Identificados no OfflineDB
- Ainda usa localStorage para lastSync (linhas 10, 577, 596)
- syncWithCloud() usa localStorage.getItem('lastSync')
- Mapeamento de tabelas incorreto no syncItem() - usa /storage em vez de /sync
- Métodos para 'consultas' obsoletos (substituído por 'agendamentos')
- Falta implementação de loadLastSync() e saveLastSync() no IndexedDB

### 3. Correções Necessárias
- Implementar loadLastSync() e saveLastSync() usando IndexedDB
- Atualizar syncWithCloud() para usar rotas /sync
- Remover todas as referências a localStorage
- Corrigir mapeamento de tabelas no syncItem()
- Remover métodos saveConsulta, updateConsulta, etc.
- Atualizar getSyncStatus() para usar IndexedDB
