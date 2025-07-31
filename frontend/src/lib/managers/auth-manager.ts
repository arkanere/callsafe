import { goto } from '$app/navigation';

export interface LoginResponse {
  token: string;
  user: {
    email: string;
    handle: string;
    sourceId: string;
  };
  expiresAt: number;
}

export class AuthManager {
  private static JWT_KEY = 'callsafe_jwt';
  private static REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  static async login(email: string, password: string): Promise<LoginResponse> {
    console.log('[AUTH MANAGER] Login attempt for email:', email);
    
    console.log('[AUTH MANAGER] Sending login request to /api/login');
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    console.log('[AUTH MANAGER] Login response status:', response.status);
    if (!response.ok) {
      console.error('[AUTH MANAGER] Login failed with status:', response.status);
      throw new Error('Login failed');
    }

    const data = await response.json();
    console.log('[AUTH MANAGER] Login response data:', { ...data, token: '[REDACTED]' });

    console.log('[AUTH MANAGER] Storing JWT token in localStorage');
    // Store JWT
    localStorage.setItem(this.JWT_KEY, data.token);

    console.log('[AUTH MANAGER] Decoding JWT token');
    // Decode token to get expiration
    const payload = this.decodeJWT(data.token);
    console.log('[AUTH MANAGER] JWT payload:', payload);

    const loginResponse = {
      token: data.token,
      user: {
        email: payload.email,
        handle: payload.handle,
        sourceId: payload.sourceId
      },
      expiresAt: payload.exp * 1000
    };
    console.log('[AUTH MANAGER] Login successful, returning:', { ...loginResponse, token: '[REDACTED]' });
    return loginResponse;
  }

  static getToken(): string | null {
    const token = localStorage.getItem(this.JWT_KEY);
    console.log('[AUTH MANAGER] Getting token from localStorage:', token ? 'token present' : 'no token');
    return token;
  }

  static isTokenValid(): boolean {
    console.log('[AUTH MANAGER] Checking token validity');
    const token = this.getToken();
    if (!token) {
      console.log('[AUTH MANAGER] No token found, returning false');
      return false;
    }

    try {
      const payload = this.decodeJWT(token);
      const isValid = Date.now() < payload.exp * 1000;
      const expiresAt = new Date(payload.exp * 1000);
      console.log('[AUTH MANAGER] Token validity check:', { isValid, expiresAt });
      return isValid;
    } catch (error) {
      console.error('[AUTH MANAGER] Error decoding token:', error);
      return false;
    }
  }

  static shouldRefreshToken(): boolean {
    console.log('[AUTH MANAGER] Checking if token should be refreshed');
    const token = this.getToken();
    if (!token) {
      console.log('[AUTH MANAGER] No token found, refresh not needed');
      return false;
    }

    try {
      const payload = this.decodeJWT(token);
      const expiresIn = payload.exp * 1000 - Date.now();
      const shouldRefresh = expiresIn < this.REFRESH_THRESHOLD;
      console.log('[AUTH MANAGER] Token refresh check:', { expiresIn, shouldRefresh, threshold: this.REFRESH_THRESHOLD });
      return shouldRefresh;
    } catch (error) {
      console.error('[AUTH MANAGER] Error checking refresh need:', error);
      return false;
    }
  }

  static async refreshToken(): Promise<string> {
    console.log('[AUTH MANAGER] Refreshing token');
    
    const currentToken = this.getToken();
    console.log('[AUTH MANAGER] Sending refresh request with current token');
    
    const response = await fetch('/api/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`
      }
    });
    
    console.log('[AUTH MANAGER] Refresh response status:', response.status);
    if (!response.ok) {
      console.error('[AUTH MANAGER] Token refresh failed with status:', response.status);
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    console.log('[AUTH MANAGER] Refresh response received');
    
    console.log('[AUTH MANAGER] Storing new token in localStorage');
    localStorage.setItem(this.JWT_KEY, data.token);
    
    console.log('[AUTH MANAGER] Token refresh completed successfully');
    return data.token;
  }

  static logout(): void {
    console.log('[AUTH MANAGER] Logout initiated');
    console.log('[AUTH MANAGER] Removing token from localStorage');
    localStorage.removeItem(this.JWT_KEY);
    console.log('[AUTH MANAGER] Redirecting to home page');
    goto('/');
  }

  static getUserFromToken(): any {
    console.log('[AUTH MANAGER] Getting user data from token');
    const token = this.getToken();
    if (!token) {
      console.log('[AUTH MANAGER] No token found, returning null');
      return null;
    }

    try {
      const userData = this.decodeJWT(token);
      console.log('[AUTH MANAGER] User data decoded from token:', userData);
      return userData;
    } catch (error) {
      console.error('[AUTH MANAGER] Error decoding user data from token:', error);
      return null;
    }
  }

  private static decodeJWT(token: string): any {
    console.log('[AUTH MANAGER] Decoding JWT token');
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      console.log('[AUTH MANAGER] JWT decoded successfully');
      return decoded;
    } catch (error) {
      console.error('[AUTH MANAGER] JWT decode error:', error);
      throw error;
    }
  }
}