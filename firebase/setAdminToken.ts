const admin = require('firebase-admin');
const serviceAccount = require('./service-key.json'); // Ensure this path is correct

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://tezmathsinnovations-default-rtdb.asia-southeast1.firebasedatabase.app'
});

async function createAdminAccount() {
  try {
    const adminEmail = 'tezmaths@admin.com';
    const adminPassword = 'admin@t32m392s';
    
    let userRecord;
    
    try {
      // First, try to get existing user
      userRecord = await admin.auth().getUserByEmail(adminEmail);
    //   console.log('Admin user already exists with UID:', userRecord.uid);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // User doesn't exist, create new one
        // console.log('Creating new admin user...');
        userRecord = await admin.auth().createUser({
          email: adminEmail,
          password: adminPassword,
          emailVerified: true,
          disabled: false,
        });
        // console.log('Successfully created admin user with UID:', userRecord.uid);
      } else {
        throw error;
      }
    }
    
    // Set custom claims for admin role
    try {
      await admin.auth().setCustomUserClaims(userRecord.uid, { 
        admin: true,
        role: 'admin'
      });
    //   console.log('Admin custom claims set successfully');
    } catch (claimsError) {
      console.error('Error setting custom claims:', claimsError.message);
    }
    
    // Try to store user data in Realtime Database
    try {
      const realtimeDb = admin.database();
      const userData = {
        fullName: 'Tez Maths Admin',
        username: 'admin',
        phoneNumber: '',
        email: adminEmail,
        avatar: 'default-admin-avatar.png',
        isnewuser: false,
        streak: 0,
        lastCompletionDate: null,
        highestCompletedLevelCompleted: 0,
        levelsScores: [],
        referrals: 0,
        totalPoints: 0,
        role: 'admin',
        createdAt: admin.database.ServerValue.TIMESTAMP,
      };
      
      await realtimeDb.ref('users').child(userRecord.uid).set(userData);
    //   console.log('Admin user data stored in Realtime Database successfully');
    } catch (realtimeError) {
      console.warn('Warning: Could not store data in Realtime Database:', realtimeError.message);
    }
    
    // Retrieve the user to verify everything worked
    const retrievedUser = await admin.auth().getUser(userRecord.uid);
    // console.log('\n=== ADMIN ACCOUNT DETAILS ===');
    // console.log('UID:', retrievedUser.uid);
    // console.log('Email:', retrievedUser.email);
    // console.log('Email Verified:', retrievedUser.emailVerified);
    // console.log('Custom Claims:', retrievedUser.customClaims);
    // console.log('Provider Data:', retrievedUser.providerData.map(p => p.providerId));
    // console.log('=============================\n');
    
    return retrievedUser;
    
  } catch (error) {
    console.error('Error in createAdminAccount:', error.message);
    throw error;
  }
}

// Run both functions
async function setupUsers() {
  try {
    // console.log('🔧 Setting up admin account...');
    const adminUser = await createAdminAccount();
    
    // console.log('✅ All accounts setup completed successfully!');
    // console.log('\n📋 LOGIN CREDENTIALS:');
    // console.log('======================');
    // console.log('👑 ADMIN ACCOUNT:');
    // console.log('Email: tezmaths@admin.com');
    // console.log('Password: admin@t32m392s');
    // console.log('UID:', adminUser.uid);
    // console.log('======================');
    
  } catch (error) {
    console.error('❌ Failed to setup accounts:', error.message);
    process.exit(1);
  }
}

setupUsers();