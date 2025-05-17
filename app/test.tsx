import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export default function RegisterScreen() {
    const [agreeToTerms, setAgreeToTerms] = useState(false);

    return (
        <View style={{ alignItems: 'center', marginTop: 50 }}>
            <Text>Testing Custom CheckBox</Text>
            <TouchableOpacity
                onPress={() => setAgreeToTerms(!agreeToTerms)}
                style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: '#333',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginVertical: 10,
                }}
            >
                {agreeToTerms ? (
                    <View
                        style={{
                            width: 12,
                            height: 12,
                            backgroundColor: '#333',
                        }}
                    />
                ) : null}
            </TouchableOpacity>
            <Text>{agreeToTerms ? "Checked" : "Unchecked"}</Text>
        </View>
    );
}
