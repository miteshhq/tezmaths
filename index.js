import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import { LogBox } from 'react-native';

// Optional: Ignore specific warnings
LogBox.ignoreLogs([
  'Require cycle:',
]);

// ExpoRouter entry point
const App = () => {
  const ctx = require.context('./app'); // Auto-import all routes from app/
  return ExpoRoot({ context: ctx });
};

registerRootComponent(App);
