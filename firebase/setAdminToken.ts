const admin = require('firebase-admin');
const serviceAccount = require('./service-key.json'); // Ensure this path is correct

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = 'mwMgmX6snQUEzg6ReVD6o6i3mJs1'; // UID for tezmaths@admin.com

admin.auth().getUser(uid);