(function() {
    'use strict';
    
    // Prevent multiple initializations
    if (window.CallSafeEmbedLoaded) {
        return;
    }
    window.CallSafeEmbedLoaded = true;
    
    // Configuration from script tag
    const script = document.currentScript || document.querySelector('script[data-handle]');
    const handle = script?.getAttribute('data-handle');
    const sourceId = script?.getAttribute('data-source-id') || 'embed-widget';
    
    if (!handle) {
        console.error('CallSafe Embed: data-handle attribute is required');
        return;
    }
    
    // CallSafe configuration
    const CALLSAFE_BASE_URL = 'https://callsafe.vercel.app';
    const WIDGET_ID = 'callsafe-widget-' + handle;
    const MODAL_ID = 'callsafe-modal-' + handle;
    
    // Prevent duplicate widgets
    if (document.getElementById(WIDGET_ID)) {
        return;
    }
    
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
        const style = document.createElement('style');
        style.textContent = widgetCSS;
        document.head.appendChild(style);
    }
    
    // Create the floating widget
    function createWidget() {
        const widget = document.createElement('div');
        widget.id = WIDGET_ID;
        widget.className = 'callsafe-widget';
        
        const button = document.createElement('button');
        button.className = 'callsafe-button';
        button.innerHTML = phoneIcon + '<span>Quick Call</span>';
        button.onclick = openModal;
        
        widget.appendChild(button);
        document.body.appendChild(widget);
    }
    
    // Create the modal
    function createModal() {
        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'callsafe-modal';
        modal.onclick = function(e) {
            if (e.target === modal) {
                closeModal();
            }
        };
        
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
        iframe.src = `${CALLSAFE_BASE_URL}/embed/${handle}?sourceId=${encodeURIComponent(sourceId)}`;
        iframe.allow = 'microphone';
        iframe.title = 'CallSafe Quick Call';
        
        modalContent.appendChild(header);
        modalContent.appendChild(iframe);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    }
    
    // Open modal function
    function openModal() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
            
            // Track embed click event
            if (window.gtag) {
                window.gtag('event', 'callsafe_embed_click', {
                    'source_id': sourceId,
                    'handle': handle
                });
            }
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
    
    // Expose functions globally for onclick handlers
    window.CallSafeEmbed = {
        openModal: openModal,
        closeModal: closeModal
    };
    
    // Handle escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
    
    // Initialize when DOM is ready
    function init() {
        injectCSS();
        createWidget();
        createModal();
        
        console.log(`CallSafe Embed initialized for handle: ${handle}, sourceId: ${sourceId}`);
    }
    
    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();