import { useAuth } from "@clerk/clerk-expo";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

export default function InitialLayout() {
    const {isLoaded, isSignedIn} = useAuth();

    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if(!isLoaded) return;

        const inAuthScreen = segments[0] === "(auth)";
        
        // If user not signed in and not in auth screen, redirect to login
        if(!isSignedIn && !inAuthScreen) router.replace("/(auth)/login");
        else if(isSignedIn && inAuthScreen) router.replace("/(tabs)/scan");
    }, [isLoaded, isSignedIn, segments]);

    if(!isLoaded) return null;

    // If user is signed in, show the current screen
    return <Stack screenOptions={{ headerShown: false }} />;
}