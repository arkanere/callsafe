export function generateUUID(): string {
  console.log('[UUID UTIL] Generating new UUID');
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  console.log('[UUID UTIL] Generated UUID:', uuid);
  return uuid;
}

export function generateDeviceId(): string {
  console.log('[UUID UTIL] Getting or generating device ID');
  // Generate a persistent device ID for this browser session
  let deviceId = localStorage.getItem('callsafe_device_id');
  
  if (!deviceId) {
    console.log('[UUID UTIL] No existing device ID found, generating new one');
    deviceId = generateUUID();
    localStorage.setItem('callsafe_device_id', deviceId);
    console.log('[UUID UTIL] New device ID stored in localStorage:', deviceId);
  } else {
    console.log('[UUID UTIL] Retrieved existing device ID from localStorage:', deviceId);
  }
  
  return deviceId;
}