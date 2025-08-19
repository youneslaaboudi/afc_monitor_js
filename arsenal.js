(function() {
    'use strict';
    
    // Prevent multiple instances
    if (window.httpMonitor) {
        console.log('HTTP Monitor already exists, destroying old instance...');
        try {
            window.httpMonitor.destroy();
        } catch (e) {
            console.warn('Error destroying old instance:', e);
        }
    }
    
    window.httpMonitor = {
        requests: [],
        blockedRequests: 0,
        lastSuccessTime: null,
        displayElement: null,
        updateTimer: null,
        originalXHR: {},
        originalFetch: null,
        
        init: function() {
            try {
                console.log('Initializing HTTP Monitor...');
                this.createDisplay();
                this.interceptRequests();
                this.updateDisplay();
                this.startTimer();
                console.log('HTTP Monitor initialized successfully');
            } catch (e) {
                console.error('Failed to initialize HTTP Monitor:', e);
            }
        },
        
        createDisplay: function() {
            try {
                // Remove existing display if any
                const existing = document.getElementById('http-monitor-display');
                if (existing) {
                    existing.remove();
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
                
                // Add to DOM
                if (document.body) {
                    document.body.appendChild(this.displayElement);
                } else {
                    document.addEventListener('DOMContentLoaded', () => {
                        if (document.body) {
                            document.body.appendChild(this.displayElement);
                        }
                    });
                }
            } catch (e) {
                console.error('Failed to create display:', e);
            }
        },
        
        shouldBlockRequest: function(url) {
            try {
                return url && url.indexOf('AvailableRegular') !== -1;
            } catch (e) {
                return false;
            }
        },
        
        interceptRequests: function() {
            const self = this;
            
            try {
                // Store original methods
                this.originalXHR.open = XMLHttpRequest.prototype.open;
                this.originalXHR.send = XMLHttpRequest.prototype.send;
                this.originalFetch = window.fetch;
                
                // Override XMLHttpRequest.prototype.send
                XMLHttpRequest.prototype.send = function(body) {
                    const xhr = this;
                    const url = xhr._monitorUrl || 'unknown';
                    
                    if (self.shouldBlockRequest(url)) {
                        console.log('Blocking XHR request:', url);
                        self.blockedRequests++;
                        self.updateDisplay();
                        
                        // Create a mock response
                        setTimeout(function() {
                            try {
                                // Define properties that can be overridden
                                Object.defineProperties(xhr, {
                                    'status': { value: 403, writable: false, configurable: true },
                                    'statusText': { value: 'Forbidden', writable: false, configurable: true },
                                    'readyState': { value: 4, writable: false, configurable: true },
                                    'responseText': { value: '["blocked"]', writable: false, configurable: true },
                                    'response': { value: '["blocked"]', writable: false, configurable: true }
                                });
                                
                                // Override header methods
                                xhr.getAllResponseHeaders = function() {
                                    return 'content-type: application/json\r\n';
                                };
                                xhr.getResponseHeader = function(name) {
                                    if (name && name.toLowerCase() === 'content-type') {
                                        return 'application/json';
                                    }
                                    return null;
                                };
                                
                                // Fire events
                                if (typeof xhr.onreadystatechange === 'function') {
                                    xhr.onreadystatechange();
                                }
                                if (typeof xhr.onload === 'function') {
                                    xhr.onload();
                                }
                            } catch (e) {
                                console.error('Error creating mock XHR response:', e);
                            }
                        }, 50);
                        
                        return;
                    }
                    
                    // For non-blocked requests, add monitoring
                    const startTime = Date.now();
                    const originalOnReadyStateChange = xhr.onreadystatechange;
                    
                    xhr.onreadystatechange = function() {
                        if (xhr.readyState === 4) {
                            try {
                                self.logRequest({
                                    method: xhr._monitorMethod || 'GET',
                                    url: url,
                                    status: xhr.status,
                                    responseSize: xhr.responseText ? xhr.responseText.length : 0,
                                    duration: Date.now() - startTime
                                });
                            } catch (e) {
                                console.error('Error logging XHR request:', e);
                            }
                        }
                        
                        if (typeof originalOnReadyStateChange === 'function') {
                            try {
                                originalOnReadyStateChange.apply(this, arguments);
                            } catch (e) {
                                console.error('Error in original onreadystatechange:', e);
                            }
                        }
                    };
                    
                    // Call original send
                    return self.originalXHR.send.call(this, body);
                };
                
                // Override XMLHttpRequest.prototype.open to capture URL and method
                XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
                    this._monitorMethod = method;
                    this._monitorUrl = url;
                    return self.originalXHR.open.call(this, method, url, async, user, password);
                };
                
                // Override fetch
                if (this.originalFetch) {
                    window.fetch = function(input, init) {
                        try {
                            const url = typeof input === 'string' ? input : (input.url || 'unknown');
                            const method = (init && init.method) ? init.method : 'GET';
                            
                            if (self.shouldBlockRequest(url)) {
                                console.log('Blocking fetch request:', url);
                                self.blockedRequests++;
                                self.updateDisplay();
                                
                                // Return a mock 403 response
                                return Promise.resolve(new Response('["blocked"]', {
                                    status: 403,
                                    statusText: 'Forbidden',
                                    headers: new Headers({
                                        'Content-Type': 'application/json'
                                    })
                                }));
                            }
                            
                            const startTime = Date.now();
                            
                            return self.originalFetch.apply(this, arguments)
                                .then(function(response) {
                                    try {
                                        const clonedResponse = response.clone();
                                        clonedResponse.text().then(function(text) {
                                            self.logRequest({
                                                method: method,
                                                url: url,
                                                status: response.status,
                                                responseSize: text.length,
                                                duration: Date.now() - startTime
                                            });
                                        }).catch(function() {
                                            self.logRequest({
                                                method: method,
                                                url: url,
                                                status: response.status,
                                                responseSize: 0,
                                                duration: Date.now() - startTime
                                            });
                                        });
                                    } catch (e) {
                                        console.error('Error processing fetch response:', e);
                                    }
                                    return response;
                                })
                                .catch(function(error) {
                                    try {
                                        self.logRequest({
                                            method: method,
                                            url: url,
                                            status: 0,
                                            responseSize: 0,
                                            duration: Date.now() - startTime,
                                            error: true
                                        });
                                    } catch (e) {
                                        console.error('Error logging fetch error:', e);
                                    }
                                    throw error;
                                });
                        } catch (e) {
                            console.error('Error in fetch override:', e);
                            return self.originalFetch.apply(this, arguments);
                        }
                    };
                }
                
                console.log('Request interception set up successfully');
            } catch (e) {
                console.error('Failed to set up request interception:', e);
            }
        },
        
        logRequest: function(requestData) {
            try {
                requestData.timestamp = Date.now();
                this.requests.unshift(requestData);
                this.requests = this.requests.slice(0, 5);
                
                if (requestData.status === 200) {
                    this.lastSuccessTime = Date.now();
                }
                
                this.updateDisplay();
            } catch (e) {
                console.error('Error logging request:', e);
            }
        },
        
        updateDisplay: function() {
            try {
                if (!this.displayElement) {
                    return;
                }
                
                let html = '<div style="margin-bottom: 8px; font-weight: bold; color: #00ff00;">HTTP Monitor - Last 5 Requests:</div>';
                html += '<div style="margin-bottom: 5px; color: #ff6666;">Simulated 403 responses for AvailableRegular: ' + this.blockedRequests + '</div>';
                
                const timeSinceSuccess = this.getTimeSinceLastSuccess();
                html += '<div style="margin-bottom: 5px; color: #ffff00;">Time since last 200: ' + timeSinceSuccess + 's</div>';
                
                if (this.requests.length === 0) {
                    html += '<div style="color: #888;">No requests yet...</div>';
                } else {
                    for (let i = 0; i < this.requests.length; i++) {
                        const req = this.requests[i];
                        const statusColor = this.getStatusColor(req.status);
                        const sizeKB = (req.responseSize / 1024).toFixed(1);
                        const url = this.truncateUrl(req.url);
                        
                        html += '<div style="margin-bottom: 2px;">';
                        html += '<span style="color: ' + statusColor + '; font-weight: bold;">' + req.status + '</span>';
                        html += '<span style="color: #ccc;"> | </span>';
                        html += '<span style="color: #00aaff;">' + req.method + '</span>';
                        html += '<span style="color: #ccc;"> | </span>';
                        html += '<span style="color: #ffaa00;">' + sizeKB + 'KB</span>';
                        html += '<span style="color: #ccc;"> | </span>';
                        html += '<span style="color: #fff;">' + url + '</span>';
                        if (req.error) {
                            html += ' <span style="color: #ff0000;">[ERROR]</span>';
                        }
                        html += '</div>';
                    }
                }
                
                this.displayElement.innerHTML = html;
            } catch (e) {
                console.error('Error updating display:', e);
            }
        },
        
        getStatusColor: function(status) {
            if (status >= 200 && status < 300) return '#00ff00';
            if (status >= 300 && status < 400) return '#ffaa00';
            if (status >= 400 && status < 500) return '#ff6600';
            if (status >= 500) return '#ff0000';
            if (status === 0) return '#ff0000';
            return '#888';
        },
        
        truncateUrl: function(url) {
            try {
                const maxLength = 50;
                if (!url || url.length <= maxLength) return url || 'Unknown URL';
                
                try {
                    const urlObj = new URL(url);
                    const pathPart = urlObj.pathname + urlObj.search;
                    if (pathPart.length <= maxLength) {
                        return pathPart;
                    }
                    return '...' + pathPart.slice(-(maxLength - 3));
                } catch (e) {
                    return '...' + url.slice(-(maxLength - 3));
                }
            } catch (e) {
                return 'Error parsing URL';
            }
        },
        
        getTimeSinceLastSuccess: function() {
            try {
                if (!this.lastSuccessTime) {
                    return 'N/A';
                }
                return Math.floor((Date.now() - this.lastSuccessTime) / 1000);
            } catch (e) {
                return 'Error';
            }
        },
        
        startTimer: function() {
            try {
                if (this.updateTimer) {
                    clearInterval(this.updateTimer);
                }
                
                this.updateTimer = setInterval(() => {
                    this.updateDisplay();
                }, 1000);
            } catch (e) {
                console.error('Error starting timer:', e);
            }
        },
        
        destroy: function() {
            try {
                console.log('Destroying HTTP Monitor...');
                
                if (this.updateTimer) {
                    clearInterval(this.updateTimer);
                    this.updateTimer = null;
                }
                
                if (this.displayElement && this.displayElement.parentNode) {
                    this.displayElement.parentNode.removeChild(this.displayElement);
                    this.displayElement = null;
                }
                
                // Restore original methods
                if (this.originalXHR.open) {
                    XMLHttpRequest.prototype.open = this.originalXHR.open;
                }
                if (this.originalXHR.send) {
                    XMLHttpRequest.prototype.send = this.originalXHR.send;
                }
                if (this.originalFetch) {
                    window.fetch = this.originalFetch;
                }
                
                delete window.httpMonitor;
                console.log('HTTP Monitor destroyed');
            } catch (e) {
                console.error('Error destroying HTTP Monitor:', e);
            }
        }
    };
    
    // Initialize the monitor
    try {
        window.httpMonitor.init();
        console.log('HTTP Monitor initialized with 403 response simulation. Use window.httpMonitor.destroy() to remove it.');
    } catch (e) {
        console.error('Failed to initialize HTTP Monitor:', e);
    }
    
})();
