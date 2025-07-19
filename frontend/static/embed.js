(function() {
    'use strict';
    
    // CallSafe Embed Widget
    class CallSafeWidget {
        constructor(config) {
            this.config = {
                handle: config.handle || '',
                sourceId: config.sourceId || '',
                baseUrl: config.baseUrl || 'https://callsafe.tech',
                theme: config.theme || 'default'
            };
            
            this.isOpen = false;
            this.widget = null;
            this.overlay = null;
            this.iframe = null;
            
            this.init();
        }
        
        init() {
            this.createStyles();
            this.createWidget();
            this.setupEventListeners();
        }
        
        createStyles() {
            if (document.getElementById('callsafe-embed-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'callsafe-embed-styles';
            styles.textContent = `
                .callsafe-widget {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                
                .callsafe-trigger {
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
                }
                
                .callsafe-trigger:hover {
                    transform: scale(1.1);
                    box-shadow: 0 6px 25px rgba(59, 130, 246, 0.6);
                }
                
                .callsafe-trigger svg {
                    width: 24px;
                    height: 24px;
                    fill: white;
                }
                
                .callsafe-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 10001;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.3s ease;
                }
                
                .callsafe-overlay.open {
                    opacity: 1;
                    visibility: visible;
                }
                
                .callsafe-modal {
                    width: 90%;
                    max-width: 480px;
                    height: 600px;
                    max-height: 90vh;
                    background: white;
                    border-radius: 16px;
                    overflow: hidden;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    transform: scale(0.9);
                    transition: transform 0.3s ease;
                    position: relative;
                }
                
                .callsafe-overlay.open .callsafe-modal {
                    transform: scale(1);
                }
                
                .callsafe-iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    border-radius: 16px;
                }
                
                .callsafe-close {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 50%;
                    cursor: pointer;
                    z-index: 10002;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s ease;
                }
                
                .callsafe-close:hover {
                    background: rgba(0, 0, 0, 0.2);
                }
                
                .callsafe-close svg {
                    width: 16px;
                    height: 16px;
                    fill: #666;
                }
                
                @media (max-width: 640px) {
                    .callsafe-modal {
                        width: 95%;
                        height: 95vh;
                        max-height: 95vh;
                    }
                    
                    .callsafe-widget {
                        bottom: 15px;
                        right: 15px;
                    }
                    
                    .callsafe-trigger {
                        width: 56px;
                        height: 56px;
                    }
                }
            `;
            
            document.head.appendChild(styles);
        }
        
        createWidget() {
            this.widget = document.createElement('div');
            this.widget.className = 'callsafe-widget';
            
            const trigger = document.createElement('button');
            trigger.className = 'callsafe-trigger';
            trigger.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                </svg>
            `;
            trigger.title = 'Start a call with us';
            
            this.widget.appendChild(trigger);
            document.body.appendChild(this.widget);
            
            trigger.addEventListener('click', () => this.openWidget());
        }
        
        createOverlay() {
            this.overlay = document.createElement('div');
            this.overlay.className = 'callsafe-overlay';
            
            const modal = document.createElement('div');
            modal.className = 'callsafe-modal';
            
            const closeButton = document.createElement('button');
            closeButton.className = 'callsafe-close';
            closeButton.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            `;
            closeButton.title = 'Close';
            
            this.iframe = document.createElement('iframe');
            this.iframe.className = 'callsafe-iframe';
            this.iframe.src = this.getEmbedUrl();
            this.iframe.allow = 'microphone; camera';
            
            modal.appendChild(closeButton);
            modal.appendChild(this.iframe);
            this.overlay.appendChild(modal);
            document.body.appendChild(this.overlay);
            
            closeButton.addEventListener('click', () => this.closeWidget());
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.closeWidget();
                }
            });
        }
        
        getEmbedUrl() {
            const params = new URLSearchParams();
            if (this.config.sourceId) {
                params.append('sourceId', this.config.sourceId);
            }
            
            return `${this.config.baseUrl}/embed/${this.config.handle}?${params.toString()}`;
        }
        
        openWidget() {
            if (!this.overlay) {
                this.createOverlay();
            }
            
            this.isOpen = true;
            document.body.style.overflow = 'hidden';
            this.overlay.classList.add('open');
            
            // Focus management for accessibility
            setTimeout(() => {
                const closeButton = this.overlay.querySelector('.callsafe-close');
                if (closeButton) closeButton.focus();
            }, 100);
        }
        
        closeWidget() {
            if (!this.overlay) return;
            
            this.isOpen = false;
            document.body.style.overflow = '';
            this.overlay.classList.remove('open');
            
            // Return focus to trigger button
            const trigger = this.widget.querySelector('.callsafe-trigger');
            if (trigger) trigger.focus();
        }
        
        setupEventListeners() {
            // Handle escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.closeWidget();
                }
            });
            
            // Handle window resize
            window.addEventListener('resize', () => {
                if (this.isOpen && window.innerWidth < 640) {
                    // Adjust for mobile if needed
                }
            });
        }
        
        destroy() {
            if (this.widget) {
                this.widget.remove();
            }
            if (this.overlay) {
                this.overlay.remove();
            }
            const styles = document.getElementById('callsafe-embed-styles');
            if (styles) {
                styles.remove();
            }
        }
    }
    
    // Auto-initialize widgets from script tags
    function initializeWidgets() {
        const scripts = document.querySelectorAll('script[src*="embed.js"]');
        
        scripts.forEach(script => {
            const handle = script.getAttribute('data-handle');
            const sourceId = script.getAttribute('data-source-id');
            
            if (!handle) {
                console.warn('CallSafe embed: data-handle attribute is required');
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
    window.CallSafeWidget = CallSafeWidget;
    
})();