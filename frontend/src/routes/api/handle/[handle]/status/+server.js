import { json } from '@sveltejs/kit';

// Mock handle status for development
// In production, this would query the signaling server or database
export async function GET({ params }) {
  const { handle } = params;
  
  if (!handle) {
    return json({ error: 'Handle is required' }, { status: 400 });
  }

  try {
    // For now, return a mock response
    // In production, this would connect to your signaling server
    // to get real-time handle state
    const mockHandleState = {
      handle: handle,
      devices: {
        android: {
          online: Math.random() > 0.5, // Random for demo
          fcmToken: 'mock-fcm-token',
          socketConnected: Math.random() > 0.7,
          lastActivity: new Date(Date.now() - Math.random() * 300000) // Last 5 minutes
        },
        web: {
          online: Math.random() > 0.3,
          socketConnected: Math.random() > 0.5,
          lastActivity: new Date(Date.now() - Math.random() * 600000) // Last 10 minutes
        }
      },
      callState: {
        status: Math.random() > 0.8 ? 'busy' : 'available',
        currentCallId: Math.random() > 0.8 ? 'call-' + Date.now() : undefined,
        acceptedBy: Math.random() > 0.5 ? 'android' : 'web'
      },
      lastUpdated: new Date()
    };

    // If handle is busy, remove devices that aren't handling the call
    if (mockHandleState.callState.status === 'busy' && mockHandleState.callState.acceptedBy) {
      const activeDevice = mockHandleState.callState.acceptedBy;
      Object.keys(mockHandleState.devices).forEach(deviceType => {
        if (deviceType !== activeDevice) {
          if (mockHandleState.devices[deviceType]) {
            mockHandleState.devices[deviceType].online = false;
          }
        }
      });
    }

    return json(mockHandleState);
    
  } catch (error) {
    console.error('Error fetching handle status:', error);
    return json({ error: 'Failed to fetch handle status' }, { status: 500 });
  }
}

// TODO: In production, implement these methods:
// 1. Connect to signaling server to get real handle state
// 2. Query handle device registry
// 3. Return current call state and device availability
// 4. Add caching to reduce signaling server load
//
// Example production implementation:
/*
import { SIGNALING_SERVER_URL } from '$env/static/private';
import { io } from 'socket.io-client';

export async function GET({ params }) {
  const { handle } = params;
  
  try {
    // Connect to signaling server
    const socket = io(SIGNALING_SERVER_URL);
    
    // Request handle state
    const handleState = await new Promise((resolve, reject) => {
      socket.emit('request_handle_state', { handle });
      
      socket.on('sync_handle_state', (data) => {
        if (data.handle === handle) {
          resolve(data);
        }
      });
      
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    socket.disconnect();
    return json(handleState);
    
  } catch (error) {
    return json({ error: 'Handle not found or unavailable' }, { status: 404 });
  }
}
*/