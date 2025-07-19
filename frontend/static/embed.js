(function() {
    'use strict';
    
    console.log('🚀 CallSafe Embed: Script started loading');
    
    // Prevent multiple initializations
    if (window.CallSafeEmbedLoaded) {
        console.log('⚠️ CallSafe Embed: Already loaded, skipping initialization');
        return;
    }
    window.CallSafeEmbedLoaded = true;
    console.log('✅ CallSafe Embed: Initialization flag set');
    
    // Configuration from script tag
    const script = document.currentScript || document.querySelector('script[data-handle]');
    console.log('🔍 CallSafe Embed: Script element found:', script);
    
    const handle = script?.getAttribute('data-handle');
    const sourceId = script?.getAttribute('data-source-id') || 'embed-widget';
    
    console.log('📋 CallSafe Embed: Configuration:', { handle, sourceId });
    
    if (!handle) {
        console.error('❌ CallSafe Embed: data-handle attribute is required');
        console.log('💡 CallSafe Embed: Make sure your script tag includes data-handle="your-handle"');
        return;
    }
    
    console.log('✅ CallSafe Embed: Handle validated, proceeding with initialization');
    
    // CallSafe configuration  
    const CALLSAFE_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:5173' : 'https://callsafe.tech';
    console.log('🌐 CallSafe Embed: Base URL set to:', CALLSAFE_BASE_URL);
    const WIDGET_ID = 'callsafe-widget-' + handle;
    const MODAL_ID = 'callsafe-modal-' + handle;
    
    // Prevent duplicate widgets
    if (document.getElementById(WIDGET_ID)) {
        console.log('⚠️ CallSafe Embed: Widget already exists, skipping creation');
        return;
    }
    console.log('✅ CallSafe Embed: No existing widget found, proceeding with creation');
    
    // CSS styles for the widget
    const widgetCSS = `
        .callsafe-widget {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .callsafe-button {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            border: none;
            border-radius: 50px;
            padding: 16px 24px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s ease;
            text-decoration: none;
        }
        
        .callsafe-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
            background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
        }
        
        .callsafe-button:active {
            transform: translateY(0);
        }
        
        .callsafe-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.75);
            z-index: 1000000;
            display: none;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .callsafe-modal.show {
            display: flex;
        }
        
        .callsafe-modal-content {
            background: white;
            border-radius: 16px;
            width: 90%;
            max-width: 400px;
            max-height: 90vh;
            overflow: hidden;
            position: relative;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        
        .callsafe-modal-header {
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .callsafe-close {
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.2s ease;
        }
        
        .callsafe-close:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        
        .callsafe-iframe {
            width: 100%;
            height: 500px;
            border: none;
            display: block;
        }
        
        @media (max-width: 480px) {
            .callsafe-modal-content {
                width: 95%;
                max-height: 95vh;
            }
            
            .callsafe-iframe {
                height: 400px;
            }
            
            .callsafe-widget {
                bottom: 16px;
                right: 16px;
            }
            
            .callsafe-button {
                padding: 14px 20px;
                font-size: 15px;
            }
        }
    `;
    
    // Phone icon SVG
    const phoneIcon = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
        </svg>
    `;
    
    // Close icon SVG
    const closeIcon = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    `;
    
    // Create and inject CSS
    function injectCSS() {
        console.log('🎨 CallSafe Embed: Injecting CSS styles');
        const style = document.createElement('style');
        style.textContent = widgetCSS;
        document.head.appendChild(style);
        console.log('✅ CallSafe Embed: CSS styles injected successfully');
    }
    
    // Create the floating widget
    function createWidget() {
        console.log('🔨 CallSafe Embed: Creating widget element');
        const widget = document.createElement('div');
        widget.id = WIDGET_ID;
        widget.className = 'callsafe-widget';
        console.log('📦 CallSafe Embed: Widget element created with ID:', WIDGET_ID);
        
        const button = document.createElement('button');
        button.className = 'callsafe-button';
        button.innerHTML = phoneIcon + '<span>Quick Call</span>';
        button.onclick = openModal;
        console.log('🔘 CallSafe Embed: Button created with click handler');
        
        widget.appendChild(button);
        document.body.appendChild(widget);
        console.log('✅ CallSafe Embed: Widget successfully added to DOM');
        
        // Verify widget is visible
        const widgetRect = widget.getBoundingClientRect();
        console.log('📐 CallSafe Embed: Widget position and size:', {
            top: widgetRect.top,
            left: widgetRect.left,
            width: widgetRect.width,
            height: widgetRect.height,
            visible: widgetRect.width > 0 && widgetRect.height > 0
        });
    }
    
    // Create the modal
    function createModal() {
        console.log('🖼️ CallSafe Embed: Creating modal element');
        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'callsafe-modal';
        modal.onclick = function(e) {
            if (e.target === modal) {
                closeModal();
            }
        };
        console.log('📱 CallSafe Embed: Modal element created with ID:', MODAL_ID);
        
        const modalContent = document.createElement('div');
        modalContent.className = 'callsafe-modal-content';
        
        const header = document.createElement('div');
        header.className = 'callsafe-modal-header';
        header.innerHTML = `
            <div>
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Quick Call</h3>
                <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">Connect instantly via your browser</p>
            </div>
            <button class="callsafe-close" onclick="window.CallSafeEmbed.closeModal()">${closeIcon}</button>
        `;
        
        const iframe = document.createElement('iframe');
        iframe.className = 'callsafe-iframe';
        const iframeSrc = `${CALLSAFE_BASE_URL}/embed/${handle}?sourceId=${encodeURIComponent(sourceId)}`;
        iframe.src = iframeSrc;
        iframe.allow = 'microphone';
        iframe.title = 'CallSafe Quick Call';
        console.log('🌐 CallSafe Embed: Iframe created with src:', iframeSrc);
        
        // Listen for iframe load to send initial communication setup
        iframe.onload = function() {
            console.log('🎯 CallSafe Embed: Iframe loaded, sending initial setup');
            try {
                iframe.contentWindow.postMessage({
                    type: 'initParentCommunication',
                    functions: ['requestCall'],
                    parentOrigin: window.location.origin
                }, CALLSAFE_BASE_URL);
            } catch (e) {
                console.log('🚫 CallSafe Embed: Cannot access iframe contentWindow (cross-origin)');
            }
        };
        
        modalContent.appendChild(header);
        modalContent.appendChild(iframe);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        console.log('✅ CallSafe Embed: Modal successfully added to DOM');
    }
    
    // Open modal function
    function openModal() {
        console.log('🔄 CallSafe Embed: Opening modal');
        const modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
            console.log('✅ CallSafe Embed: Modal opened successfully');
            
            // Track embed click event
            if (window.gtag) {
                console.log('📊 CallSafe Embed: Tracking click event');
                window.gtag('event', 'callsafe_embed_click', {
                    'source_id': sourceId,
                    'handle': handle
                });
            }
        } else {
            console.error('❌ CallSafe Embed: Modal element not found!');
        }
    }
    
    // Close modal function
    function closeModal() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
            
            // Refresh iframe to end any active calls
            const iframe = modal.querySelector('.callsafe-iframe');
            if (iframe) {
                iframe.src = iframe.src;
            }
        }
    }
    
    // Handle messages from iframe
    window.addEventListener('message', function(event) {
        // Verify origin for security
        if (event.origin !== CALLSAFE_BASE_URL) {
            console.log('🔒 CallSafe Embed: Ignoring message from origin:', event.origin);
            return;
        }
        
        console.log('📨 CallSafe Embed: Received message:', event.data);
        
        // Handle both object and string messages
        let messageData = event.data;
        if (typeof messageData === 'string') {
            try {
                messageData = JSON.parse(messageData);
            } catch (e) {
                console.log('📨 CallSafe Embed: Non-JSON string message:', messageData);
                messageData = { type: messageData };
            }
        }
        
        const { type, data } = messageData || {};
        
        switch (type) {
            case 'requestCall':
                console.log('📞 CallSafe Embed: Received requestCall from iframe');
                // Send acknowledgment back to iframe
                event.source.postMessage({
                    type: 'callAcknowledged',
                    success: true
                }, event.origin);
                break;
                
            case 'closeModal':
                console.log('🔄 CallSafe Embed: Received closeModal from iframe');
                closeModal();
                break;
                
            case 'callStarted':
                console.log('🎉 CallSafe Embed: Call started successfully');
                break;
                
            case 'callEnded':
                console.log('📴 CallSafe Embed: Call ended');
                break;
                
            case undefined:
            case null:
                console.log('📨 CallSafe Embed: Message with undefined/null type, raw data:', event.data);
                // Try to handle as generic call request
                event.source.postMessage({
                    type: 'callAcknowledged',
                    success: true
                }, event.origin);
                break;
                
            default:
                console.log('📨 CallSafe Embed: Unknown message type:', type, 'Data:', messageData);
        }
    });

    // Expose functions globally for onclick handlers and iframe communication
    window.CallSafeEmbed = {
        openModal: openModal,
        closeModal: closeModal,
        requestCall: function() {
            console.log('📞 CallSafe Embed: requestCall called directly');
            return Promise.resolve({ success: true });
        }
    };

    // Also expose requestCall directly on window for iframe access
    window.requestCall = function() {
        console.log('📞 CallSafe Embed: requestCall called on window');
        return Promise.resolve({ success: true });
    };

    // Create a communication bridge for the iframe
    window.CallSafeBridge = {
        requestCall: function() {
            console.log('📞 CallSafe Embed: requestCall called via bridge');
            return Promise.resolve({ success: true });
        },
        postMessage: function(message) {
            console.log('📨 CallSafe Embed: Bridge postMessage called:', message);
            // Handle the message as if it came via postMessage
            window.dispatchEvent(new MessageEvent('message', {
                data: message,
                origin: CALLSAFE_BASE_URL,
                source: { postMessage: function() {} }
            }));
        }
    };

    // For legacy iframe code that might expect parent.requestCall
    try {
        if (window.parent && window.parent !== window) {
            window.parent.requestCall = window.requestCall;
            window.parent.CallSafeBridge = window.CallSafeBridge;
        }
    } catch (e) {
        console.log('🚫 CallSafe Embed: Cannot set parent functions (cross-origin)');
    }
    
    // Handle escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
    
    // Initialize when DOM is ready
    function init() {
        console.log('🎯 CallSafe Embed: Starting initialization');
        console.log('📄 CallSafe Embed: Document ready state:', document.readyState);
        console.log('🏗️ CallSafe Embed: Body element exists:', !!document.body);
        
        try {
            injectCSS();
            createWidget();
            createModal();
            
            console.log(`🎉 CallSafe Embed: Successfully initialized for handle: ${handle}, sourceId: ${sourceId}`);
        } catch (error) {
            console.error('💥 CallSafe Embed: Initialization failed:', error);
        }
    }
    
    // Initialize
    console.log('⏳ CallSafe Embed: Checking document ready state');
    if (document.readyState === 'loading') {
        console.log('📋 CallSafe Embed: Document still loading, waiting for DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', init);
    } else {
        console.log('📋 CallSafe Embed: Document already loaded, initializing immediately');
        init();
    }
    
})();