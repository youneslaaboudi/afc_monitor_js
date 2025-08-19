(function() {
    'use strict';
    
    // Prevent multiple instances
    if (window.httpMonitor) {
        console.log('HTTP Monitor already exists, destroying old instance...');
        window.httpMonitor.destroy();
    }
    
    window.httpMonitor = {
        requests: [],
        blockedRequests: 0,
        lastSuccessTime: null,
        displayElement: null,
        updateTimer: null,
        
        init: function() {
            console.log('Initializing HTTP Monitor...');
            this.createDisplay();
            this.interceptRequests();
            this.updateDisplay();
            this.startTimer();
            console.log('HTTP Monitor initialized successfully');
        },
        
        createDisplay: function() {
            // Remove existing display if any
            const existing = document.getElementById('http-monitor-display');
            if (existing) {
                existing.remove();
                console.log('Removed existing display');
            }
            
            // Create display element
            this.displayElement = document.createElement('div');
            this.displayElement.id = 'http-monitor-display';
            this.displayElement.style.cssText = `
                position: fixed !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                background: rgba(0, 0, 0, 0.9) !important;
                color: white !important;
                font-family: monospace !important;
                font-size: 12px !important;
                padding: 10px !important;
                border-top: 2px solid #333 !important;
                z-index: 999999 !important;
                max-height: 150px !important;
                overflow-y: auto !important;
                box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3) !important;
                pointer-events: auto !important;
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            `;
            
            // Wait for DOM to be ready
            if (document.body) {
                document.body.appendChild(this.displayElement);
                console.log('Display element added to body');
            } else {
                // If body is not ready, wait for it
                const observer = new MutationObserver((mutations, obs) => {
                    if (document.body) {
                        document.body.appendChild(this.displayElement);
                        console.log('Display element added to body (after waiting)');
                        obs.disconnect();
                    }
                });
                observer.observe(document.documentElement, {
                    childList: true,
                    subtree: true
                });
            }
        },
        
        shouldBlockRequest: function(url) {
            return url && url.includes('AvailableRegular');
        },
        
        interceptRequests: function() {
            const self = this;
            console.log('Setting up request interception...');
            
            // Intercept XMLHttpRequest
            const originalXHROpen = XMLHttpRequest.prototype.open;
            const originalXHRSend = XMLHttpRequest.prototype.send;
            
            /*XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
                this._method = method;
                this._url = url;
                this._shouldBlock = self.shouldBlockRequest(url);
                
                if (this._shouldBlock) {
                    console.log('Blocking XHR request:', url);
                    self.blockedRequests++;
                    self.updateDisplay();
                    return; // Don't call the original open method
                }
                
                return originalXHROpen.apply(this, arguments);
            };*/
            
            XMLHttpRequest.prototype.send = function(body) {
                if (this._shouldBlock) {
                    // Simulate a 403 response with JSON body
                    const xhr = this;
                    setTimeout(() => {
                        // Set up the mock response
                        Object.defineProperty(xhr, 'readyState', { writable: true, value: 4 });
                        Object.defineProperty(xhr, 'status', { writable: true, value: 403 });
                        Object.defineProperty(xhr, 'statusText', { writable: true, value: 'Forbidden' });
                        Object.defineProperty(xhr, 'responseText', { writable: true, value: '{"response":"block"}' });
                        Object.defineProperty(xhr, 'response', { writable: true, value: '{"response":"block"}' });
                        Object.defineProperty(xhr, 'responseType', { writable: true, value: '' });
                        
                        // Set response headers
                        xhr.getAllResponseHeaders = function() {
                            return 'content-type: application/json\r\ncontent-length: 21\r\n';
                        };
                        xhr.getResponseHeader = function(name) {
                            if (name.toLowerCase() === 'content-type') return 'application/json';
                            if (name.toLowerCase() === 'content-length') return '21';
                            return null;
                        };
                        
                        // Trigger the readystatechange event
                        if (xhr.onreadystatechange) {
                            xhr.onreadystatechange();
                        }
                        
                        // Trigger load event if handler exists
                        if (xhr.onload) {
                            xhr.onload();
                        }
                    }, 1); // Small delay to simulate network
                    return;
                }
                
                const xhr = this;
                const startTime = Date.now();
                
                const originalOnReadyStateChange = xhr.onreadystatechange;
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        self.logRequest({
                            method: xhr._method,
                            url: xhr._url,
                            status: xhr.status,
                            responseSize: xhr.responseText ? xhr.responseText.length : 0,
                            duration: Date.now() - startTime
                        });
                    }
                    if (originalOnReadyStateChange) {
                        return originalOnReadyStateChange.apply(this, arguments);
                    }
                };
                
                return originalXHRSend.apply(this, arguments);
            };
            
            // Intercept fetch
            const originalFetch = window.fetch;
            if (originalFetch) {
                window.fetch = function(input, init) {
                    const url = typeof input === 'string' ? input : input.url;
                    const method = init && init.method ? init.method : 'GET';
                    
                    // Block the request if it matches our criteria
                    if (self.shouldBlockRequest(url)) {
                        console.log('Simulating 403 for fetch request:', url);
                        self.blockedRequests++;
                        self.updateDisplay();
                        
                        // Return a Promise that resolves to a mock 403 response
                        return Promise.resolve(new Response('{"response":"block"}', {
                            status: 403,
                            statusText: 'Forbidden',
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Length': '21'
                            }
                        }));
                    }
                    
                    const startTime = Date.now();
                    
                    return originalFetch.apply(this, arguments)
                        .then(response => {
                            // Clone response to read body size
                            const clonedResponse = response.clone();
                            clonedResponse.text().then(text => {
                                self.logRequest({
                                    method: method,
                                    url: url,
                                    status: response.status,
                                    responseSize: text.length,
                                    duration: Date.now() - startTime
                                });
                            }).catch(() => {
                                // If we can't read the body, just log without size
                                self.logRequest({
                                    method: method,
                                    url: url,
                                    status: response.status,
                                    responseSize: 0,
                                    duration: Date.now() - startTime
                                });
                            });
                            
                            return response;
                        })
                        .catch(error => {
                            self.logRequest({
                                method: method,
                                url: url,
                                status: 0,
                                responseSize: 0,
                                duration: Date.now() - startTime,
                                error: true
                            });
                            throw error;
                        });
                };
            }
            
            console.log('Request interception set up');
        },
        
        logRequest: function(requestData) {
            console.log('Logging request:', requestData);
            
            // Add timestamp
            requestData.timestamp = Date.now();
            
            // Add to requests array
            this.requests.unshift(requestData);
            
            // Keep only last 5 requests
            this.requests = this.requests.slice(0, 5);
            
            // Update last success time if status is 200
            if (requestData.status === 200) {
                this.lastSuccessTime = Date.now();
            }
            
            // Update display
            this.updateDisplay();
        },
        
        updateDisplay: function() {
            if (!this.displayElement) {
                console.warn('Display element not found, recreating...');
                this.createDisplay();
                return;
            }
            
            let html = '<div style="margin-bottom: 8px; font-weight: bold; color: #00ff00;">HTTP Monitor - Last 5 Requests:</div>';
            
            // Display blocked requests count
            html += `<div style="margin-bottom: 5px; color: #ff6666;">Simulated 403 responses for AvailableRegular: ${this.blockedRequests}</div>`;
            
            // Display time since last 200 response
            const timeSinceSuccess = this.getTimeSinceLastSuccess();
            html += `<div style="margin-bottom: 5px; color: #ffff00;">Time since last 200: ${timeSinceSuccess}s</div>`;
            
            // Display requests
            if (this.requests.length === 0) {
                html += '<div style="color: #888;">No requests yet...</div>';
            } else {
                this.requests.forEach((req, index) => {
                    const statusColor = this.getStatusColor(req.status);
                    const sizeKB = (req.responseSize / 1024).toFixed(1);
                    const url = this.truncateUrl(req.url);
                    
                    html += `<div style="margin-bottom: 2px;">
                        <span style="color: ${statusColor}; font-weight: bold;">${req.status}</span>
                        <span style="color: #ccc;"> | </span>
                        <span style="color: #00aaff;">${req.method}</span>
                        <span style="color: #ccc;"> | </span>
                        <span style="color: #ffaa00;">${sizeKB}KB</span>
                        <span style="color: #ccc;"> | </span>
                        <span style="color: #fff;">${url}</span>
                        ${req.error ? ' <span style="color: #ff0000;">[ERROR]</span>' : ''}
                    </div>`;
                });
            }
            
            this.displayElement.innerHTML = html;
        },
        
        getStatusColor: function(status) {
            if (status >= 200 && status < 300) return '#00ff00'; // Green
            if (status >= 300 && status < 400) return '#ffaa00'; // Orange
            if (status >= 400 && status < 500) return '#ff6600'; // Red-orange
            if (status >= 500) return '#ff0000'; // Red
            if (status === 0) return '#ff0000'; // Network error
            return '#888'; // Gray
        },
        
        truncateUrl: function(url) {
            const maxLength = 50;
            if (!url || url.length <= maxLength) return url || 'Unknown URL';
            
            // Try to show the path part if it's a full URL
            try {
                const urlObj = new URL(url);
                const pathPart = urlObj.pathname + urlObj.search;
                if (pathPart.length <= maxLength) {
                    return pathPart;
                }
                return '...' + pathPart.slice(-(maxLength - 3));
            } catch (e) {
                // If not a valid URL, just truncate
                return '...' + url.slice(-(maxLength - 3));
            }
        },
        
        getTimeSinceLastSuccess: function() {
            if (!this.lastSuccessTime) {
                return 'N/A';
            }
            return Math.floor((Date.now() - this.lastSuccessTime) / 1000);
        },
        
        startTimer: function() {
            // Clear existing timer
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
            }
            
            // Update the timer every second
            this.updateTimer = setInterval(() => {
                this.updateDisplay();
            }, 1000);
        },
        
        destroy: function() {
            console.log('Destroying HTTP Monitor...');
            
            // Clear timer
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
                this.updateTimer = null;
            }
            
            // Remove display element
            if (this.displayElement) {
                this.displayElement.remove();
                this.displayElement = null;
            }
            
            // Clean up
            delete window.httpMonitor;
            console.log('HTTP Monitor destroyed');
        }
    };
    
    // Initialize the monitor
    window.httpMonitor.init();
    
    // Add a way to toggle/destroy the monitor
    console.log('HTTP Monitor initialized with 403 response simulation. Use window.httpMonitor.destroy() to remove it.');
    
    // Test the display immediately
    setTimeout(() => {
        if (window.httpMonitor && window.httpMonitor.displayElement) {
            console.log('Display element is present in DOM:', document.contains(window.httpMonitor.displayElement));
        }
    }, 100);
})();
