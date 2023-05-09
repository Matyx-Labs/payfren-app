import {useRouter, useSegments} from 'expo-router';
import {createContext, useContext, useEffect, useState} from 'react';
import supabase from '../lib/supabase';
import NetInfo from '@react-native-community/netinfo';

const AuthContext = createContext(null);

export function useAuth() {
    return useContext(AuthContext);
}

function useProtectedRoute(user, isLoading, isOffline) {
    const segments = useSegments();
    const router = useRouter();
    useEffect(() => {
        if (!isLoading) {
            if (isOffline) {
                router.replace('/network-error');
            } else {
                const inAuthGroup = segments[0] === '(auth)';
                const onNetworkError = segments[0] === 'network-error';
                if (user && (inAuthGroup || onNetworkError)) {
                    router.replace('/home');
                } else if (!user && !inAuthGroup) {
                    router.replace('/');
                }
            }
        }
    }, [user, segments, isLoading, isOffline, router]);
}

function useNetworkStatus() {
    const [isOffline, setOfflineStatus] = useState(false);

    useEffect(() => {
        const removeNetInfoSubscription = NetInfo.addEventListener((state) => {
            const offline = !(state.isConnected && state.isInternetReachable);
            setOfflineStatus(offline);
        });

        return () => {
            removeNetInfoSubscription();
        };
    }, []);

    return isOffline;
}

function useAuthLogic(isOffline) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(!isOffline);

    const fetchSession = async () => {
        if (isOffline) {
            return;
        }
        try {
            setIsLoading(true);
            // Verify that if there is a session, its user is still valid
            const {data: session} = await supabase.auth.getUser();
            setUser(session?.user);
        } catch (error) {
            console.error('Error fetching session:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const subscribeToAuthChanges = () => {
            supabase.auth.onAuthStateChange(async (event, session) => {
                // Avoid setting a session of a deleted user, let getUser() handle it
                if (event != 'INITIAL_SESSION') {
                    setUser(session?.user);
                }
            });
        };

        const initializeAuth = async () => {
            await fetchSession();
            return subscribeToAuthChanges();
        };

        let authListener;
        initializeAuth()
            .then((listener) => {
                authListener = listener;
            })
            .catch((error) => {
                console.error('Error initializing authentication:', error);
            });

        return () => {
            authListener?.subscription.unsubscribe();
        };
    }, [isOffline]);

    return {user, isLoading};
}


export function AuthProvider(props) {
    const isOffline = useNetworkStatus();
    const {user, isLoading} = useAuthLogic(isOffline);
    useProtectedRoute(user, isLoading, isOffline);

    return (
        <AuthContext.Provider value={{user, isLoading}}>
            {props.children}
        </AuthContext.Provider>
    );
}
