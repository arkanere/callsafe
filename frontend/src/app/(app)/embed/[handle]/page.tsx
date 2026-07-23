'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MessageTypes, MediaToggleAction, PROTOCOL_VERSION } from '@callsafe/protocol';
import { WsTransport } from '$lib/transport/ws-transport';
import { WebRTCManager } from '$lib/managers/webrtc-manager';
import { generateUUID } from '$lib/utils/uuid';

// Direct port of (layout-2)/embed/[handle]/+page.svelte.
//
// The deleted `customerCallState` store (D1) is inlined: nothing ever read it
// back, so every `customerCallState.update(...)` call is gone. `showCallButton`
// and `showCallControls` are dropped for the same reason — they were written by
// the state transitions but never referenced in the markup, which branches
// purely on `callState`.

type CallState = 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed';

// Replaces the Svelte `attachStream` action. A fresh mount (the 'connected'
// branch re-creating the <video> after remote tracks already arrived during
// 'ringing') re-attaches the stream held in component state via the effect.
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

export default function EmbedPage() {
	// Extract parameters - handle comes from URL path parameter for customer calls
	const handle = (useParams<{ handle: string }>().handle as string) || '';
	const sourceId = useSearchParams().get('sourceId') || 'website';

	// Connection management
	const socketRef = useRef<WsTransport | null>(null);
	const webrtcManagerRef = useRef<WebRTCManager | null>(null);

	// Call state
	const callAttemptIdRef = useRef<string | null>(null);
	const acceptedRef = useRef(false);
	const [callState, setCallStateValue] = useState<CallState>('idle');
	// Mirror of `callState` for the socket handlers, the initiateCall guard and
	// the connection-check interval, all of which read it across invocations.
	const callStateRef = useRef<CallState>('idle');
	const [callType, setCallTypeValue] = useState<'voice' | 'video'>('voice');
	const callTypeRef = useRef<'voice' | 'video'>('voice');
	const [statusMessage, setStatusMessage] = useState('');
	const [isMuted, setIsMuted] = useState(false);
	const [isVideoEnabled, setIsVideoEnabled] = useState(true);
	const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [autoplayBlocked, setAutoplayBlocked] = useState(false);

	// Streams held in state so the video elements re-bind whenever React
	// recreates them on call-state transitions (ringing -> connected re-renders
	// a fresh <video>, which would otherwise lose its srcObject).
	const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
	const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);

	const markAutoplayBlocked = useCallback(() => {
		setAutoplayBlocked(true);
	}, []);

	function setCallState(state: CallState) {
		callStateRef.current = state;
		setCallStateValue(state);
	}

	function setCallType(type: 'voice' | 'video') {
		callTypeRef.current = type;
		setCallTypeValue(type);
	}

	useEffect(() => {
		console.log('[EMBED PAGE] onMount(): Component mounted');
		console.log('[EMBED PAGE] onMount(): Handle:', handle);
		console.log('[EMBED PAGE] onMount(): Source ID:', sourceId);

		console.log('[EMBED PAGE] onMount(): Customer call state initialized');

		return () => {
			console.log('[EMBED PAGE] onDestroy(): Component destroying, cleaning up');
			cleanup();
		};
		// Empty deps on purpose: parity with onMount/onDestroy, this runs exactly once.
	}, []);

	async function initiateCall(type: 'voice' | 'video') {
		console.log(
			'[EMBED PAGE] initiateCall(): Initiate call requested, type:',
			type,
			'current state:',
			callStateRef.current
		);
		if (callStateRef.current !== 'idle') {
			console.log('[EMBED PAGE] initiateCall(): Call already in progress, ignoring');
			return;
		}

		setCallType(type);

		console.log('[EMBED PAGE] initiateCall(): Starting call initiation process');
		try {
			callAttemptIdRef.current = generateUUID();
			console.log(
				'[EMBED PAGE] initiateCall(): Generated call attempt ID:',
				callAttemptIdRef.current
			);

			console.log('[EMBED PAGE] initiateCall(): Updating UI state to connecting');
			setCallState('connecting');
			setStatusMessage('Finding agent...');

			console.log('[EMBED PAGE] initiateCall(): Fetching guest token');
			const guest = await fetchGuestToken(getServerUrl(), handle);

			console.log('[EMBED PAGE] initiateCall(): Connecting to signaling server');
			await connectToSignalingServer();
			console.log('[EMBED PAGE] initiateCall(): Connected to signaling server');

			console.log('[EMBED PAGE] initiateCall(): Authenticating (device:connect)');
			socketRef.current!.emit(MessageTypes.DEVICE_CONNECT, {
				deviceType: 'web',
				deviceId: guest.deviceId,
				token: guest.token,
				protocolVersion: PROTOCOL_VERSION,
				timestamp: Date.now()
			});
			await socketRef.current!.waitFor(MessageTypes.DEVICE_CONNECTED);
			console.log('[EMBED PAGE] initiateCall(): Authenticated');

			console.log('[EMBED PAGE] initiateCall(): Initializing WebRTC');
			await initializeCustomerWebRTC(callAttemptIdRef.current, type);
			console.log('[EMBED PAGE] initiateCall(): WebRTC initialized');

			console.log('[EMBED PAGE] initiateCall(): Sending call initiate event');
			socketRef.current!.emit(MessageTypes.CALL_INITIATE, {
				callAttemptId: callAttemptIdRef.current,
				handle,
				callType: type,
				mediaCapabilities: {
					canSend: type === 'video' ? ['audio', 'video'] : ['audio'],
					canReceive: type === 'video' ? ['audio', 'video'] : ['audio']
				},
				timestamp: Date.now()
			});
			console.log('[EMBED PAGE] initiateCall(): Call initiate event sent');
		} catch (error) {
			console.error('[EMBED PAGE] initiateCall(): Error during call initiation:', error);
			const err = error as Error;
			if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
				handleMediaAccessError(err);
			} else {
				// Guest-token fetch, socket, or auth handshake failure
				socketRef.current?.disconnect();
				socketRef.current = null;
				handleCallFailure('Unable to connect. Please try again.');
			}
		}
	}

	function getServerUrl(): string {
		return process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || 'https://signal.callsafe.tech';
	}

	async function fetchGuestToken(
		serverUrl: string,
		businessHandle: string
	): Promise<{ token: string; deviceId: string }> {
		const response = await fetch(
			`${serverUrl}/api/v1/guest-token?handle=${encodeURIComponent(businessHandle)}`
		);
		if (!response.ok) {
			throw new Error(`Guest token request failed: ${response.status}`);
		}
		return response.json();
	}

	async function connectToSignalingServer(): Promise<void> {
		console.log(
			'[EMBED PAGE] connectToSignalingServer(): Attempting to connect to signaling server'
		);
		const wsUrl =
			getServerUrl()
				.replace(/^https:\/\//, 'wss://')
				.replace(/^http:\/\//, 'ws://') + '/ws';

		// A guest call cannot survive a socket loss (no call:reconnect support),
		// so a blind reconnect would only produce an unauthenticated socket.
		socketRef.current = new WsTransport(wsUrl, { autoReconnect: false });
		console.log('[EMBED PAGE] connectToSignalingServer(): WsTransport instance created');

		setupSocketEventHandlers();

		await socketRef.current.connect();
		console.log('[EMBED PAGE] connectToSignalingServer(): Connected successfully');
	}

	function setupSocketEventHandlers() {
		console.log('[EMBED PAGE] setupSocketEventHandlers(): Setting up socket event handlers');
		const socket = socketRef.current;
		if (!socket) {
			console.error(
				'[EMBED PAGE] setupSocketEventHandlers(): Socket is null, cannot setup handlers'
			);
			return;
		}

		// Call initiated (server ack: business devices are now ringing)
		socket.on(MessageTypes.CALL_INITIATED, (raw) => {
			const data = raw as unknown as {
				callAttemptId: string;
				devicesNotified: number;
				timestamp: number;
			};
			if (data.callAttemptId !== callAttemptIdRef.current) return;
			console.log('[EMBED PAGE] setupSocketEventHandlers(): Call initiated ack received:', data);
			setStatusMessage('Ringing...');
		});

		// Call accepted
		socket.on(MessageTypes.CALL_ACCEPTED, async (raw) => {
			const data = raw as unknown as {
				callAttemptId: string;
				acceptingDeviceId: string;
				timestamp: number;
			};
			if (data.callAttemptId !== callAttemptIdRef.current) return;
			console.log('[EMBED PAGE] setupSocketEventHandlers(): Call accepted event received:', data);
			acceptedRef.current = true;
			setCallState('ringing');
			setStatusMessage('Agent accepted, connecting...');

			console.log('[EMBED PAGE] setupSocketEventHandlers(): Creating WebRTC offer');
			if (webrtcManagerRef.current) {
				try {
					await webrtcManagerRef.current.createOffer(data.callAttemptId);
					console.log('[EMBED PAGE] setupSocketEventHandlers(): WebRTC offer created successfully');
				} catch (error) {
					console.error(
						'[EMBED PAGE] setupSocketEventHandlers(): Failed to create WebRTC offer:',
						error
					);
					handleConnectionFailure();
				}
			} else {
				console.error('[EMBED PAGE] setupSocketEventHandlers(): WebRTC manager is null');
			}
		});

		// WebRTC answer
		socket.on(MessageTypes.WEBRTC_ANSWER, async (raw) => {
			const data = raw as unknown as { answer: RTCSessionDescription; callAttemptId: string };
			console.log('[EMBED PAGE] setupSocketEventHandlers(): WebRTC answer received:', data);
			if (webrtcManagerRef.current) {
				try {
					await webrtcManagerRef.current.setRemoteDescription(data.answer);
					console.log(
						'[EMBED PAGE] setupSocketEventHandlers(): Remote description set successfully'
					);
				} catch (error) {
					console.error(
						'[EMBED PAGE] setupSocketEventHandlers(): Failed to set remote description:',
						error
					);
					handleConnectionFailure();
				}
			} else {
				console.error(
					'[EMBED PAGE] setupSocketEventHandlers(): WebRTC manager is null when processing answer'
				);
			}
		});

		// ICE candidate
		socket.on(MessageTypes.WEBRTC_ICE_CANDIDATE, async (raw) => {
			const data = raw as unknown as { candidate: RTCIceCandidate; callAttemptId: string };
			console.log('[EMBED PAGE] setupSocketEventHandlers(): ICE candidate received:', data);
			if (webrtcManagerRef.current) {
				try {
					await webrtcManagerRef.current.addIceCandidate(data.candidate);
					console.log('[EMBED PAGE] setupSocketEventHandlers(): ICE candidate added successfully');
				} catch (error) {
					console.error(
						'[EMBED PAGE] setupSocketEventHandlers(): Failed to add ICE candidate:',
						error
					);
				}
			} else {
				console.error(
					'[EMBED PAGE] setupSocketEventHandlers(): WebRTC manager is null when processing ICE candidate'
				);
			}
		});

		// Call failures
		socket.on(MessageTypes.CALL_BUSY, (raw) => {
			const data = raw as unknown as { callAttemptId: string };
			if (data.callAttemptId !== callAttemptIdRef.current) return;
			console.log('[EMBED PAGE] setupSocketEventHandlers(): Call busy event received');
			handleCallFailure('All agents are busy. Please try again later.');
		});

		socket.on(MessageTypes.CALL_UNAVAILABLE, (raw) => {
			const data = raw as unknown as { callAttemptId: string; reason: string };
			if (data.callAttemptId !== callAttemptIdRef.current) return;
			console.log(
				'[EMBED PAGE] setupSocketEventHandlers(): Call unavailable event received:',
				data
			);
			handleCallFailure('No agents available right now.');
		});

		socket.on(MessageTypes.CALL_TIMEOUT, (raw) => {
			const data = raw as unknown as {
				callAttemptId: string;
				phase: string;
				timeoutDuration: number;
			};
			if (data.callAttemptId !== callAttemptIdRef.current) return;
			console.log('[EMBED PAGE] setupSocketEventHandlers(): Call timeout event received:', data);
			handleCallFailure('No response from agents. Please try again.');
		});

		socket.on(MessageTypes.CALL_FAILED, (raw) => {
			const data = raw as unknown as { callAttemptId: string; reason?: string };
			if (data.callAttemptId !== callAttemptIdRef.current) return;
			console.log('[EMBED PAGE] setupSocketEventHandlers(): Call failed event received:', data);
			let message = 'Connection failed. Please try again.';
			switch (data.reason) {
				case 'media_permission_denied':
					message = 'The agent could not access their microphone or camera.';
					break;
				case 'peer_disconnected':
					message = 'The agent lost their connection.';
					break;
				case 'connection_failed':
				case 'internal_error':
				default:
					break;
			}
			handleCallFailure(message);
		});

		// Call ended
		socket.on(MessageTypes.CALL_ENDED, (raw) => {
			const data = raw as unknown as {
				callAttemptId: string;
				duration: number;
				reason: string;
				endedBy: string;
			};
			if (data.callAttemptId !== callAttemptIdRef.current) return;
			console.log('[EMBED PAGE] setupSocketEventHandlers(): Call ended event received:', data);

			if (cleanupTimeoutRef.current) {
				clearTimeout(cleanupTimeoutRef.current);
				cleanupTimeoutRef.current = null;
			}

			cleanup();
		});

		console.log(
			'[EMBED PAGE] setupSocketEventHandlers(): All socket event handlers setup complete'
		);
	}

	async function initializeCustomerWebRTC(callId: string, type: 'voice' | 'video') {
		const webrtcManager = new WebRTCManager(socketRef.current!);
		webrtcManagerRef.current = webrtcManager;
		webrtcManager.onAutoplayBlocked = () => {
			setAutoplayBlocked(true);
		};

		// For video calls, route streams through component state (VideoStream
		// component) instead of one-shot DOM queries; voice keeps the manager's
		// default audio-element handling.
		if (type === 'video') {
			webrtcManager.onRemoteStream = (stream) => {
				setRemoteVideoStream(stream);
			};
		}

		await webrtcManager.initialize(callId, type);

		if (type === 'video') {
			setLocalVideoStream(webrtcManager.getLocalStream());
		}

		const checkConnection = () => {
			const connectionState = webrtcManagerRef.current?.getConnectionState();
			if (connectionState === 'connected') {
				setCallState('connected');
				setStatusMessage('Connected to agent');
			}
		};

		const connectionCheckInterval = setInterval(() => {
			checkConnection();
			if (
				callStateRef.current === 'connected' ||
				callStateRef.current === 'ended' ||
				callStateRef.current === 'failed'
			) {
				clearInterval(connectionCheckInterval);
			}
		}, 1000);
	}

	function handleConnectionFailure() {
		console.error('[EMBED PAGE] handleConnectionFailure(): Customer WebRTC connection failed');

		if (socketRef.current && callAttemptIdRef.current) {
			socketRef.current.emit(MessageTypes.CALL_FAILED, {
				callAttemptId: callAttemptIdRef.current,
				reason: 'connection_failed',
				timestamp: Date.now()
			});
		}
	}

	function handleCallFailure(message: string) {
		setCallState('failed');
		setStatusMessage(message);

		setTimeout(() => resetCustomerCallState(), 3000);
	}

	function handleMediaAccessError(error: Error) {
		console.error('[EMBED PAGE] handleMediaAccessError(): Media access error:', error);

		setCallState('failed');

		const isCameraError =
			(error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') &&
			callTypeRef.current === 'video';
		setStatusMessage(
			isCameraError
				? 'Please allow camera and microphone access for video calls.'
				: 'Please allow microphone access to make calls.'
		);
	}

	function endCall() {
		if (socketRef.current && callAttemptIdRef.current) {
			if (!acceptedRef.current) {
				// Pre-accept the call is still initiated/ringing: call:end would be
				// an invalid transition — the caller abandons with call:cancel.
				socketRef.current.emit(MessageTypes.CALL_CANCEL, {
					callAttemptId: callAttemptIdRef.current,
					timestamp: Date.now()
				});
				cleanup();
			} else {
				socketRef.current.emit(MessageTypes.CALL_END, {
					callAttemptId: callAttemptIdRef.current,
					timestamp: Date.now()
				});

				cleanupTimeoutRef.current = setTimeout(() => {
					console.log("[EMBED PAGE] endCall(): Server didn't respond to call:end, forcing cleanup");
					cleanup();
				}, 5000);
			}
		} else {
			cleanup();
		}
	}

	function toggleMute() {
		if (!webrtcManagerRef.current) return;

		setIsMuted(webrtcManagerRef.current.toggleMute());
	}

	function toggleCamera() {
		if (!webrtcManagerRef.current || callTypeRef.current !== 'video') return;

		const isDisabled = webrtcManagerRef.current.toggleCamera();
		setIsVideoEnabled(!isDisabled);

		if (socketRef.current && callAttemptIdRef.current) {
			socketRef.current.emit(MessageTypes.MEDIA_TOGGLE, {
				callAttemptId: callAttemptIdRef.current,
				action: isDisabled ? MediaToggleAction.DISABLE_CAMERA : MediaToggleAction.ENABLE_CAMERA,
				timestamp: Date.now()
			});
		}
	}

	function resetCustomerCallState() {
		setCallState('idle');
		callAttemptIdRef.current = null;
		acceptedRef.current = false;
		setCallType('voice');
		setStatusMessage('');
		setIsMuted(false);
		setIsVideoEnabled(true);
	}

	function resumeAutoplay() {
		webrtcManagerRef.current?.resumePlayback();
		setAutoplayBlocked(false);
	}

	function cleanup() {
		setAutoplayBlocked(false);
		setRemoteVideoStream(null);
		setLocalVideoStream(null);

		if (cleanupTimeoutRef.current) {
			clearTimeout(cleanupTimeoutRef.current);
			cleanupTimeoutRef.current = null;
		}

		if (webrtcManagerRef.current) {
			webrtcManagerRef.current.cleanup();
			webrtcManagerRef.current = null;
		}

		if (socketRef.current) {
			socketRef.current.disconnect();
			socketRef.current = null;
		}

		resetCustomerCallState();
	}

	function getStatusColor(state: string) {
		switch (state) {
			case 'connected':
				return 'text-green-600';
			case 'connecting':
			case 'ringing':
				return 'text-yellow-600';
			case 'failed':
				return 'text-red-600';
			case 'ended':
				return 'text-gray-600';
			default:
				return 'text-blue-600';
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
			<div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
				<div className="mb-8 text-center">
					<h1 className="mb-2 text-3xl font-bold text-gray-800">CallSafe</h1>
					<p className="text-gray-600">Anonymous Business Calling</p>
					{handle && (
						<p className="mt-2 text-sm text-gray-500">
							Handle: <code className="rounded bg-gray-100 px-2 py-1">{handle}</code>
						</p>
					)}
					{sourceId && (
						<p className="mt-1 text-sm text-gray-500">
							Source: <code className="rounded bg-blue-100 px-2 py-1">{sourceId}</code>
						</p>
					)}
				</div>

				{/* Call Status */}
				<div className="mb-6">
					<div className="mb-4 flex items-center justify-center">
						<div
							className={`mr-2 h-4 w-4 rounded-full ${
								callState === 'connected'
									? 'bg-green-500'
									: ['connecting', 'ringing'].includes(callState)
										? 'animate-pulse bg-yellow-500'
										: callState === 'failed'
											? 'bg-red-500'
											: 'bg-gray-400'
							}`}
						></div>
						<span className={`text-sm font-medium ${getStatusColor(callState)}`}>
							{statusMessage || 'Ready to call'}
						</span>
					</div>
				</div>

				{/* Autoplay blocked prompt */}
				{autoplayBlocked && ['connecting', 'ringing', 'connected'].includes(callState) && (
					<div className="mb-4">
						<button
							onClick={resumeAutoplay}
							className="flex w-full items-center justify-center rounded-xl bg-yellow-500 px-4 py-3 font-semibold text-white transition-colors duration-200 hover:bg-yellow-600"
						>
							<svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
								/>
							</svg>
							Tap to enable audio
						</button>
					</div>
				)}

				{/* Main Call Interface */}
				<div className="space-y-4">
					{callState === 'idle' ? (
						<>
							{/* Voice Call button */}
							<button
								onClick={() => initiateCall('voice')}
								disabled={!handle}
								className="flex w-full items-center justify-center rounded-xl bg-green-600 px-6 py-4 font-semibold text-white transition-colors duration-200 hover:bg-green-700 disabled:bg-gray-400"
							>
								<svg className="mr-2 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
									/>
								</svg>
								Voice Call
							</button>

							{/* Video Call button */}
							<button
								onClick={() => initiateCall('video')}
								disabled={!handle}
								className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-4 font-semibold text-white transition-colors duration-200 hover:bg-blue-700 disabled:bg-gray-400"
							>
								<svg className="mr-2 h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="2"
										d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
									/>
								</svg>
								Video Call
							</button>
						</>
					) : callState === 'connecting' || callState === 'ringing' ? (
						<>
							{/* Video preview area (video calls only) */}
							{callType === 'video' && (
								<div
									className="relative mb-4 overflow-hidden rounded-xl bg-gray-900"
									style={{ minHeight: '200px' }}
								>
									<VideoStream
										data-remote=""
										stream={remoteVideoStream}
										onAutoplayBlocked={markAutoplayBlocked}
										autoPlay
										playsInline
										className="h-full w-full object-cover"
									/>
									<VideoStream
										data-local=""
										stream={localVideoStream}
										onAutoplayBlocked={markAutoplayBlocked}
										autoPlay
										playsInline
										muted
										className="absolute right-2 bottom-2 w-24 rounded-lg border border-gray-600 bg-gray-800 object-cover"
									/>
								</div>
							)}

							<div className="py-4 text-center">
								<div className="animate-pulse">
									<div
										className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
											callType === 'video' ? 'bg-blue-200' : 'bg-yellow-200'
										}`}
									>
										{callType === 'video' ? (
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
									<p className="mb-4 text-gray-600">{statusMessage}</p>
								</div>
							</div>

							{/* Call Controls during connecting */}
							<div className="flex space-x-2">
								<button
									onClick={toggleMute}
									className={`flex flex-1 items-center justify-center rounded-xl px-4 py-3 font-semibold text-white transition-colors duration-200 ${
										isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'
									}`}
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

								{callType === 'video' && (
									<button
										onClick={toggleCamera}
										className={`flex flex-1 items-center justify-center rounded-xl px-4 py-3 font-semibold text-white transition-colors duration-200 ${
											!isVideoEnabled
												? 'bg-red-600 hover:bg-red-700'
												: 'bg-gray-600 hover:bg-gray-700'
										}`}
									>
										{!isVideoEnabled ? (
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
									End
								</button>
							</div>
						</>
					) : callState === 'connected' ? (
						<>
							{/* Video area (video calls only) */}
							{callType === 'video' && (
								<div
									className="relative mb-4 overflow-hidden rounded-xl bg-gray-900"
									style={{ minHeight: '200px' }}
								>
									<VideoStream
										data-remote=""
										stream={remoteVideoStream}
										onAutoplayBlocked={markAutoplayBlocked}
										autoPlay
										playsInline
										className="h-full w-full object-cover"
									/>
									<VideoStream
										data-local=""
										stream={localVideoStream}
										onAutoplayBlocked={markAutoplayBlocked}
										autoPlay
										playsInline
										muted
										className="absolute right-2 bottom-2 w-24 rounded-lg border border-gray-600 bg-gray-800 object-cover"
									/>
								</div>
							)}

							<div className="py-4 text-center">
								<div
									className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
										callType === 'video' ? 'bg-blue-200' : 'bg-green-200'
									}`}
								>
									{callType === 'video' ? (
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
											className="h-8 w-8 text-green-600"
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
									className={`mb-4 font-semibold ${
										callType === 'video' ? 'text-blue-600' : 'text-green-600'
									}`}
								>
									Connected to Agent
								</p>
							</div>

							{/* Call Controls */}
							<div className="flex space-x-2">
								<button
									onClick={toggleMute}
									className={`flex flex-1 items-center justify-center rounded-xl px-4 py-3 font-semibold text-white transition-colors duration-200 ${
										isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'
									}`}
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

								{callType === 'video' && (
									<button
										onClick={toggleCamera}
										className={`flex flex-1 items-center justify-center rounded-xl px-4 py-3 font-semibold text-white transition-colors duration-200 ${
											!isVideoEnabled
												? 'bg-red-600 hover:bg-red-700'
												: 'bg-gray-600 hover:bg-gray-700'
										}`}
									>
										{!isVideoEnabled ? (
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
									End
								</button>
							</div>
						</>
					) : callState === 'failed' ? (
						<>
							<div className="py-4 text-center">
								<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-200">
									<svg
										className="h-8 w-8 text-red-600"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</div>
								<p className="mb-4 font-semibold text-red-600">{statusMessage}</p>
							</div>

							<button
								onClick={resetCustomerCallState}
								className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors duration-200 hover:bg-blue-700"
							>
								Try Again
							</button>
						</>
					) : callState === 'ended' ? (
						<>
							<div className="py-4 text-center">
								<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
									<svg
										className="h-8 w-8 text-gray-600"
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
								</div>
								<p className="mb-4 font-semibold text-gray-600">Call Ended</p>
							</div>

							<button
								onClick={resetCustomerCallState}
								className="w-full rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition-colors duration-200 hover:bg-green-700"
							>
								Start New Call
							</button>
						</>
					) : null}
				</div>

				{/* Hidden audio element for voice calls */}
				{callType !== 'video' && <audio autoPlay hidden playsInline muted={false}></audio>}

				{/* Footer */}
				<div className="mt-8 border-t border-gray-200 pt-6">
					<p className="text-center text-xs text-gray-500">Secure • Anonymous • Private</p>
				</div>
			</div>
		</div>
	);
}
