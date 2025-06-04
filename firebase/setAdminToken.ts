const admin = require('firebase-admin');
const serviceAccount = require('./service-key.json'); // Ensure this path is correct

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = 'mwMgmX6snQUEzg6ReVD6o6i3mJs1'; // UID for tezmaths@admin.com

// admin.auth().setCustomUserClaims(uid, { admin: true })
//   .then(() => {
//     console.log('Admin claim set successfully');
//     process.exit(0);
//   })
//   .catch((error) => {
//     console.error('Error setting custom claims:', error);
//     process.exit(1);
//   });

admin.auth().getUser(uid)
  .then(user => {
    console.log('Your custom claims:', user.customClaims);
  })
  .catch(error => {
    console.error('Error:', error);
  });