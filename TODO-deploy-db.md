ados# TODO - Correção do Deploy com Banco de Dados

## Problemas Identificados
- OfflineDB ainda usa localStorage para lastSync (linhas 10, 577, 596)
- syncWithCloud() usa localStorage.getItem('lastSync')
- Mapeamento incorreto no syncItem() - usa /storage em vez de /sync
- Métodos para 'consultas' obsoletos (substituído por 'agendamentos')
- Falta implementação de loadLastSync() e saveLastSync() no IndexedDB

## Correções Necessárias
- [x] Implementar loadLastSync() e saveLastSync() usando IndexedDB
- [x] Atualizar syncWithCloud() para usar rotas /sync
- [x] Remover todas as referências a localStorage
- [x] Corrigir mapeamento de tabelas no syncItem()
- [x] Remover métodos saveConsulta, updateConsulta, etc.
- [x] Atualizar getSyncStatus() para usar IndexedDB
- [ ] Testar sincronização bidirecional

## Plano de Implementação
1. Adicionar métodos loadLastSync() e saveLastSync() no IndexedDB
2. Atualizar syncWithCloud() para usar /sync/sync
3. Corrigir syncItem() para usar /sync em vez de /storage
4. Remover métodos obsoletos de consultas

## Status Atual
- [x] Criado novo offline-db.js com correções
- [x] Implementados métodos loadLastSync() e saveLastSync()
- [x] Atualizado syncWithCloud() para usar /sync/download
- [x] Corrigido syncItem() para usar /sync/upload
- [x] Removidos métodos de consultas obsoletos
- [x] Atualizado getSyncStatus() para usar IndexedDB
- [ ] Testar deploy com banco de dados
