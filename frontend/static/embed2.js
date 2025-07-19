(function() {
    'use strict';
    
    // CallSafe Embed Widget (Popup Version)
    class CallSafeWidget {
        constructor(config) {
            this.config = {
                handle: config.handle || '',
                sourceId: config.sourceId || '',
                baseUrl: config.baseUrl || 'https://callsafe.tech',
                theme: config.theme || 'default'
            };
            
            this.widget = null;
            this.popup = null;
            this.isCallActive = false;
            
            this.init();
        }
        
        init() {
            this.createStyles();
            this.createWidget();
            this.setupEventListeners();
        }
        
        createStyles() {
            if (document.getElementById('callsafe-embed2-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'callsafe-embed2-styles';
            styles.textContent = `
                .callsafe-widget2 {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .callsafe-trigger2 {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #3b82f6, #1e40af);
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                }
                
                .callsafe-trigger2:hover {
                    transform: scale(1.1);
                    box-shadow: 0 6px 25px rgba(59, 130, 246, 0.6);
                }
                
                .callsafe-trigger2.active {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4); }
                    50% { box-shadow: 0 6px 30px rgba(239, 68, 68, 0.8); }
                    100% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4); }
                }
                
                .callsafe-trigger2 svg {
                    width: 24px;
                    height: 24px;
                    fill: white;
                    transition: transform 0.3s ease;
                }
                
                .callsafe-trigger2.active svg {
                    transform: rotate(135deg);
                }
                
                .callsafe-status-indicator {
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: #10b981;
                    border: 2px solid white;
                    display: none;
                }
                
                .callsafe-status-indicator.show {
                    display: block;
                }
                
                .callsafe-tooltip {
                    position: absolute;
                    bottom: 70px;
                    right: 0;
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 14px;
                    white-space: nowrap;
                    opacity: 0;
                    transform: translateY(10px);
                    transition: all 0.3s ease;
                    pointer-events: none;
                }
                
                .callsafe-tooltip::after {
                    content: '';
                    position: absolute;
                    top: 100%;
                    right: 20px;
                    border: 6px solid transparent;
                    border-top-color: rgba(0, 0, 0, 0.8);
                }
                
                .callsafe-trigger2:hover .callsafe-tooltip {
                    opacity: 1;
                    transform: translateY(0);
                }
                
                @media (max-width: 640px) {
                    .callsafe-widget2 {
                        bottom: 15px;
                        right: 15px;
                    }
                    
                    .callsafe-trigger2 {
                        width: 56px;
                        height: 56px;
                    }
                    
                    .callsafe-tooltip {
                        display: none;
                    }
                }
            `;
            
            document.head.appendChild(styles);
        }
        
        createWidget() {
            this.widget = document.createElement('div');
            this.widget.className = 'callsafe-widget2';
            
            const trigger = document.createElement('button');
            trigger.className = 'callsafe-trigger2';
            trigger.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
                <div class="callsafe-status-indicator"></div>
                <div class="callsafe-tooltip">Start a call with us</div>
            `;
            trigger.title = 'Start a call with us';
            
            this.widget.appendChild(trigger);
            document.body.appendChild(this.widget);
            
            trigger.addEventListener('click', () => this.toggleCall());
        }
        
        getCallUrl() {
            const params = new URLSearchParams();
            if (this.config.sourceId) {
                params.append('sourceId', this.config.sourceId);
            }
            
            return `${this.config.baseUrl}/embed/${this.config.handle}?${params.toString()}`;
        }
        
        toggleCall() {
            if (this.isCallActive && this.popup && !this.popup.closed) {
                this.endCall();
            } else {
                this.startCall();
            }
        }
        
        startCall() {
            if (this.popup && !this.popup.closed) {
                this.popup.focus();
                return;
            }
            
            const callUrl = this.getCallUrl();
            
            // Calculate popup position (centered on screen)
            const width = 480;
            const height = 600;
            const left = (screen.width - width) / 2;
            const top = (screen.height - height) / 2;
            
            const features = [
                `width=${width}`,
                `height=${height}`,
                `left=${left}`,
                `top=${top}`,
                'menubar=no',
                'toolbar=no',
                'location=no',
                'status=no',
                'scrollbars=no',
                'resizable=yes'
            ].join(',');
            
            try {
                this.popup = window.open(callUrl, 'callsafe_call', features);
                
                if (this.popup) {
                    this.isCallActive = true;
                    this.updateWidgetState();
                    this.monitorPopup();
                } else {
                    this.showPopupBlockedMessage();
                }
            } catch (error) {
                console.error('Failed to open call popup:', error);
                this.showPopupBlockedMessage();
            }
        }
        
        endCall() {
            if (this.popup && !this.popup.closed) {
                this.popup.close();
            }
            this.isCallActive = false;
            this.popup = null;
            this.updateWidgetState();
        }
        
        monitorPopup() {
            if (!this.popup) return;
            
            const checkClosed = () => {
                if (this.popup.closed) {
                    this.isCallActive = false;
                    this.popup = null;
                    this.updateWidgetState();
                } else if (this.isCallActive) {
                    setTimeout(checkClosed, 1000);
                }
            };
            
            setTimeout(checkClosed, 1000);
            
            // Listen for messages from popup
            window.addEventListener('message', (event) => {
                if (event.origin !== this.config.baseUrl) return;
                
                if (event.data.type === 'callsafe_call_ended') {
                    this.endCall();
                } else if (event.data.type === 'callsafe_call_started') {
                    this.isCallActive = true;
                    this.updateWidgetState();
                }
            });
        }
        
        updateWidgetState() {
            const trigger = this.widget.querySelector('.callsafe-trigger2');
            const statusIndicator = this.widget.querySelector('.callsafe-status-indicator');
            const tooltip = this.widget.querySelector('.callsafe-tooltip');
            
            if (this.isCallActive) {
                trigger.classList.add('active');
                statusIndicator.classList.add('show');
                tooltip.textContent = 'End call';
                trigger.title = 'End call';
            } else {
                trigger.classList.remove('active');
                statusIndicator.classList.remove('show');
                tooltip.textContent = 'Start a call with us';
                trigger.title = 'Start a call with us';
            }
        }
        
        showPopupBlockedMessage() {
            // Create a temporary notification
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                bottom: 100px;
                right: 20px;
                background: #dc2626;
                color: white;
                padding: 12px 16px;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                z-index: 10001;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                max-width: 300px;
                animation: slideIn 0.3s ease;
            `;
            
            notification.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 4px;">Popup Blocked</div>
                <div>Please allow popups for this site to start calls</div>
            `;
            
            document.body.appendChild(notification);
            
            // Add slideIn animation
            const style = document.createElement('style');
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
            
            // Remove notification after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideIn 0.3s ease reverse';
                    setTimeout(() => {
                        notification.remove();
                        style.remove();
                    }, 300);
                }
            }, 5000);
        }
        
        setupEventListeners() {
            // Handle page visibility changes
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this.popup && !this.popup.closed) {
                    // Page is hidden, but keep monitoring popup
                } else if (!document.hidden && this.popup && this.popup.closed) {
                    // Page is visible again and popup is closed
                    this.endCall();
                }
            });
            
            // Handle page unload
            window.addEventListener('beforeunload', () => {
                if (this.popup && !this.popup.closed) {
                    this.popup.close();
                }
            });
            
            // Handle escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isCallActive) {
                    this.endCall();
                }
            });
        }
        
        destroy() {
            if (this.popup && !this.popup.closed) {
                this.popup.close();
            }
            if (this.widget) {
                this.widget.remove();
            }
            const styles = document.getElementById('callsafe-embed2-styles');
            if (styles) {
                styles.remove();
            }
        }
    }
    
    // Auto-initialize widgets from script tags
    function initializeWidgets() {
        const scripts = document.querySelectorAll('script[src*="embed2.js"]');
        
        scripts.forEach(script => {
            const handle = script.getAttribute('data-handle');
            const sourceId = script.getAttribute('data-source-id');
            
            if (!handle) {
                console.warn('CallSafe embed2: data-handle attribute is required');
                return;
            }
            
            // Prevent multiple widgets from the same script
            if (script.dataset.initialized) return;
            script.dataset.initialized = 'true';
            
            new CallSafeWidget({
                handle: handle,
                sourceId: sourceId || '',
                baseUrl: script.getAttribute('data-base-url') || 'https://callsafe.tech'
            });
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeWidgets);
    } else {
        initializeWidgets();
    }
    
    // Expose CallSafeWidget for manual initialization
    window.CallSafeWidget2 = CallSafeWidget;
    
})();