const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsedBody = body ? JSON.parse(body) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedBody
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testEndpoint(name, options, expectedStatus = 200, data = null) {
  try {
    console.log(`\nTestando ${name}...`);
    const response = await makeRequest(options, data);
    console.log(`Status: ${response.statusCode}`);
    console.log(`Resposta:`, response.body);

    if (response.statusCode === expectedStatus) {
      console.log(`✅ ${name} - PASSOU`);
      return true;
    } else {
      console.log(`❌ ${name} - FALHOU (esperado ${expectedStatus}, recebeu ${response.statusCode})`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${name} - ERRO: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Iniciando testes do backend da clínica...\n');

  let passed = 0;
  let total = 0;

  // Teste 1: Endpoint raiz
  total++;
  if (await testEndpoint('Endpoint Raiz', {
    hostname: 'localhost',
    port: 3000,
    path: '/',
    method: 'GET'
  })) passed++;

  // Teste 2: Health check
  total++;
  if (await testEndpoint('Health Check', {
    hostname: 'localhost',
    port: 3000,
    path: '/health',
    method: 'GET'
  })) passed++;

  // Teste 3: Listar tabelas
  total++;
  if (await testEndpoint('Listar Tabelas', {
    hostname: 'localhost',
    port: 3000,
    path: '/tables',
    method: 'GET'
  })) passed++;

  // Teste 4: Descrição da tabela storage
  total++;
  if (await testEndpoint('Descrição Storage', {
    hostname: 'localhost',
    port: 3000,
    path: '/storage/describe',
    method: 'GET'
  })) passed++;

  // Teste 5: Buscar todos os dados storage (deve estar vazio)
  total++;
  if (await testEndpoint('Buscar Todos Storage', {
    hostname: 'localhost',
    port: 3000,
    path: '/storage/all',
    method: 'GET'
  })) passed++;

  // Teste 6: Salvar dado no storage
  total++;
  if (await testEndpoint('Salvar Dado Storage', {
    hostname: 'localhost',
    port: 3000,
    path: '/storage/teste',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, 200, { value: 'teste valor' })) passed++;

  // Teste 7: Verificar se o dado foi salvo
  total++;
  if (await testEndpoint('Verificar Dado Salvo', {
    hostname: 'localhost',
    port: 3000,
    path: '/storage/all',
    method: 'GET'
  })) passed++;

  // Teste 8: Atualizar dado existente
  total++;
  if (await testEndpoint('Atualizar Dado Storage', {
    hostname: 'localhost',
    port: 3000,
    path: '/storage/teste',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, 200, { value: 'valor atualizado' })) passed++;

  // Teste 9: Verificar atualização
  total++;
  if (await testEndpoint('Verificar Atualização', {
    hostname: 'localhost',
    port: 3000,
    path: '/storage/all',
    method: 'GET'
  })) passed++;

  // Teste 10: POST sem valor (deve falhar)
  total++;
  if (await testEndpoint('POST sem Valor', {
    hostname: 'localhost',
    port: 3000,
    path: '/storage/teste2',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, 400, {})) passed++;

  // Teste 11: Salvar objeto complexo
  total++;
  if (await testEndpoint('Salvar Objeto Complexo', {
    hostname: 'localhost',
    port: 3000,
    path: '/storage/objeto',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, 200, { value: { nome: 'João', idade: 30, ativo: true } })) passed++;

  // Teste 12: Verificar objeto complexo
  total++;
  if (await testEndpoint('Verificar Objeto Complexo', {
    hostname: 'localhost',
    port: 3000,
    path: '/storage/all',
    method: 'GET'
  })) passed++;

  // Resultado final
  console.log(`\n📊 Resultado dos Testes:`);
  console.log(`Total de testes: ${total}`);
  console.log(`Passaram: ${passed}`);
  console.log(`Falharam: ${total - passed}`);

  if (passed === total) {
    console.log(`🎉 Todos os testes passaram! O backend está funcionando perfeitamente.`);
  } else {
    console.log(`⚠️ Alguns testes falharam. Verifique os logs acima.`);
  }
}

// Executar testes
runTests().catch(console.error);
