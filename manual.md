# Complete Google Auth Setup Guide for Firebase + Expo + React Native

## Phase 1: Firebase Project Setup

### 1.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter project name: `tezmaths-app` (or your preferred name)
4. Choose whether to enable Google Analytics (recommended for production)
5. Select Analytics account or create new one
6. Click "Create project"

### 1.2 Enable Authentication

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Click on **Google** provider
3. Toggle **Enable**
4. Set **Project support email** (your email)
5. Click **Save**

## Phase 2: Android Configuration

### 2.1 Add Android App to Firebase

1. In Firebase Console, click **Add app** → **Android**
2. **Android package name**: `com.yourcompany.tezmaths` (must match your app.json)
3. **App nickname**: `TezMaths Android`
4. **Debug signing certificate SHA-1**: (We'll generate this next)
5. Don't click "Register app" yet

### 2.2 Generate SHA Keys Without Java

Since you don't have Java installed, we'll use EAS CLI:

```bash
# Install EAS CLI if not installed
npm install -g @expo/eas-cli

# Login to Expo
eas login

# Generate credentials
eas credentials
```

Follow these steps in the EAS credentials flow:

1. Select **Android**
2. Choose **production** or **development** based on your build type
3. Select **Keystore: Manage everything needed to build your project**
4. Choose **Generate new keystore**
5. The SHA-1 and SHA-256 will be displayed - copy the **SHA-1**

### 2.3 Complete Android App Registration

1. Paste the SHA-1 key in Firebase Console
2. Click **Register app**
3. Download `google-services.json`
4. Place it in your project root directory (same level as app.json)

## Phase 3: iOS Configuration

### 3.1 Add iOS App to Firebase

1. In Firebase Console, click **Add app** → **iOS**
2. **iOS bundle ID**: `com.yourcompany.tezmaths`
3. **App nickname**: `TezMaths iOS`
4. **App Store ID**: (leave empty for now)
5. Click **Register app**
6. Download `GoogleService-Info.plist`
7. Place it in your project root directory

## Phase 4: Project Configuration

### 4.1 Install Required Packages

```bash
npm install @react-native-google-signin/google-signin
npm install expo-dev-client
```

### 6.2 Build Commands

```bash
# Development build
eas build --platform android --profile development

# Production build
eas build --platform android --profile production

# iOS builds
eas build --platform ios --profile development
eas build --platform ios --profile production
```

## Phase 7: Web Client ID Configuration

### 7.1 Get Web Client ID

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Go to **APIs & Services** → **Credentials**
4. Find **Web client (auto created by Google Service)**
5. Copy the **Client ID**
6. Replace `YOUR_WEB_CLIENT_ID` in your code

## Phase 8: Project Migration Guide

### 8.1 Transferring to Another User

1. **Firebase Project Transfer:**
   - Go to Firebase Console → Project Settings → Users and permissions
   - Add new user as Owner
   - Remove old user after transfer

2. **Code Repository:**
   - Update `firebaseConfig.js` with new project credentials
   - Update `google-services.json` and `GoogleService-Info.plist`
   - Update Web Client ID in Google Sign-In configuration

3. **EAS/Expo Account:**
   - Transfer project ownership in Expo dashboard
   - Update build credentials if needed

## Phase 9: Testing

### 9.1 Development Testing

```bash
# Start development server
npx expo start --dev-client

# Or with EAS development build
eas build --platform android --profile development --local
```

### 9.2 Testing Checklist

- [ ] Google Sign-In works on Android
- [ ] Google Sign-In works on iOS
- [ ] New users are created in Firebase Database
- [ ] Existing users can sign in
- [ ] User redirection works correctly
- [ ] Error handling works properly

## Troubleshooting

### Common Issues

1. **SHA-1 mismatch**: Regenerate and update in Firebase Console
2. **Web Client ID error**: Ensure correct Web Client ID from Google Cloud Console
3. **Package name mismatch**: Ensure app.json package matches Firebase configuration
4. **Google Services file not found**: Ensure files are in project root and referenced correctly in app.json

### Debug Commands

```bash
# Check EAS credentials
eas credentials

# Clear Metro cache
npx expo start --clear

# Check Google Sign-In configuration
npx react-native info
```
