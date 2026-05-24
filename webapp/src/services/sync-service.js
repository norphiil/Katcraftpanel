const fs = require('fs');
const path = require('path');

/**
 * Service de synchronisation entre la base de données (Docker) et les fichiers de configuration
 */
class SyncService {
  constructor() {
    this.SERVERS_PATH = '/app/servers';
    this.VELOCITY_DATA_PATH = '/app/velocity_data';
  }

  /**
   * Lancer la synchronisation complète au démarrage
   */
  async runSync() {
    console.log('[SyncService] Starting synchronization...');
    
    // 1. Obtenir la liste des serveurs dans Docker
    const dockerServers = await this.getDockerServers();
    
    // 2. Obtenir la liste des serveurs dans velocity.toml
    const velocityServers = await this.getVelocityServers();
    
    // 3. Obtenir la liste des serveurs dans les dossiers
    const filesystemServers = await this.getFileSystemServers();
    
    console.log('[SyncService] Docker servers:', dockerServers);
    console.log('[SyncService] Velocity servers:', velocityServers);
    console.log('[SyncService] Filesystem servers:', filesystemServers);
    
    // 4. Synchroniser velocity.toml avec Docker
    await this.syncVelocityWithDocker(dockerServers);
    
    // 5. Synchroniser les dossiers avec les serveurs
    await this.syncFileSystem(dockerServers);
    
    console.log('[SyncService] Synchronization complete');
  }

  /**
   * Obtenir la liste des serveurs depuis le système de fichiers
   */
  async getDockerServers() {
    const dockerService = require('./docker');
    const fsServers = dockerService.scanFilesystemServers();

    return fsServers.map(s => ({
      name: s.name,
      serverPort: s.serverPort || 25565
    }));
  }

  /**
   * Obtenir la liste des serveurs depuis velocity.toml
   */
  async getVelocityServers() {
    try {
      const velocityService = require('./velocity');
      const config = velocityService.readVelocityConfig();
      if (!config || !config.servers) return {};
      
      const servers = { ...config.servers };
      delete servers.try;
      return servers;
    } catch (err) {
      console.error('[SyncService] Error reading velocity config:', err.message);
      return {};
    }
  }

  /**
   * Obtenir la liste des serveurs depuis le système de fichiers
   */
  async getFileSystemServers() {
    try {
      if (!fs.existsSync(this.SERVERS_PATH)) return [];
      
      const servers = fs.readdirSync(this.SERVERS_PATH);
      return servers.filter(file => {
        // Ignorer les fichiers non-dossiers et dossiers cachés (.git, etc.)
        if (file.startsWith('.')) return false;
        const fullPath = path.join(this.SERVERS_PATH, file);
        return fs.statSync(fullPath).isDirectory();
      });
    } catch (err) {
      console.error('[SyncService] Error reading filesystem:', err.message);
      return [];
    }
  }

  /**
   * Synchroniser velocity.toml avec Docker
   */
  async syncVelocityWithDocker(dockerServers) {
    const velocityService = require('./velocity');

    // Reconstruire velocity.toml proprement à partir de la liste Docker
    velocityService.rebuildVelocityConfig(
      dockerServers.map(s => ({
        name: s.name,
        containerName: s.containerName,
        serverPort: s.serverPort
      }))
    );
  }

  /**
   * Synchroniser le système de fichiers avec les serveurs Docker
   */
  async syncFileSystem(dockerServers) {
    for (const serverInfo of dockerServers) {
      const serverName = serverInfo.name;
      const serverDir = path.join(this.SERVERS_PATH, serverName);

      if (!fs.existsSync(serverDir)) {
        fs.mkdirSync(serverDir, { recursive: true });
        console.log(`[SyncService] Created directory for ${serverName}`);
      }
    }
  }

  /**
   * Mettre à jour velocity.toml après suppression d'un serveur
   * (Rebuild complet pour éviter les données résiduelles)
   */
  async updateAfterServerDelete(serverName) {
    const dockerService = require('./docker');
    const velocityService = require('./velocity');

    // Récupérer la liste actuelle des serveurs depuis le système de fichiers
    const fsServers = dockerService.scanFilesystemServers();

    // Rebuild velocity.toml proprement
    velocityService.rebuildVelocityConfig(
      fsServers.map(s => ({
        name: s.name,
        containerName: s.containerName || `mc-${s.name}`,
        serverPort: s.serverPort || 25565
      }))
    );
  }

  /**
   * Reload Velocity après modification de velocity.toml
   * Essaie d'abord via RCON (plus rapide), sinon redémarre le conteneur
   */
  async reloadVelocity() {
    const dockerService = require('./docker');
    const docker = dockerService.docker;

    try {
      // Tenter de trouver le conteneur Velocity (nom: 'velocity' ou 'proxy')
      let containers = await docker.listContainers({
        all: true,
        filters: {
          name: ['^/velocity$']
        }
      });

      // Fallback pour le nom 'proxy' si 'velocity' ne fonctionne pas
      if (containers.length === 0) {
        containers = await docker.listContainers({
          all: true,
          filters: {
            name: ['^/proxy$']
          }
        });
      }

      if (containers.length > 0) {
        const container = docker.getContainer(containers[0].Id);

        // Récupérer les informations du conteneur
        const info = await container.inspect();

        // Redémarrer proprement Velocity pour appliquer la nouvelle configuration
        const isRunning = info.State.Running;

        if (isRunning) {
          // Velocity nécessite un redémarrage pour appliquer les changements de configuration
          await container.restart({ t: 5 });
          console.log('[SyncService] Velocity restarted for configuration reload');
        }
      }
    } catch (err) {
      console.error('[SyncService] Error reloading Velocity:', err.message);
    }
  }
}

module.exports = new SyncService();
