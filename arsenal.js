(function() {
    'use strict';
    
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
            var existing = document.getElementById('http-monitor-display');
            if (existing) {
                existing.remove();
            }
            
            this.displayElement = document.createElement('div');
            this.displayElement.id = 'http-monitor-display';
            this.displayElement.style.cssText = 'position:fixed!important;bottom:0!important;left:0!important;right:0!important;background:rgba(0,0,0,0.9)!important;color:white!important;font-family:monospace!important;font-size:12px!important;padding:10px!important;border-top:2px solid #333!important;z-index:999999!important;max-height:150px!important;overflow-y:auto!important;';
            
            if (document.body) {
                document.body.appendChild(this.displayElement);
            } else {
                var self = this;
                document.addEventListener('DOMContentLoaded', function() {
                    if (document.body) {
                        document.body.appendChild(self.displayElement);
                    }
                });
            }
        },
        
        shouldBlockRequest: function(url) {
            return url && url.indexOf('AvailableRegular') !== -1;
        },
        
        interceptRequests: function() {
            var self = this;
            
            // Store original methods
            var originalXHRSend = XMLHttpRequest.prototype.send;
            var originalXHROpen = XMLHttpRequest.prototype.open;
            var originalFetch = window.fetch;
            
            // Override XMLHttpRequest open
            XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
                this._httpMonitorMethod = method;
                this._httpMonitorUrl = url;
                this._httpMonitorShouldBlock = self.shouldBlockRequest(url);
                return originalXHROpen.call(this, method, url, async, user, password);
            };
            
            // Override XMLHttpRequest send
            XMLHttpRequest.prototype.send = function(body) {
                var xhr = this;
                
                if (xhr._httpMonitorShouldBlock) {
                    console.log('Blocking XHR request:', xhr._httpMonitorUrl);
                    self.blockedRequests = self.blockedRequests + 1;
                    self.updateDisplay();
                    
                    // Create a completely new XMLHttpRequest object for the mock response
                    var mockXHR = new XMLHttpRequest();
                    
                    // Copy relevant properties and methods to original xhr
                    setTimeout(function() {
                        // Create mock response properties
                        try {
                            Object.defineProperty(xhr, 'status', { 
                                value: 200, 
                                writable: false, 
                                configurable: true 
                            });
                        } catch (e) {
                            xhr.status = 200;
                        }
                        
                        try {
                            Object.defineProperty(xhr, 'statusText', { 
                                value: 'OK', 
                                writable: false, 
                                configurable: true 
                            });
                        } catch (e) {
                            xhr.statusText = 'OK';
                        }
                        
                        try {
                            Object.defineProperty(xhr, 'responseText', { 
                                value: '[]', 
                                writable: false, 
                                configurable: true 
                            });
                        } catch (e) {
                            xhr.responseText = '[]';
                        }
                        
                        try {
                            Object.defineProperty(xhr, 'response', { 
                                value: '[]', 
                                writable: false, 
                                configurable: true 
                            });
                        } catch (e) {
                            xhr.response = '[]';
                        }
                        
                        // Mock readyState as 4 without trying to set it
                        try {
                            Object.defineProperty(xhr, 'readyState', { 
                                value: 4, 
                                writable: false, 
                                configurable: true 
                            });
                        } catch (e) {
                            // If we can't override readyState, we'll work around it
                        }
                        
                        // Override response header methods
                        xhr.getAllResponseHeaders = function() {
                            return 'content-type: application/json\r\ncontent-length: 2\r\n';
                        };
                        
                        xhr.getResponseHeader = function(name) {
                            if (!name) return null;
                            var lowerName = name.toLowerCase();
                            if (lowerName === 'content-type') return 'application/json';
                            if (lowerName === 'content-length') return '2';
                            return null;
                        };
                        
                        // Fire events manually
                        if (xhr.onreadystatechange) {
                            try {
                                xhr.onreadystatechange();
                            } catch (e) {
                                console.log('Error in onreadystatechange:', e);
                            }
                        }
                        
                        if (xhr.onload) {
                            try {
                                xhr.onload();
                            } catch (e) {
                                console.log('Error in onload:', e);
                            }
                        }
                        
                        if (xhr.onloadend) {
                            try {
                                xhr.onloadend();
                            } catch (e) {
                                console.log('Error in onloadend:', e);
                            }
                        }
                        
                    }, 50);
                    
                    return;
                }
                
                // For non-blocked requests, add monitoring
                var startTime = Date.now();
                var originalOnReadyStateChange = xhr.onreadystatechange;
                
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        self.logRequest({
                            method: xhr._httpMonitorMethod || 'GET',
                            url: xhr._httpMonitorUrl || 'unknown',
                            status: xhr.status,
                            responseSize: xhr.responseText ? xhr.responseText.length : 0,
                            duration: Date.now() - startTime
                        });
                    }
                    
                    if (originalOnReadyStateChange) {
                        originalOnReadyStateChange.apply(this, arguments);
                    }
                };
                
                return originalXHRSend.call(this, body);
            };
            
            // Override fetch
            if (originalFetch) {
                window.fetch = function(input, init) {
                    var url = typeof input === 'string' ? input : input.url;
                    var method = init && init.method ? init.method : 'GET';
                    
                    if (self.shouldBlockRequest(url)) {
                        console.log('Blocking fetch request:', url);
                        self.blockedRequests = self.blockedRequests + 1;
                        self.updateDisplay();
                        
                        return Promise.resolve(new Response('[]', {
                            status: 200,
                            statusText: 'OK',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        }));
                    }
                    
                    var startTime = Date.now();
                    
                    return originalFetch.apply(this, arguments).then(function(response) {
                        var clonedResponse = response.clone();
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
                        return response;
                    }).catch(function(error) {
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
        },
        
        logRequest: function(requestData) {
            requestData.timestamp = Date.now();
            this.requests.unshift(requestData);
            this.requests = this.requests.slice(0, 5);
            
            if (requestData.status === 200) {
                this.lastSuccessTime = Date.now();
            }
            
            this.updateDisplay();
        },
        
        updateDisplay: function() {
            if (!this.displayElement) {
                return;
            }
            
            var html = '<div style="margin-bottom:8px;font-weight:bold;color:#00ff00;">HTTP Monitor - Last 5 Requests:</div>';
            html += '<div style="margin-bottom:5px;color:#ff6666;">Simulated 200 responses for AvailableRegular: ' + this.blockedRequests + '</div>';
            
            var timeSinceSuccess = this.getTimeSinceLastSuccess();
            html += '<div style="margin-bottom:5px;color:#ffff00;">Time since last 200: ' + timeSinceSuccess + 's</div>';
            
            if (this.requests.length === 0) {
                html += '<div style="color:#888;">No requests yet...</div>';
            } else {
                for (var i = 0; i < this.requests.length; i++) {
                    var req = this.requests[i];
                    var statusColor = this.getStatusColor(req.status);
                    var sizeKB = (req.responseSize / 1024).toFixed(1);
                    var url = this.truncateUrl(req.url);
                    
                    html += '<div style="margin-bottom:2px;">';
                    html += '<span style="color:' + statusColor + ';font-weight:bold;">' + req.status + '</span>';
                    html += '<span style="color:#ccc;"> | </span>';
                    html += '<span style="color:#00aaff;">' + req.method + '</span>';
                    html += '<span style="color:#ccc;"> | </span>';
                    html += '<span style="color:#ffaa00;">' + sizeKB + 'KB</span>';
                    html += '<span style="color:#ccc;"> | </span>';
                    html += '<span style="color:#fff;">' + url + '</span>';
                    if (req.error) {
                        html += ' <span style="color:#ff0000;">[ERROR]</span>';
                    }
                    html += '</div>';
                }
            }
            
            this.displayElement.innerHTML = html;
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
            var maxLength = 50;
            if (!url || url.length <= maxLength) return url || 'Unknown URL';
            
            return '...' + url.slice(-(maxLength - 3));
        },
        
        getTimeSinceLastSuccess: function() {
            if (!this.lastSuccessTime) {
                return 'N/A';
            }
            return Math.floor((Date.now() - this.lastSuccessTime) / 1000);
        },
        
        startTimer: function() {
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
            }
            
            var self = this;
            this.updateTimer = setInterval(function() {
                self.updateDisplay();
            }, 1000);
        },
        
        destroy: function() {
            console.log('Destroying HTTP Monitor...');
            
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
                this.updateTimer = null;
            }
            
            if (this.displayElement && this.displayElement.parentNode) {
                this.displayElement.parentNode.removeChild(this.displayElement);
                this.displayElement = null;
            }
            
            delete window.httpMonitor;
            console.log('HTTP Monitor destroyed');
        }
    };
    
    window.httpMonitor.init();
    console.log('HTTP Monitor initialized with 200 response simulation.');
    
})();
