<div align="center">
  <h1>🎮 KatCraftPanel</h1>
  <p><b>Dashboard de gestion sur-mesure pour serveurs Minecraft</b></p>
  
  <p>
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
    <img src="https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
    <img src="https://img.shields.io/badge/Traefik-24A1C1?style=for-the-badge&logo=traefik&logoColor=white" alt="Traefik" />
  </p>
</div>

---

## 📝 Description

**KatCraftPanel** est une solution complète et dockerisée permettant de gérer un réseau de serveurs Minecraft. Le projet s'articule autour d'un proxy **Velocity** gérant les connexions des joueurs, accompagné d'une **interface web (Panel) en Node.js** qui permet à l'administrateur de superviser et de piloter l'ensemble de ses de serveurs de jeu via Docker.

## ✨ Fonctionnalités

- 🐳 **Intégration Docker Native** : Création, gestion, démarrage et arrêt des conteneurs Minecraft gérés via `dockerode`.
- 🔌 **Intégration Velocity Proxy** : Prêt pour relier et gérer un réseau complet de serveurs (Velocity préconfiguré). 
- 📟 **Console en Temps Réel** : Communication WebSocket et protocole RCON pour exécuter des commandes et lire les logs en direct.
- 📁 **Gestionnaire de Fichiers (File Manager)** : Explorateur de fichiers intégré pour éditer, téléverser ou supprimer les fichiers de configuration de vos serveurs (TOML, properties, etc.).
- 💾 **Sauvegardes Google Drive** : Système automatisé d'archives (`.zip`) et exportation directe vers Google Drive à l'aide de l'API Google.
- 🔒 **Routage et Sécurité** : Déploiement optimisé pour fonctionner derrière un reverse-proxy Traefik.

---

## ⚙️ Prérequis

Avant de pouvoir déployer le projet sur votre machine hôte, assurez-vous d'avoir installé :

- [Docker Engine](https://docs.docker.com/engine/install/) et [Docker Compose](https://docs.docker.com/compose/install/)
- Un reverse-proxy **Traefik** tournant sur le réseau externe `traefik_default`. (configurable dans `docker-compose.yml`)
- Une clé **Google Service Account** au format JSON (uniquement pour les backups Google Drive).

## 🚀 Installation & Déploiement

### 1. Cloner le dépôt et se rendre dans le dossier

*(En considérant que le code est sur une machine distante)*
```bash
git clone https://github.com/norphiil/katcraftpanel
cd katcraftpanel
```

### 2. Configuration Environnementale

Créez un fichier `.env` à la racine de votre dossier de projet pour définir les identifiants d'administration et les secrets :

```env
# Authentification Panel
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_ce_mot_de_passe
SESSION_SECRET=katcraft-secret-change-this-in-production

# Configuration Serveur
DEFAULT_RCON_PASSWORD=mon_mot_de_passe_rcon
PORT=3000

# Sauvegardes Google Drive (Optionnel)
GOOGLE_DRIVE_FOLDER_ID=votre_id_de_dossier_drive
# Le json doit être placé dans ./secrets/service-account.json
GOOGLE_SERVICE_ACCOUNT_KEY=/app/secrets/service-account.json
```

*(Si vous utilisez les sauvegardes Google Drive, n'oubliez pas de glisser votre fichier `service-account.json` dans le dossier local `secrets/`)*

### 3. Démarrage Docker Compose

Lancez le projet en arrière plan à l'aide de Docker Compose :

```bash
docker compose up -d --build
```
Les conteneurs vont se configurer. Vous pouvez accédez au panel via votre nom de domaine Traefik configuré ou sur l'IP/Port correspondante.

---

## 🏗️ Structure du Projet

```text
├── .env                 # Variables de configuration globale
├── docker-compose.yml   # Stack Docker (Proxy Velocity + Panel Node.js)
├── webapp/              # Code source du Panel Node.js 
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js        # Point d'entée Express
│   ├── public/          # Assets front-end (JS, CSS, Images, Components Web)
│   └── src/             # Logique back-end (Routes, API Docker, RCON, Backups)
├── servers/             # Dossier mappé contenant l'environnement de chaque sous-serveur Minecraft
├── velocity_data/       # Fichiers de configuration, plugins et instances du Proxy Velocity
└── secrets/             # Certificats et jetons sensibles (Google Drive API)
```

## 🛠️ Développement Local

Pour les tests UI ou la contribution sur l'application Web uniquement (nécessaire d'avoir Node 18+) :

```bash
cd webapp
npm install
npm run dev
```

*(L'application dev Node.js tentera de se lier au `/var/run/docker.sock` local pour contrôler Docker. Sur Linux/Mac, les permissions du groupe `docker` sont requises)*

---

### 🛡️ Licence
Ce projet est privé ou sous licence définie. Ne pas distribuer sans autorisation.
