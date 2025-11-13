// Sistema de Banco de Dados Offline-First com Sincronização
class OfflineDB {
  constructor() {
    this.dbName = 'clinica_offline';
    this.version = 1;
    this.db = null;
    this.syncQueue = [];
    this.isOnline = navigator.onLine;
    this.init();
    this.setupConnectivityListeners();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('Offline DB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Tabela de pacientes
        if (!db.objectStoreNames.contains('pacientes')) {
          const pacientesStore = db.createObjectStore('pacientes', { keyPath: 'id' });
          pacientesStore.createIndex('nome', 'nome', { unique: false });
          pacientesStore.createIndex('cpf', 'cpf', { unique: true });
          pacientesStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Tabela de especialistas
        if (!db.objectStoreNames.contains('especialistas')) {
          const especialistasStore = db.createObjectStore('especialistas', { keyPath: 'id' });
          especialistasStore.createIndex('nome', 'nome', { unique: false });
          especialistasStore.createIndex('especialidade', 'especialidade', { unique: false });
          especialistasStore.createIndex('crm', 'crm', { unique: true });
          especialistasStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Tabela de consultas
        if (!db.objectStoreNames.contains('consultas')) {
          const consultasStore = db.createObjectStore('consultas', { keyPath: 'id' });
          consultasStore.createIndex('paciente_id', 'paciente_id', { unique: false });
          consultasStore.createIndex('especialista_id', 'especialista_id', { unique: false });
          consultasStore.createIndex('data', 'data', { unique: false });
          consultasStore.createIndex('status', 'status', { unique: false });
          consultasStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Tabela de agendamentos
        if (!db.objectStoreNames.contains('agendamentos')) {
          const agendamentosStore = db.createObjectStore('agendamentos', { keyPath: 'id' });
          agendamentosStore.createIndex('paciente_id', 'paciente_id', { unique: false });
          agendamentosStore.createIndex('especialista_id', 'especialista_id', { unique: false });
          agendamentosStore.createIndex('data_hora', 'data_hora', { unique: false });
          agendamentosStore.createIndex('status', 'status', { unique: false });
          agendamentosStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Tabela de usuários
        if (!db.objectStoreNames.contains('usuarios')) {
          const usuariosStore = db.createObjectStore('usuarios', { keyPath: 'id' });
          usuariosStore.createIndex('email', 'email', { unique: true });
          usuariosStore.createIndex('tipo', 'tipo', { unique: false });
          usuariosStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Tabela de configurações da clínica
        if (!db.objectStoreNames.contains('clinica_config')) {
          const configStore = db.createObjectStore('clinica_config', { keyPath: 'id' });
          configStore.createIndex('sync_status', 'sync_status', { unique: false });
        }

        // Tabela de fila de sincronização
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('table', 'table', { unique: false });
          syncStore.createIndex('operation', 'operation', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  setupConnectivityListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('Online - Iniciando sincronização');
      this.syncAll();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('Offline - Modo offline ativado');
    });
  }

  // Métodos CRUD genéricos
  async save(table, data) {
    const transaction = this.db.transaction([table], 'readwrite');
    const store = transaction.objectStore(table);

    // Adicionar metadados de sincronização
    data.sync_status = data.sync_status || 'pending';
    data.last_modified = new Date().toISOString();

    const request = store.put(data);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        // Adicionar à fila de sincronização se estiver online
        if (this.isOnline) {
          this.addToSyncQueue(table, 'save', data);
        }
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async update(table, id, updates) {
    const transaction = this.db.transaction([table], 'readwrite');
    const store = transaction.objectStore(table);

    return new Promise((resolve, reject) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const existingData = getRequest.result;
        if (!existingData) {
          reject(new Error(`Registro não encontrado: ${id}`));
          return;
        }

        const updatedData = { ...existingData, ...updates };
        updatedData.sync_status = 'pending';
        updatedData.last_modified = new Date().toISOString();

        const putRequest = store.put(updatedData);
        putRequest.onsuccess = () => {
          if (this.isOnline) {
            this.addToSyncQueue(table, 'update', updatedData);
          }
          resolve(putRequest.result);
        };
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async get(table, id) {
    const transaction = this.db.transaction([table], 'readonly');
    const store = transaction.objectStore(table);
    const request = store.get(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(table, index = null, value = null) {
    const transaction = this.db.transaction([table], 'readonly');
    const store = transaction.objectStore(table);
    let request;

    if (index && value !== null) {
      const idx = store.index(index);
      request = idx.getAll(value);
    } else {
      request = store.getAll();
    }

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(table, id) {
    const transaction = this.db.transaction([table], 'readwrite');
    const store = transaction.objectStore(table);
    const request = store.delete(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (this.isOnline) {
          this.addToSyncQueue(table, 'delete', { id });
        }
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveAll(table, items) {
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }

    const transaction = this.db.transaction([table], 'readwrite');
    const store = transaction.objectStore(table);

    const promises = items.map(item => {
      // Adicionar metadados de sincronização
      item.sync_status = item.sync_status || 'pending';
      item.last_modified = new Date().toISOString();

      const request = store.put(item);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          // Adicionar à fila de sincronização se estiver online
          if (this.isOnline) {
            this.addToSyncQueue(table, 'save', item);
          }
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
      });
    });

    return Promise.all(promises);
  }

  // Método de pesquisa avançada
  async search(table, query, fields = []) {
    const allRecords = await this.getAll(table);
    const searchTerm = query.toLowerCase();

    return allRecords.filter(record => {
      if (!fields.length) {
        // Pesquisar em todos os campos de texto
        return Object.values(record).some(value =>
          typeof value === 'string' && value.toLowerCase().includes(searchTerm)
        );
      } else {
        // Pesquisar apenas nos campos especificados
        return fields.some(field =>
          record[field] && typeof record[field] === 'string' &&
          record[field].toLowerCase().includes(searchTerm)
        );
      }
    });
  }

  // Método para contar registros
  async count(table, filter = null) {
    const records = await this.getAll(table);
    if (!filter) return records.length;

    return records.filter(record => {
      return Object.entries(filter).every(([key, value]) => record[key] === value);
    }).length;
  }

  // Método para paginação
  async getPaginated(table, page = 1, limit = 10, sortBy = null, sortOrder = 'asc') {
    let records = await this.getAll(table);

    // Ordenação
    if (sortBy) {
      records.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];

        if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Paginação
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    return {
      data: records.slice(startIndex, endIndex),
      total: records.length,
      page,
      limit,
      totalPages: Math.ceil(records.length / limit)
    };
  }

  // Métodos específicos para cada entidade

  // Pacientes
  async savePaciente(paciente) {
    paciente.id = paciente.id || `pac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.save('pacientes', paciente);
  }

  async updatePaciente(id, updates) {
    return this.update('pacientes', id, updates);
  }

  async getPacientes() {
    return this.getAll('pacientes');
  }

  async getPacienteByCPF(cpf) {
    return this.getAll('pacientes', 'cpf', cpf).then(results => results[0] || null);
  }

  async searchPacientes(query) {
    return this.search('pacientes', query, ['nome', 'cpf', 'telefone', 'email']);
  }

  async deletePaciente(id) {
    return this.delete('pacientes', id);
  }

  // Especialistas
  async saveEspecialista(especialista) {
    especialista.id = especialista.id || `esp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.save('especialistas', especialista);
  }

  async updateEspecialista(id, updates) {
    return this.update('especialistas', id, updates);
  }

  async getEspecialistas() {
    return this.getAll('especialistas');
  }

  async getEspecialistaByCRM(crm) {
    return this.getAll('especialistas', 'crm', crm).then(results => results[0] || null);
  }

  async searchEspecialistas(query) {
    return this.search('especialistas', query, ['nome', 'especialidade', 'crm']);
  }

  async deleteEspecialista(id) {
    return this.delete('especialistas', id);
  }

  // Consultas
  async saveConsulta(consulta) {
    consulta.id = consulta.id || `cons_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.save('consultas', consulta);
  }

  async updateConsulta(id, updates) {
    return this.update('consultas', id, updates);
  }

  async getConsultas() {
    return this.getAll('consultas');
  }

  async getConsultasByPaciente(pacienteId) {
    return this.getAll('consultas', 'paciente_id', pacienteId);
  }

  async getConsultasByEspecialista(especialistaId) {
    return this.getAll('consultas', 'especialista_id', especialistaId);
  }

  async searchConsultas(query) {
    return this.search('consultas', query, ['observacoes', 'diagnostico']);
  }

  async deleteConsulta(id) {
    return this.delete('consultas', id);
  }

  // Agendamentos
  async saveAgendamento(agendamento) {
    agendamento.id = agendamento.id || `ag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.save('agendamentos', agendamento);
  }

  async updateAgendamento(id, updates) {
    return this.update('agendamentos', id, updates);
  }

  async getAgendamentos() {
    return this.getAll('agendamentos');
  }

  async getAgendamentosByPaciente(pacienteId) {
    return this.getAll('agendamentos', 'paciente_id', pacienteId);
  }

  async getAgendamentosByEspecialista(especialistaId) {
    return this.getAll('agendamentos', 'especialista_id', especialistaId);
  }

  async searchAgendamentos(query) {
    return this.search('agendamentos', query, ['observacoes']);
  }

  async deleteAgendamento(id) {
    return this.delete('agendamentos', id);
  }

  // Usuários
  async saveUsuario(usuario) {
    usuario.id = usuario.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.save('usuarios', usuario);
  }

  async updateUsuario(id, updates) {
    return this.update('usuarios', id, updates);
  }

  async getUsuarios() {
    return this.getAll('usuarios');
  }

  async getUsuarioByEmail(email) {
    return this.getAll('usuarios', 'email', email).then(results => results[0] || null);
  }

  async searchUsuarios(query) {
    return this.search('usuarios', query, ['nome', 'email']);
  }

  async deleteUsuario(id) {
    return this.delete('usuarios', id);
  }

  // Configurações da clínica
  async saveClinicaConfig(config) {
    config.id = 'main_config';
    return this.save('clinica_config', config);
  }

  async getClinicaConfig() {
    return this.get('clinica_config', 'main_config');
  }

  // Sistema de sincronização
  async addToSyncQueue(table, operation, data) {
    const syncItem = {
      table,
      operation,
      data,
      timestamp: new Date().toISOString(),
      retry_count: 0
    };

    const transaction = this.db.transaction(['sync_queue'], 'readwrite');
    const store = transaction.objectStore('sync_queue');
    const request = store.add(syncItem);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncQueue() {
    return this.getAll('sync_queue');
  }

  async removeFromSyncQueue(id) {
    const transaction = this.db.transaction(['sync_queue'], 'readwrite');
    const store = transaction.objectStore('sync_queue');
    const request = store.delete(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async syncAll() {
    if (!this.isOnline) return;

    const queue = await this.getSyncQueue();
    console.log(`Sincronizando ${queue.length} itens...`);

    for (const item of queue) {
      try {
        await this.syncItem(item);
        await this.removeFromSyncQueue(item.id);
        console.log(`Sincronizado: ${item.table} - ${item.operation}`);
      } catch (error) {
        console.error(`Erro ao sincronizar ${item.table}:`, error);
        // Incrementar contador de tentativas
        item.retry_count = (item.retry_count || 0) + 1;
        if (item.retry_count < 3) {
          // Re-adicionar à fila para tentar novamente
          await this.addToSyncQueue(item.table, item.operation, item.data);
        }
        await this.removeFromSyncQueue(item.id);
      }
    }
  }

  async syncItem(item) {
    const baseUrl = window.location.origin.includes('localhost') ?
      'http://localhost:3000' : 'https://your-backend-url.com';

    let url, method, body;

    switch (item.table) {
      case 'pacientes':
        url = `${baseUrl}/storage/pacientes`;
        method = item.operation === 'delete' ? 'DELETE' : 'POST';
        body = item.operation === 'delete' ? { id: item.data.id } : item.data;
        break;

      case 'especialistas':
        url = `${baseUrl}/storage/especialistas`;
        method = item.operation === 'delete' ? 'DELETE' : 'POST';
        body = item.operation === 'delete' ? { id: item.data.id } : item.data;
        break;

      case 'consultas':
        url = `${baseUrl}/storage/consultas`;
        method = item.operation === 'delete' ? 'DELETE' : 'POST';
        body = item.operation === 'delete' ? { id: item.data.id } : item.data;
        break;

      case 'agendamentos':
        url = `${baseUrl}/storage/agendamentos`;
        method = item.operation === 'delete' ? 'DELETE' : 'POST';
        body = item.operation === 'delete' ? { id: item.data.id } : item.data;
        break;

      case 'usuarios':
        url = `${baseUrl}/storage/usuarios`;
        method = item.operation === 'delete' ? 'DELETE' : 'POST';
        body = item.operation === 'delete' ? { id: item.data.id } : item.data;
        break;

      default:
        throw new Error(`Tabela não suportada: ${item.table}`);
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Atualizar status de sincronização local
    if (item.operation !== 'delete') {
      item.data.sync_status = 'synced';
      await this.save(item.table, item.data);
    }

    return response.json();
  }

  // Método para forçar sincronização manual
  async forceSync() {
    if (!this.isOnline) {
      throw new Error('Sem conexão com a internet');
    }
    return this.syncAll();
  }

  // Método para verificar status da sincronização
  async getSyncStatus() {
    const queue = await this.getSyncQueue();
    return {
      isOnline: this.isOnline,
      pendingItems: queue.length,
      lastSync: localStorage.getItem('last_sync') || null
    };
  }

  // Método para sincronização bidirecional
  async syncWithCloud() {
    if (!this.isOnline) {
      throw new Error('Sem conexão com a internet');
    }

    try {
      // Coletar dados locais
      const localData = {};
      const stores = ['pacientes', 'especialistas', 'agendamentos', 'clinica_config', 'historico', 'comunicados'];

      for (const store of stores) {
        const data = await this.getAll(store);
        if (Array.isArray(data) && data.length > 0) {
          localData[store] = data.map(item => ({
            ...item,
            lastModified: item.lastModified || Date.now()
          }));
        } else if (data && typeof data === 'object') {
          localData[store] = {
            ...data,
            lastModified: data.lastModified || Date.now()
          };
        }
      }

      // Enviar para nuvem e receber dados atualizados
      const response = await fetch('/sync/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          localData,
          lastSync: localStorage.getItem('lastSync')
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // Atualizar dados locais com dados da nuvem
      if (result.cloudData) {
        for (const [store, items] of Object.entries(result.cloudData)) {
          if (Array.isArray(items)) {
            // Para arrays, sobrescrever completamente
            await this.saveAll(store, items);
          } else {
            // Para objetos simples
            await this.save(store, items);
          }
        }
      }

      // Atualizar timestamp da última sincronização
      localStorage.setItem('lastSync', result.lastSync);

      return result;
    } catch (error) {
      console.error('Erro na sincronização:', error);
      throw error;
    }
  }
}

// Instância global
window.offlineDB = new OfflineDB();
