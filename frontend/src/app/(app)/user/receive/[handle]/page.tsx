'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { MessageTypes, PROTOCOL_VERSION, MediaToggleAction } from '@callsafe/protocol';
import { AuthManager } from '$lib/managers/auth-manager';
import { ConnectionManager } from '$lib/managers/connection-manager';
import { WebRTCManager } from '$lib/managers/webrtc-manager';
import { WsTransport } from '$lib/transport/ws-transport';
import { generateDeviceId } from '$lib/utils/uuid';
import type { CallRecord } from '$lib/types/call-state';

// Direct port of (layout-2)/user/receive/[handle]/+page.svelte.
//
// The deleted `callState` store (D1) is inlined: only `currentCall` was ever read
// back (via getCurrentCall()), so it lives in a ref; every `ui.*` field the store
// carried was written and never read anywhere, so those writes are gone.

type IncomingCall = {
	callId: string;
	sourceId: string;
	callType: 'voice' | 'video';
	timestamp: number;
};

type CurrentCall = {
	callAttemptId: string;
	sourceId: string;
	callType: 'voice' | 'video';
	state: 'incoming' | 'connected' | 'ended';
	startTime: number;
	duration: number;
};

type CallHistoryRecord = CallRecord & { endedBy?: string };

// Replaces the Svelte `attachStream` action. A fresh mount (the 'active' branch
// re-creating the <video> after remote tracks already arrived) re-attaches the
// stream held in component state via the effect below.
function VideoStream({
	stream,
	onAutoplayBlocked,
	...props
}: {
	stream: MediaStream | null;
	onAutoplayBlocked: () => void;
} & React.VideoHTMLAttributes<HTMLVideoElement>) {
	const nodeRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const node = nodeRef.current;
		if (!node) return;
		if (node.srcObject !== stream) {
			node.srcObject = stream;
			if (stream)
				node.play().catch(() => {
					onAutoplayBlocked();
				});
		}
	}, [stream, onAutoplayBlocked]);

	return <video ref={nodeRef} {...props} />;
}

export default function ReceivePage() {
	const router = useRouter();

	// Extract parameters
	const handle = (useParams<{ handle: string }>().handle as string) || '';
	const sourceId = useSearchParams().get('sourceId') || '';

	// Connection management
	const connectionManagerRef = useRef<ConnectionManager | null>(null);
	const webrtcManagerRef = useRef<WebRTCManager | null>(null);
	const socketRef = useRef<WsTransport | null>(null);
	const [socketConnected, setSocketConnected] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [connectionStatus, setConnectionStatus] = useState('Disconnected');

	// Call state
	const [isOnline, setIsOnline] = useState(false);
	const [incomingCalls, setIncomingCalls] = useState<IncomingCall[]>([]);
	const [callHistory, setCallHistory] = useState<CallHistoryRecord[]>([]);
	const callHistoryRef = useRef<CallHistoryRecord[]>([]);
	const currentCallStartTimeRef = useRef<number | null>(null);
	const [callDuration, setCallDuration] = useState(0);
	const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// The one field of the old `callState` store that was ever read back.
	const currentCallRef = useRef<CurrentCall | null>(null);

	// UI state
	const [currentPhase, setCurrentPhase] = useState('terminated');
	const [currentCallType, setCurrentCallType] = useState<'voice' | 'video'>('voice');
	const [isMuted, setIsMuted] = useState(false);
	const [isCameraEnabled, setIsCameraEnabled] = useState(true);
	const [autoplayBlocked, setAutoplayBlocked] = useState(false);

	// Streams held in state so the video elements re-bind whenever React
	// recreates them on phase transitions (the 'active' branch mounts a fresh
	// <video> after remote tracks have already arrived during 'connecting').
	const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
	const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);

	const markAutoplayBlocked = useCallback(() => {
		setAutoplayBlocked(true);
	}, []);

	useEffect(() => {
		(async () => {
			const isAuthenticated = await AuthManager.isAuthenticated();
			if (!isAuthenticated) {
				router.push('/');
				return;
			}

			loadCallHistory();
			await initializeConnection();
		})();

		return () => {
			cleanup();
		};
		// Empty deps on purpose: parity with onMount/onDestroy, this runs exactly once.
	}, []);

	async function initializeConnection() {
		try {
			connectionManagerRef.current = new ConnectionManager();
			socketRef.current = await connectionManagerRef.current.connect();

			setSocketConnected(true);
			setConnectionStatus('Connected');
			setErrorMessage('');

			// Request microphone permission (enables audio autoplay)
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true
					},
					video: false
				});

				stream.getTracks().forEach((track) => track.stop());

				console.log(
					'[CONNECTION] initializeConnection(): Microphone permission granted - audio autoplay enabled'
				);
			} catch (micError) {
				console.warn(
					'[CONNECTION] initializeConnection(): Microphone permission denied:',
					micError
				);
				setErrorMessage(
					'Microphone access required for calls. Please refresh and allow microphone access.'
				);
			}

			setupSocketEventHandlers();
			await registerDevice();
		} catch (error) {
			console.error('[CONNECTION] initializeConnection(): Connection failed:', error);
			setErrorMessage('Failed to connect to server');
			setSocketConnected(false);
			setConnectionStatus('Failed');
		}
	}

	function setupSocketEventHandlers() {
		const socket = socketRef.current;
		if (!socket) return;

		// Incoming call handler
		socket.on(MessageTypes.CALL_INCOMING, (raw) => {
			const data = raw as unknown as {
				callAttemptId: string;
				sourceId: string;
				callType?: string;
				timestamp: number;
			};
			console.log('[CONNECTION] setupSocketEventHandlers(): Incoming call:', data);

			const incomingCallType = (data.callType === 'video' ? 'video' : 'voice') as 'voice' | 'video';

			setIncomingCalls((calls) => [
				...calls,
				{
					callId: data.callAttemptId,
					sourceId: data.sourceId,
					callType: incomingCallType,
					timestamp: data.timestamp
				}
			]);

			playIncomingCallSound();

			currentCallRef.current = {
				callAttemptId: data.callAttemptId,
				sourceId: data.sourceId,
				callType: incomingCallType,
				state: 'incoming',
				startTime: data.timestamp,
				duration: 0
			};
		});

		// Call accepted handler
		socket.on(MessageTypes.CALL_ACCEPTED, async () => {
			console.log('[CONNECTION] setupSocketEventHandlers(): Call accepted');
			setCurrentPhase('connecting');
		});

		// WebRTC offer handler (agent receives offer from customer)
		socket.on(MessageTypes.WEBRTC_OFFER, async (raw) => {
			const data = raw as unknown as { offer: RTCSessionDescription; callAttemptId: string };
			console.log('[CONNECTION] setupSocketEventHandlers(): Received WebRTC offer');

			if (webrtcManagerRef.current) {
				try {
					await webrtcManagerRef.current.createAnswer(data.offer, data.callAttemptId);

					setCurrentPhase('active');
					startCallTimer();

					if (currentCallRef.current) {
						currentCallRef.current = { ...currentCallRef.current, state: 'connected' };
					}
				} catch (error) {
					console.error(
						'[CONNECTION] setupSocketEventHandlers(): Failed to create WebRTC answer:',
						error
					);
					handleCallFailure('Failed to establish connection');
				}
			} else {
				console.error(
					'[CONNECTION] setupSocketEventHandlers(): WebRTC manager not initialized when receiving offer'
				);
				handleCallFailure('Failed to establish connection');
			}
		});

		// WebRTC answer handler
		socket.on(MessageTypes.WEBRTC_ANSWER, async (raw) => {
			const data = raw as unknown as { answer: RTCSessionDescription; callAttemptId: string };
			console.log('[CONNECTION] setupSocketEventHandlers(): Received WebRTC answer');

			if (webrtcManagerRef.current) {
				try {
					await webrtcManagerRef.current.setRemoteDescription(data.answer);
					setCurrentPhase('active');
					startCallTimer();
				} catch (error) {
					console.error(
						'[CONNECTION] setupSocketEventHandlers(): WebRTC set remote description failed:',
						error
					);
					handleCallFailure('Failed to establish connection');
				}
			}
		});

		// ICE candidate handler
		socket.on(MessageTypes.WEBRTC_ICE_CANDIDATE, async (raw) => {
			const data = raw as unknown as { candidate: RTCIceCandidate; callAttemptId: string };
			if (webrtcManagerRef.current) {
				try {
					await webrtcManagerRef.current.addIceCandidate(data.candidate);
				} catch (error) {
					console.error(
						'[CONNECTION] setupSocketEventHandlers(): Failed to add ICE candidate:',
						error
					);
				}
			}
		});

		// Call ended handler
		socket.on(MessageTypes.CALL_ENDED, (raw) => {
			const data = raw as unknown as {
				callAttemptId: string;
				timestamp: number;
				duration: number;
				reason: string;
				endedBy: string;
			};
			console.log('[CONNECTION] setupSocketEventHandlers(): Call ended:', data);

			saveCallToHistory({
				callAttemptId: data.callAttemptId,
				sourceId: getCurrentCall()?.sourceId || 'unknown',
				startTime: currentCallStartTimeRef.current || data.timestamp,
				endTime: data.timestamp,
				duration: data.duration,
				endedBy: data.endedBy,
				device: 'web',
				status: 'completed'
			});

			resetCallUI();
		});

		// Call failed handler
		socket.on(MessageTypes.CALL_FAILED, (raw) => {
			const data = raw as unknown as { reason?: string };
			console.log('[CONNECTION] setupSocketEventHandlers(): Call failed:', data);

			let msg = 'Call connection failed. Please try again.';
			switch (data.reason) {
				case 'media_permission_denied':
					msg = 'The other party could not access their microphone or camera.';
					break;
				case 'peer_disconnected':
					msg = 'The other party lost their connection.';
					break;
				case 'connection_failed':
				case 'internal_error':
				default:
					break;
			}

			// The call is already terminal server-side — reset locally without
			// echoing call:end back.
			setErrorMessage(msg);
			setTimeout(() => {
				resetCallUI();
				setErrorMessage('');
			}, 3000);
		});

		// Call timeout handler (terminal: ringing or connecting phase expired server-side)
		socket.on(MessageTypes.CALL_TIMEOUT, (raw) => {
			const data = raw as unknown as {
				callAttemptId: string;
				phase: string;
				timeoutDuration: number;
				timestamp: number;
			};
			console.log('[CONNECTION] setupSocketEventHandlers(): Call timeout:', data);

			if (data.phase === 'ringing') {
				stopIncomingCallSound();
				setIncomingCalls((calls) => calls.filter((call) => call.callId !== data.callAttemptId));
				if (currentCallRef.current?.callAttemptId === data.callAttemptId) {
					currentCallRef.current = null;
				}
			} else {
				resetCallUI();
			}

			setErrorMessage('Call timed out');
			setTimeout(() => {
				setErrorMessage('');
			}, 3000);
		});

		// Call cancelled handler
		socket.on(MessageTypes.CALL_CANCELLED, (raw) => {
			const data = raw as unknown as { callAttemptId: string; reason: string };
			console.log('[CONNECTION] setupSocketEventHandlers(): Call cancelled:', data);

			stopIncomingCallSound();
			setIncomingCalls((calls) => calls.filter((call) => call.callId !== data.callAttemptId));

			let statusMessage = '';
			switch (data.reason) {
				case 'cancelled_by_caller':
					statusMessage = 'Customer cancelled the call';
					break;
				case 'answered_elsewhere':
					statusMessage = 'Call answered on another device';
					break;
				default:
					statusMessage = 'Call was cancelled';
			}

			if (webrtcManagerRef.current) {
				webrtcManagerRef.current.cleanup();
				webrtcManagerRef.current = null;
			}
			setRemoteVideoStream(null);
			setLocalVideoStream(null);

			if (currentCallRef.current?.callAttemptId === data.callAttemptId) {
				currentCallRef.current = null;
			}

			if (data.reason !== 'answered_elsewhere') {
				setErrorMessage(statusMessage);
				setTimeout(() => {
					setErrorMessage('');
				}, 3000);
			}

			setTimeout(() => {
				setCurrentPhase('terminated');
				setCurrentCallType('voice');
				setIsCameraEnabled(true);
				currentCallStartTimeRef.current = null;
				setCallDuration(0);
				setIsMuted(false);

				if (durationIntervalRef.current) {
					clearInterval(durationIntervalRef.current);
					durationIntervalRef.current = null;
				}
			}, 1000);
		});

		// Connection lifecycle events
		socket.on('open', (data) => {
			setSocketConnected(true);
			setConnectionStatus('Connected');
			setErrorMessage('');

			// The transport re-opened a fresh socket: the server no longer knows us,
			// so the device:connect handshake must be redone with a fresh token.
			if (data.reconnected) {
				registerDevice();
			}
		});

		socket.on('close', () => {
			setSocketConnected(false);
			setConnectionStatus('Disconnected');
			setIsOnline(false);
		});
	}

	async function registerDevice() {
		const socket = socketRef.current;
		if (!socket) return;

		const deviceId = generateDeviceId();

		// The signaling server enforces deviceId == token.device_id, so the
		// token must be minted for this device.
		const tokenResponse = await fetch(`/api/socket-token?deviceId=${deviceId}`, {
			credentials: 'include'
		});
		if (!tokenResponse.ok) {
			console.error('[CONNECTION] registerDevice(): Failed to get auth token');
			setErrorMessage('Authentication failed. Please refresh the page.');
			return;
		}
		const { token } = await tokenResponse.json();

		socket.emit(MessageTypes.DEVICE_CONNECT, {
			deviceType: 'web',
			deviceId,
			protocolVersion: PROTOCOL_VERSION,
			token,
			timestamp: Date.now()
		});

		try {
			await socket.waitFor(MessageTypes.DEVICE_CONNECTED);
		} catch (error) {
			console.error('[CONNECTION] registerDevice(): device:connect handshake failed:', error);
			setErrorMessage('Authentication failed. Please refresh the page.');
			return;
		}

		socket.emit(MessageTypes.DEVICE_STATUS, {
			status: 'available',
			timestamp: Date.now()
		});

		setIsOnline(true);
		setConnectionStatus('Online - Waiting for calls');
	}

	function toggleOnlineStatus() {
		const socket = socketRef.current;
		if (!handle || !socket) {
			setErrorMessage('No handle specified or not connected');
			return;
		}

		const newStatus = !isOnline;

		socket.emit(MessageTypes.DEVICE_STATUS, {
			status: newStatus ? 'available' : 'unavailable',
			timestamp: Date.now()
		});

		setIsOnline(newStatus);
		setConnectionStatus(newStatus ? 'Online - Waiting for calls' : 'Connected');
		setErrorMessage('');
	}

	async function acceptCall(callId: string, callType: 'voice' | 'video' = 'voice') {
		const socket = socketRef.current;
		if (!socket) return;

		setCurrentPhase('connecting');
		setCurrentCallType(callType);
		setIsCameraEnabled(true);

		try {
			const webrtcManager = new WebRTCManager(socket);
			webrtcManagerRef.current = webrtcManager;
			webrtcManager.onAutoplayBlocked = () => {
				setAutoplayBlocked(true);
			};
			// For video calls, route streams through component state (VideoStream
			// component) — the manager's default DOM query runs while the 'active'
			// branch (and its <video> elements) doesn't exist yet.
			if (callType === 'video') {
				webrtcManager.onRemoteStream = (stream) => {
					setRemoteVideoStream(stream);
				};
			}
			await webrtcManager.initialize(callId, callType);
			if (callType === 'video') {
				setLocalVideoStream(webrtcManager.getLocalStream());
			}
		} catch (error) {
			console.error('[CONNECTION] acceptCall(): WebRTC initialization failed:', error);
			handleCallFailure(
				callType === 'video' ? 'Failed to initialize camera/audio' : 'Failed to initialize audio'
			);
			return;
		}

		socket.emit(MessageTypes.CALL_ACCEPT, {
			callAttemptId: callId,
			mediaCapabilities: {
				canSend: callType === 'video' ? ['audio', 'video'] : ['audio'],
				canReceive: callType === 'video' ? ['audio', 'video'] : ['audio']
			},
			timestamp: Date.now()
		});

		setIncomingCalls((calls) => calls.filter((call) => call.callId !== callId));
		stopIncomingCallSound();
		currentCallStartTimeRef.current = Date.now();
	}

	function declineCall(callId: string) {
		const socket = socketRef.current;
		if (!socket) return;

		socket.emit(MessageTypes.CALL_REJECT, {
			callAttemptId: callId,
			timestamp: Date.now()
		});

		setIncomingCalls((calls) => calls.filter((call) => call.callId !== callId));
		stopIncomingCallSound();
	}

	function endCall() {
		const socket = socketRef.current;
		if (getCurrentCall() && socket) {
			socket.emit(MessageTypes.CALL_END, {
				callAttemptId: getCurrentCall()?.callAttemptId,
				timestamp: Date.now()
			});
		}

		resetCallUI();
	}

	// Local-only teardown: safe to run when the call already terminated
	// server-side (call:ended, call:timeout) without echoing call:end back.
	function resetCallUI() {
		stopIncomingCallSound();
		setIncomingCalls([]);
		setRemoteVideoStream(null);
		setLocalVideoStream(null);

		if (webrtcManagerRef.current) {
			webrtcManagerRef.current.cleanup();
			webrtcManagerRef.current = null;
		}

		if (durationIntervalRef.current) {
			clearInterval(durationIntervalRef.current);
			durationIntervalRef.current = null;
		}

		setCurrentPhase('terminated');
		setCurrentCallType('voice');
		setIsCameraEnabled(true);
		currentCallStartTimeRef.current = null;
		setCallDuration(0);
		setIsMuted(false);

		currentCallRef.current = null;
	}

	function resumeAutoplay() {
		webrtcManagerRef.current?.resumePlayback();
		setAutoplayBlocked(false);
	}

	function toggleMute() {
		if (!webrtcManagerRef.current) return;

		setIsMuted(webrtcManagerRef.current.toggleMute());
	}

	function toggleCamera() {
		const socket = socketRef.current;
		if (!webrtcManagerRef.current || currentCallType !== 'video') return;

		const isDisabled = webrtcManagerRef.current.toggleCamera();
		setIsCameraEnabled(!isDisabled);

		if (socket && getCurrentCall()) {
			socket.emit(MessageTypes.MEDIA_TOGGLE, {
				callAttemptId: getCurrentCall()!.callAttemptId,
				action: isDisabled ? MediaToggleAction.DISABLE_CAMERA : MediaToggleAction.ENABLE_CAMERA,
				timestamp: Date.now()
			});
		}
	}

	function getCurrentCall() {
		return currentCallRef.current;
	}

	function handleCallFailure(message: string) {
		setErrorMessage(message);

		if (webrtcManagerRef.current) {
			webrtcManagerRef.current.cleanup();
			webrtcManagerRef.current = null;
		}

		setTimeout(() => {
			endCall();
			setErrorMessage('');
		}, 3000);
	}

	function startCallTimer() {
		if (durationIntervalRef.current) return;

		durationIntervalRef.current = setInterval(() => {
			if (currentCallStartTimeRef.current) {
				setCallDuration(Math.floor((Date.now() - currentCallStartTimeRef.current) / 1000));
			}
		}, 1000);
	}

	function playIncomingCallSound() {
		if (typeof document === 'undefined') return;

		const audioElement = document.querySelector(
			'audio[src="/ringtone.mp3"]'
		) as HTMLAudioElement | null;
		if (audioElement) {
			audioElement.loop = true;
			audioElement.play().catch((error) => {
				console.log('[CONNECTION] playIncomingCallSound(): Could not play ringtone:', error);
				if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
					new Notification('Incoming Call', {
						body: 'You have an incoming call',
						icon: '/favicon.svg'
					});
				}
			});
		}
	}

	function saveCallToHistory(callRecord: CallHistoryRecord) {
		const next = [callRecord, ...callHistoryRef.current.slice(0, 49)];
		callHistoryRef.current = next;
		setCallHistory(next);
		localStorage.setItem(`callsafe_history_${handle}`, JSON.stringify(next));
	}

	function stopIncomingCallSound() {
		if (typeof document === 'undefined') return;

		const audioElement = document.querySelector(
			'audio[src="/ringtone.mp3"]'
		) as HTMLAudioElement | null;
		if (audioElement) {
			audioElement.pause();
			audioElement.currentTime = 0;
			audioElement.loop = false;
		}
	}

	function loadCallHistory() {
		try {
			const saved = localStorage.getItem(`callsafe_history_${handle}`);
			if (saved) {
				callHistoryRef.current = JSON.parse(saved);
				setCallHistory(callHistoryRef.current);
			}
		} catch (error) {
			console.error('[CONNECTION] loadCallHistory(): Failed to load call history:', error);
		}
	}

	function formatDuration(seconds: number) {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'Connected':
				return 'text-green-600';
			case 'Online - Waiting for calls':
				return 'text-green-600';
			case 'Disconnected':
				return 'text-red-600';
			case 'Failed':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	}

	function clearError() {
		setErrorMessage('');
	}

	function backToDashboard() {
		router.push('/user');
	}

	function cleanup() {
		setAutoplayBlocked(false);
		setRemoteVideoStream(null);
		setLocalVideoStream(null);

		if (durationIntervalRef.current) {
			clearInterval(durationIntervalRef.current);
		}

		if (webrtcManagerRef.current) {
			webrtcManagerRef.current.cleanup();
		}

		if (connectionManagerRef.current) {
			connectionManagerRef.current.disconnect();
		}

		stopIncomingCallSound();
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-100 p-4">
			<div className="mx-auto max-w-4xl">
				{/* Breadcrumb Navigation */}
				<nav className="mb-4" aria-label="Breadcrumb">
					<ol className="flex items-center space-x-2 text-sm text-gray-600">
						<li>
							<button
								onClick={backToDashboard}
								className="font-medium transition-colors duration-200 hover:text-blue-600"
							>
								Dashboard
							</button>
						</li>
						<li>
							<svg
								className="h-4 w-4 text-gray-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</li>
						<li className="font-medium text-gray-900">
							Agent Portal
							{handle && <span className="font-normal text-gray-500">({handle})</span>}
						</li>
					</ol>
				</nav>

				{/* Header */}
				<div className="mb-6 rounded-2xl bg-white p-6 shadow-xl">
					<div className="mb-4 flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold text-gray-800">Agent Dashboard</h1>
							<p className="text-gray-600">CallSafe Business Portal</p>
						</div>

						<button
							onClick={toggleOnlineStatus}
							disabled={!socketConnected || !handle}
							className={`rounded-lg px-6 py-2 font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${isOnline ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
						>
							{isOnline ? 'Go Offline' : 'Go Online'}
						</button>
					</div>

					{(handle || sourceId) && (
						<div className="mb-4 flex items-center space-x-4">
							{handle && (
								<div className="flex items-center">
									<span className="mr-2 text-sm text-gray-500">Handle:</span>
									<code className="rounded bg-gray-100 px-2 py-1 text-sm">{handle}</code>
								</div>
							)}
							{sourceId && (
								<div className="flex items-center">
									<span className="mr-2 text-sm text-gray-500">Source:</span>
									<code className="rounded bg-blue-100 px-2 py-1 text-sm">{sourceId}</code>
								</div>
							)}
						</div>
					)}

					<div className="border-t border-gray-200 pt-4">
						<div className="flex items-center justify-between space-x-6">
							<div className="flex items-center">
								<div
									className={`mr-2 h-3 w-3 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`}
								></div>
								<span className={`text-sm font-medium ${getStatusColor(connectionStatus)}`}>
									{connectionStatus}
								</span>
							</div>

							<div className="flex items-center">
								<div
									className={`mr-2 h-3 w-3 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`}
								></div>
								<span className="text-sm font-medium text-gray-700">
									💻 Web Dashboard ({socketConnected ? 'Online' : 'Offline'})
								</span>
							</div>

							<div className="flex items-center">
								<span className="mr-2 text-sm font-medium text-gray-600">Handle:</span>
								<span
									className={`text-sm font-semibold ${currentPhase === 'active' ? 'text-red-600' : 'text-green-600'}`}
								>
									{currentPhase === 'active' ? 'Busy' : 'Available'}
								</span>
							</div>
						</div>
					</div>
				</div>

				{/* Error Message */}
				{errorMessage && (
					<div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
						<div className="flex items-start justify-between">
							<div className="flex">
								<div className="flex-shrink-0">
									<svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
										<path
											fillRule="evenodd"
											d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
											clipRule="evenodd"
										/>
									</svg>
								</div>
								<div className="ml-3">
									<p className="text-sm text-red-700">{errorMessage}</p>
								</div>
							</div>
							<button onClick={clearError} className="text-red-400 hover:text-red-600">
								<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>
					</div>
				)}

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					{/* Current Call Panel */}
					<div className="rounded-2xl bg-white p-6 shadow-xl">
						<h2 className="mb-4 text-xl font-semibold text-gray-800">Current Call</h2>

						{currentPhase === 'terminated' ? (
							<div className="py-8 text-center">
								<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
									<svg
										className="h-8 w-8 text-gray-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
										/>
									</svg>
								</div>
								<p className="text-gray-500">
									{isOnline ? 'Waiting for incoming calls...' : 'Go online to receive calls'}
								</p>
							</div>
						) : currentPhase === 'connecting' ? (
							<div className="py-8 text-center">
								<div className="animate-pulse">
									<div
										className={`h-16 w-16 ${currentCallType === 'video' ? 'bg-blue-200' : 'bg-yellow-200'} mx-auto mb-4 flex items-center justify-center rounded-full`}
									>
										{currentCallType === 'video' ? (
											<svg
												className="h-8 w-8 text-blue-600"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth="2"
													d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
												/>
											</svg>
										) : (
											<svg
												className="h-8 w-8 text-yellow-600"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth="2"
													d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
												/>
											</svg>
										)}
									</div>
									<p className="text-gray-600">Connecting to customer...</p>
								</div>
							</div>
						) : currentPhase === 'active' ? (
							<div className="py-2 sm:py-4">
								{/* Autoplay blocked prompt */}
								{autoplayBlocked && (
									<button
										onClick={resumeAutoplay}
										className="mb-4 flex w-full items-center justify-center rounded-xl bg-yellow-500 px-4 py-3 font-semibold text-white transition-colors duration-200 hover:bg-yellow-600"
									>
										<svg
											className="mr-2 h-5 w-5"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth="2"
												d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
											/>
										</svg>
										Tap to enable audio
									</button>
								)}

								{/* Video area (video calls only) */}
								{currentCallType === 'video' && (
									<div
										className="relative mb-4 overflow-hidden rounded-xl bg-gray-900"
										style={{ minHeight: '200px' }}
									>
										<VideoStream
											data-remote
											stream={remoteVideoStream}
											onAutoplayBlocked={markAutoplayBlocked}
											autoPlay
											playsInline
											className="h-full w-full object-cover"
										/>
										<VideoStream
											data-local
											stream={localVideoStream}
											onAutoplayBlocked={markAutoplayBlocked}
											autoPlay
											playsInline
											muted
											className="absolute right-2 bottom-2 w-24 rounded-lg border border-gray-600 bg-gray-800 object-cover"
										/>
									</div>
								)}

								<div className="mb-4 text-center">
									<div
										className={`h-12 w-12 sm:h-16 sm:w-16 ${currentCallType === 'video' ? 'bg-blue-200' : 'bg-green-200'} mx-auto mb-2 flex items-center justify-center rounded-full sm:mb-4`}
									>
										{currentCallType === 'video' ? (
											<svg
												className="h-6 w-6 text-blue-600 sm:h-8 sm:w-8"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth="2"
													d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
												/>
											</svg>
										) : (
											<svg
												className="h-6 w-6 text-green-600 sm:h-8 sm:w-8"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth="2"
													d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
												/>
											</svg>
										)}
									</div>
									<p
										className={`${currentCallType === 'video' ? 'text-blue-600' : 'text-green-600'} mb-2 font-semibold`}
									>
										Connected to Customer
									</p>
									<p className="mb-2 rounded border border-green-200 bg-green-50 px-2 py-1 font-mono text-xl font-bold text-green-700 sm:mb-4 sm:text-2xl">
										{formatDuration(callDuration)}
									</p>
								</div>

								{/* Call Controls */}
								<div className="flex space-x-2">
									<button
										onClick={toggleMute}
										className={`flex-1 ${isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} flex items-center justify-center rounded-xl px-4 py-3 font-semibold text-white transition-colors duration-200`}
									>
										{isMuted ? (
											<>
												<svg
													className="mr-2 h-5 w-5"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth="2"
														d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
														clipRule="evenodd"
													/>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth="2"
														d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
													/>
												</svg>
												Unmute
											</>
										) : (
											<>
												<svg
													className="mr-2 h-5 w-5"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth="2"
														d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
													/>
												</svg>
												Mute
											</>
										)}
									</button>

									{currentCallType === 'video' && (
										<button
											onClick={toggleCamera}
											className={`flex-1 ${!isCameraEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'} flex items-center justify-center rounded-xl px-4 py-3 font-semibold text-white transition-colors duration-200`}
										>
											{!isCameraEnabled ? (
												<>
													<svg
														className="mr-2 h-5 w-5"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth="2"
															d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2zM3 3l18 18"
														/>
													</svg>
													Camera Off
												</>
											) : (
												<>
													<svg
														className="mr-2 h-5 w-5"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth="2"
															d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
														/>
													</svg>
													Camera
												</>
											)}
										</button>
									)}

									<button
										onClick={endCall}
										className="flex flex-1 items-center justify-center rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition-colors duration-200 hover:bg-red-700"
									>
										<svg
											className="mr-2 h-5 w-5"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth="2"
												d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l18 18"
											/>
										</svg>
										End Call
									</button>
								</div>
							</div>
						) : null}
					</div>

					{/* Incoming Calls Panel */}
					<div className="rounded-2xl bg-white p-6 shadow-xl">
						<h2 className="mb-4 text-xl font-semibold text-gray-800">Incoming Calls</h2>

						{incomingCalls.length === 0 ? (
							<div className="py-8 text-center">
								<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
									<svg
										className="h-8 w-8 text-blue-600"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5V7.5a7.5 7.5 0 0115 0V17z"
										/>
									</svg>
								</div>
								<p className="text-gray-500">No incoming calls</p>
							</div>
						) : (
							<div className="space-y-4">
								{incomingCalls.map((call) => (
									<div
										key={call.callId}
										className={`border ${call.callType === 'video' ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'} animate-pulse rounded-lg p-4`}
									>
										<div className="flex items-center justify-between">
											<div>
												<div className="mb-1 flex items-center gap-2">
													{call.callType === 'video' ? (
														<>
															<svg
																className="h-4 w-4 text-blue-600"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
															>
																<path
																	strokeLinecap="round"
																	strokeLinejoin="round"
																	strokeWidth="2"
																	d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
																/>
															</svg>
															<p className="font-semibold text-gray-800">Incoming Video Call</p>
														</>
													) : (
														<>
															<svg
																className="h-4 w-4 text-green-600"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
															>
																<path
																	strokeLinecap="round"
																	strokeLinejoin="round"
																	strokeWidth="2"
																	d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
																/>
															</svg>
															<p className="font-semibold text-gray-800">Incoming Voice Call</p>
														</>
													)}
												</div>
												<p className="text-sm text-gray-600">Call ID: {call.callId.slice(-8)}</p>
												{call.sourceId && (
													<p className="text-sm text-blue-600">Source: {call.sourceId}</p>
												)}
												<p className="text-xs text-gray-500">
													{new Date(call.timestamp).toLocaleTimeString()}
												</p>
											</div>
											<div className="flex space-x-2">
												<button
													onClick={() => acceptCall(call.callId, call.callType)}
													disabled={currentPhase !== 'terminated'}
													className={`${call.callType === 'video' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} rounded-lg px-4 py-2 font-semibold text-white transition-colors duration-200 disabled:bg-gray-400`}
												>
													Accept
												</button>
												<button
													onClick={() => declineCall(call.callId)}
													className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white transition-colors duration-200 hover:bg-red-700"
												>
													Decline
												</button>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Call History Section */}
				<div className="mt-6 rounded-2xl bg-white p-6 shadow-xl">
					<h2 className="mb-4 text-xl font-semibold text-gray-800">Recent Calls</h2>

					{callHistory.length === 0 ? (
						<div className="py-8 text-center">
							<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
								<svg
									className="h-8 w-8 text-gray-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M12 6v6l4 2"
									/>
								</svg>
							</div>
							<p className="text-gray-500">No recent calls</p>
						</div>
					) : (
						<div className="space-y-3">
							{callHistory.map((call, i) => (
								<div key={i} className="rounded-lg border border-gray-200 p-4">
									<div className="flex items-start justify-between">
										<div className="flex-1">
											<div className="mb-2 flex items-center gap-2">
												<div
													className={`h-3 w-3 rounded-full ${call.status === 'completed' ? 'bg-green-500' : call.status === 'timeout' ? 'bg-yellow-500' : call.status === 'cancelled' ? 'bg-gray-500' : call.status === 'missed' ? 'bg-orange-500' : 'bg-red-500'}`}
												></div>
												<span className="text-sm font-medium capitalize">
													{call.status === 'completed'
														? 'Completed'
														: call.status === 'timeout'
															? 'Timeout'
															: call.status === 'cancelled'
																? 'Cancelled'
																: call.status === 'missed'
																	? 'Missed Call'
																	: 'Failed'}
												</span>
											</div>
											<div className="mb-1 text-xs text-gray-600">
												{new Date(call.startTime).toLocaleString()}
											</div>
											{call.sourceId && (
												<div className="text-xs text-blue-600">Source: {call.sourceId}</div>
											)}
										</div>
										<div className="ml-4 text-right">
											{call.duration > 0 && (
												<div className="font-mono text-sm font-semibold text-gray-700">
													{formatDuration(call.duration)}
												</div>
											)}
											<div className="mt-1 text-xs text-gray-500">
												#{call.callAttemptId.slice(-6)}
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Hidden audio elements */}
				<audio autoPlay hidden playsInline muted={false}></audio>
				<audio src="/ringtone.mp3" preload="auto" hidden></audio>
			</div>
		</div>
	);
}
