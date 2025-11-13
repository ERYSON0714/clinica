# Clinica - Backend Mínimo

Arquivos criados para conectar rapidamente ao MySQL:

- `package.json` - dependências e scripts
- `server.js` - servidor Express com rotas mínimas
- `db/index.js` - pool mysql2/promise
- `routes/health.js` - GET /health
- `routes/tables.js` - GET /tables (mostra tabelas do banco)
- `.env.example` - exemplo de variáveis de ambiente

## Como usar

1. Entre na pasta `backend`:

```powershell
Set-Location -Path "C:\Users\Eryson Morais\OneDrive\Área de Trabalho\clinica\backend"
```

2. Copie `.env.example` para `.env` e preencha as credenciais do seu MySQL:

```powershell
copy .env.example .env
# editar .env e ajustar DB_PASS, DB_NAME se necessário
notepad .env
```

3. Instale dependências:

```powershell
npm install
```

4. Inicie o servidor:

```powershell
node server.js
# ou em desenvolvimento (requer nodemon):
# npx nodemon server.js
```

5. Testes:
- Health: `http://localhost:3000/health`
- Listar tabelas: `http://localhost:3000/tables`
