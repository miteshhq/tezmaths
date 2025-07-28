import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';
import { LogBox, View, Text, Image, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

// Keep the splash screen visible while we prepare the app
SplashScreen.preventAutoHideAsync();

// Optional: Ignore specific warnings
LogBox.ignoreLogs([
    'Require cycle:',
]);

// ExpoRouter entry point
const App = () => {
    const [appIsReady, setAppIsReady] = useState(false);
    const ctx = require.context('./app'); // Auto-import all routes from app/

    useEffect(() => {
        async function prepare() {
            try {
                // You can add any initialization logic here
                // For now, we'll just wait 2 seconds to show the splash screen
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (e) {
                console.warn(e);
            } finally {
                // Tell the application to render
                setAppIsReady(true);
                // Hide the default splash screen
                SplashScreen.hideAsync();
            }
        }

        prepare();
    }, []);

    // Show custom splash screen while app is loading
    if (!appIsReady) {
        return (
            <View className='flex-1 justify-center items-center bg-white'>
                <Image
                    source={require('./assets/branding/tezmaths-full-logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
                <Text className="text-custom-purple text-center text-base mt-3 italic leading-6">Best for Bank, SSC, Railway & All Competitive Exams</Text>
            </View>
        );
    }

    // Show the main app when ready
    return <ExpoRoot context={ctx} />;
};

const styles = StyleSheet.create({
    logo: {
        width: 150,
        marginBottom: 20,
    },
});

registerRootComponent(App);
