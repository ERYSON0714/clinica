// Módulo de sincronização offline/online para a clínica
class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.lastSyncTime = null;
    this.syncInterval = null;
    this.init();
  }

  init() {
    // Detectar mudanças de conectividade
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('Conexão restaurada - iniciando sincronização automática');
      this.syncData();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('Conexão perdida - funcionando em modo offline');
    });

    // Sincronização automática a cada 5 minutos quando online
    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.syncData();
      }
    }, 5 * 60 * 1000);

    // Sincronização inicial se estiver online
    if (this.isOnline) {
      this.syncData();
    }
  }

  async syncData() {
    if (this.syncInProgress || !this.isOnline) return;

    this.syncInProgress = true;
    console.log('Iniciando sincronização...');

    try {
      // Sincronização bidirecional usando a nova rota /sync/sync
      await this.bidirectionalSync();

      this.lastSyncTime = new Date();
      console.log('Sincronização concluída com sucesso');

      // Notificar usuário sobre sincronização bem-sucedida
      this.showSyncNotification('Sincronização concluída', 'success');

    } catch (error) {
      console.error('Erro na sincronização:', error);
      this.showSyncNotification('Erro na sincronização: ' + error.message, 'error');
    } finally {
      this.syncInProgress = false;
    }
  }

  async bidirectionalSync() {
    const localData = {};

    // Coletar dados locais que precisam ser sincronizados
    const keys = ['db_pacientes_v3', 'db_especialistas_v3', 'db_agendamentos_v3', 'db_config_v3', 'db_history_v1', 'db_comunicados_v1'];

    for (const key of keys) {
      const data = read(key);
      if (Array.isArray(data) && data.length > 0) {
        // Adicionar timestamp de modificação para resolução de conflitos
        localData[key] = data.map(item => ({
          ...item,
          lastModified: item.lastModified || Date.now()
        }));
      } else if (data && typeof data === 'object') {
        localData[key] = {
          ...data,
          lastModified: data.lastModified || Date.now()
        };
      }
    }

    // Enviar dados locais e receber dados da nuvem em uma única requisição
    const response = await fetch('/sync/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localData,
        lastSync: this.lastSyncTime ? this.lastSyncTime.toISOString() : null
      })
    });

    if (!response.ok) {
      throw new Error('Falha na sincronização bidirecional');
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error('Resposta de sincronização inválida');
    }

    // Aplicar dados da nuvem recebidos
    if (result.cloudData) {
      for (const [key, cloudItems] of Object.entries(result.cloudData)) {
        if (Array.isArray(cloudItems)) {
          const localItems = read(key) || [];
          const merged = this.mergeArrays(localItems, cloudItems);
          write(key, merged);
        } else {
          // Para objetos simples, usar versão mais recente
          const localItem = read(key);
          if (!localItem || !localItem.lastModified || cloudItems.lastModified > localItem.lastModified) {
            write(key, cloudItems);
          }
        }
      }
    }

    // Atualizar timestamp da última sincronização
    if (result.lastSync) {
      this.lastSyncTime = new Date(result.lastSync);
    }

    console.log('Sincronização bidirecional concluída');
  }

  async uploadLocalData() {
    const localData = {};

    // Coletar dados locais que precisam ser sincronizados
    const keys = ['db_pacientes_v3', 'db_especialistas_v3', 'db_agendamentos_v3', 'db_config_v3', 'db_history_v1', 'db_comunicados_v1'];

    for (const key of keys) {
      const data = read(key);
      if (Array.isArray(data) && data.length > 0) {
        // Adicionar timestamp de modificação para resolução de conflitos
        localData[key] = data.map(item => ({
          ...item,
          lastModified: item.lastModified || Date.now()
        }));
      } else if (data && typeof data === 'object') {
        localData[key] = {
          ...data,
          lastModified: data.lastModified || Date.now()
        };
      }
    }

    if (Object.keys(localData).length > 0) {
      const response = await fetch('/sync/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: localData })
      });

      if (!response.ok) {
        throw new Error('Falha no upload dos dados');
      }

      console.log('Dados locais enviados para nuvem');
    }
  }

  async downloadCloudData() {
    const response = await fetch('/sync/download');
    if (!response.ok) {
      throw new Error('Falha no download dos dados');
    }

    const cloudData = await response.json();

    // Mesclar dados da nuvem com dados locais, resolvendo conflitos
    for (const [key, cloudItems] of Object.entries(cloudData)) {
      if (Array.isArray(cloudItems)) {
        const localItems = read(key) || [];
        const merged = this.mergeArrays(localItems, cloudItems);
        write(key, merged);
      } else {
        // Para objetos simples, usar versão mais recente
        const localItem = read(key);
        if (!localItem || !localItem.lastModified || cloudItems.lastModified > localItem.lastModified) {
          write(key, cloudItems);
        }
      }
    }

    console.log('Dados da nuvem baixados e mesclados');
  }

  mergeArrays(localArray, cloudArray) {
    const merged = new Map();

    // Adicionar itens locais
    localArray.forEach(item => {
      merged.set(item.id, { ...item, source: 'local' });
    });

    // Mesclar com itens da nuvem
    cloudArray.forEach(cloudItem => {
      const existing = merged.get(cloudItem.id);
      if (!existing) {
        merged.set(cloudItem.id, { ...cloudItem, source: 'cloud' });
      } else {
        // Resolver conflito baseado no timestamp
        if (cloudItem.lastModified > existing.lastModified) {
          merged.set(cloudItem.id, { ...cloudItem, source: 'cloud' });
        }
        // Se local for mais recente, manter local
      }
    });

    return Array.from(merged.values()).map(({ source, ...item }) => item);
  }

  showSyncNotification(message, type = 'info') {
    // Criar notificação temporária
    const notification = document.createElement('div');
    notification.className = `sync-notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-weight: bold;
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;

    if (type === 'success') {
      notification.style.backgroundColor = '#28a745';
    } else if (type === 'error') {
      notification.style.backgroundColor = '#dc3545';
    } else {
      notification.style.backgroundColor = '#007bff';
    }

    document.body.appendChild(notification);

    // Remover após 5 segundos
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 5000);
  }

  // Método para forçar sincronização manual
  forceSync() {
    if (!this.isOnline) {
      this.showSyncNotification('Sem conexão com a internet', 'error');
      return;
    }
    this.syncData();
  }

  // Método para verificar status da sincronização
  async getSyncStatus() {
    if (!this.isOnline) {
      return { online: false, lastSync: this.lastSyncTime };
    }

    try {
      const response = await fetch('/sync/status');
      const status = await response.json();
      return {
        online: true,
        lastSync: this.lastSyncTime,
        pendingUploads: status.pending || 0
      };
    } catch (error) {
      return { online: true, lastSync: this.lastSyncTime, error: error.message };
    }
  }

  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }
}

// CSS para animações das notificações
const syncStyles = `
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}

.sync-notification {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
`;

// Adicionar estilos ao documento
const styleSheet = document.createElement('style');
styleSheet.textContent = syncStyles;
document.head.appendChild(styleSheet);

// Exportar para uso global
window.SyncManager = SyncManager;
