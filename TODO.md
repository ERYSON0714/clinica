# TODO - Correção do Sistema de Banco de Dados Offline/Cloud

## Problemas Identificados
- Mistura de localStorage e IndexedDB causando inconsistência entre navegadores
- Backend usa tabela genérica client_storage em vez de tabelas específicas
- Mapeamento incorreto entre OfflineDB e rotas de sincronização
- Sincronização bidirecional não funciona corretamente
- Botão de sincronização não funciona

## Tarefas
- [ ] Refatorar backend para usar tabelas específicas (pacientes, especialistas, agendamentos, etc.)
- [ ] Atualizar rotas de storage para trabalhar com tabelas específicas
- [ ] Corrigir OfflineDB para sincronizar corretamente com as novas rotas
- [ ] Remover dependências de localStorage, usar apenas IndexedDB
- [ ] Implementar sincronização bidirecional funcional
- [ ] Corrigir botão de sincronização no frontend
- [ ] Testar funcionamento offline e online
- [ ] Preparar para deploy (HTTPS recomendado)

## Status
- Em andamento

## Plano de Correção

### 1. Análise dos Arquivos
- **backend/db/index.js**: Já usa tabelas específicas corretas
- **backend/routes/storage.js**: Funciona com tabelas específicas
- **backend/routes/sync.js**: Rotas de sincronização funcionais
- **offline-db.js**: Classe IndexedDB com problemas de mapeamento

### 2. Problemas Identificados
- OfflineDB usa tabelas diferentes das do backend (consultas vs agendamentos)
- syncWithCloud() usa localStorage.getItem('lastSync') que não existe
- Mapeamento de tabelas incorreto no syncItem()
- Falta integração com as rotas /sync existentes

### 3. Correções Necessárias
- Alinhar nomes de tabelas entre OfflineDB e backend
- Remover dependências de localStorage
- Usar rotas /sync existentes em vez de /storage
- Implementar lastSync em IndexedDB
- Corrigir syncWithCloud() para usar as rotas corretas
