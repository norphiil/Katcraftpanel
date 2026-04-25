const syncService = require('./sync-service');

/**
 * Health check et synchronisation automatique
 * Lancer une synchro après un délai pour laisser les services démarrer
 */
async function initHealthSync() {
  console.log('[HealthSync] Starting health sync daemon...');
  
  // Lancer une première sync après le démarrage
  setTimeout(async () => {
    try {
      console.log('[HealthSync] Running initial sync...');
      await syncService.runSync();
    } catch (err) {
      console.error('[HealthSync] Initial sync failed:', err.message);
    }
  }, 5000);
  
  // Puis lancer une sync toutes les 5 minutes
  setInterval(async () => {
    try {
      console.log('[HealthSync] Running scheduled sync...');
      await syncService.runSync();
    } catch (err) {
      console.error('[HealthSync] Scheduled sync failed:', err.message);
    }
  }, 5 * 60 * 1000); // 5 minutes
}

module.exports = { initHealthSync };
