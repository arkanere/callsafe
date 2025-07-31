export interface CallSafeError {
  type: 'connection' | 'webrtc' | 'media' | 'auth' | 'validation' | 'timeout';
  message: string;
  code?: string;
  retryable: boolean;
}

export class ErrorHandler {
  static createError(type: CallSafeError['type'], message: string, code?: string, retryable = true): CallSafeError {
    const error = {
      type,
      message,
      code,
      retryable
    };
    console.log('[ERROR HANDLER] Created error:', error);
    return error;
  }

  static handleConnectionError(error: any): CallSafeError {
    console.error('[ERROR HANDLER] Handling connection error:', error);
    
    if (error.type === 'TransportError') {
      console.log('[ERROR HANDLER] Transport error detected');
      return this.createError('connection', 'Failed to connect to server. Please check your internet connection.', 'TRANSPORT_ERROR');
    }
    
    if (error.message?.includes('Authentication')) {
      console.log('[ERROR HANDLER] Authentication error detected');
      return this.createError('auth', 'Authentication failed. Please login again.', 'AUTH_ERROR', false);
    }
    
    console.log('[ERROR HANDLER] Generic connection error');
    return this.createError('connection', 'Connection failed. Please try again.', 'CONNECTION_ERROR');
  }

  static handleWebRTCError(error: any): CallSafeError {
    console.error('[ERROR HANDLER] Handling WebRTC error:', error);
    
    if (error.name === 'OverconstrainedError') {
      console.log('[ERROR HANDLER] Overconstrained error detected');
      return this.createError('webrtc', 'Your device does not support the required audio settings.', 'OVERCONSTRAINED', false);
    }
    
    if (error.name === 'NotAllowedError') {
      console.log('[ERROR HANDLER] Not allowed error detected (media access denied)');
      return this.createError('media', 'Microphone access denied. Please allow microphone access and try again.', 'NOT_ALLOWED', false);
    }
    
    if (error.name === 'NotFoundError') {
      console.log('[ERROR HANDLER] Not found error detected (no microphone)');
      return this.createError('media', 'No microphone found. Please connect a microphone and try again.', 'NOT_FOUND', false);
    }
    
    console.log('[ERROR HANDLER] Generic WebRTC error');
    return this.createError('webrtc', 'Failed to establish connection. Please try again.', 'WEBRTC_ERROR');
  }

  static handleMediaError(error: any): CallSafeError {
    console.error('[ERROR HANDLER] Handling media error:', error);
    
    if (error.name === 'NotAllowedError') {
      console.log('[ERROR HANDLER] Media not allowed error detected');
      return this.createError('media', 'Please allow microphone access to make calls.', 'MEDIA_NOT_ALLOWED', false);
    }
    
    if (error.name === 'NotFoundError') {
      console.log('[ERROR HANDLER] Media not found error detected');
      return this.createError('media', 'No microphone found. Please connect a microphone.', 'MEDIA_NOT_FOUND', false);
    }
    
    if (error.name === 'NotReadableError') {
      console.log('[ERROR HANDLER] Media not readable error detected');
      return this.createError('media', 'Microphone is being used by another application.', 'MEDIA_NOT_READABLE', true);
    }
    
    console.log('[ERROR HANDLER] Generic media error');
    return this.createError('media', 'Failed to access microphone. Please try again.', 'MEDIA_ERROR');
  }

  static handleAuthError(error: any): CallSafeError {
    console.error('[ERROR HANDLER] Handling auth error:', error);
    
    if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
      console.log('[ERROR HANDLER] 401/Unauthorized error detected');
      return this.createError('auth', 'Session expired. Please login again.', 'SESSION_EXPIRED', false);
    }
    
    if (error.message?.includes('403') || error.message?.includes('Forbidden')) {
      console.log('[ERROR HANDLER] 403/Forbidden error detected');
      return this.createError('auth', 'Access denied. Please check your permissions.', 'ACCESS_DENIED', false);
    }
    
    console.log('[ERROR HANDLER] Generic auth error');
    return this.createError('auth', 'Authentication failed. Please try again.', 'AUTH_ERROR');
  }

  static handleTimeoutError(context: string): CallSafeError {
    console.log('[ERROR HANDLER] Handling timeout error for context:', context);
    return this.createError('timeout', `${context} timed out. Please try again.`, 'TIMEOUT_ERROR');
  }

  static formatErrorForUser(error: CallSafeError): string {
    console.log('[ERROR HANDLER] Formatting error for user:', error);
    return error.message;
  }

  static shouldRetry(error: CallSafeError): boolean {
    const shouldRetry = error.retryable;
    console.log('[ERROR HANDLER] Should retry error:', shouldRetry, 'for error:', error);
    return shouldRetry;
  }

  static getErrorCategory(error: CallSafeError): 'critical' | 'recoverable' | 'user_action' {
    console.log('[ERROR HANDLER] Getting error category for:', error);
    
    let category: 'critical' | 'recoverable' | 'user_action';
    switch (error.type) {
      case 'auth':
        category = 'user_action';
        break;
      case 'media':
        category = error.code === 'MEDIA_NOT_ALLOWED' ? 'user_action' : 'critical';
        break;
      case 'webrtc':
        category = error.retryable ? 'recoverable' : 'critical';
        break;
      case 'connection':
        category = 'recoverable';
        break;
      case 'timeout':
        category = 'recoverable';
        break;
      default:
        category = 'recoverable';
        break;
    }
    
    console.log('[ERROR HANDLER] Error category determined:', category);
    return category;
  }
}