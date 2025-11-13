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
