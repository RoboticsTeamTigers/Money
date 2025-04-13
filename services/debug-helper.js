/**
 * Debug Helper - Add this to your page to help diagnose issues
 * Include with: <script src="debug-helper.js"></script>
 */

(function() {
    // Create debug panel
    const debugPanel = document.createElement('div');
    debugPanel.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        background: rgba(0,0,0,0.8);
        color: #00ff00;
        padding: 10px;
        border-radius: 5px;
        font-family: monospace;
        font-size: 12px;
        z-index: 10000;
        max-width: 400px;
        max-height: 300px;
        overflow: auto;
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
    `;
    debugPanel.innerHTML = '<h3>Debug Panel</h3><div id="debug-content"></div>';
    
    // Only show in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        document.body.appendChild(debugPanel);
    }
    
    const debugContent = debugPanel.querySelector('#debug-content');
    
    // Override console.log
    const originalLog = console.log;
    const originalError = console.error;
    
    console.log = function() {
        originalLog.apply(console, arguments);
        
        if (debugContent) {
            const message = Array.from(arguments).map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch (e) {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
            
            const logLine = document.createElement('div');
            logLine.textContent = `> ${message}`;
            debugContent.appendChild(logLine);
            debugContent.scrollTop = debugContent.scrollHeight;
        }
    };
    
    console.error = function() {
        originalError.apply(console, arguments);
        
        if (debugContent) {
            const message = Array.from(arguments).map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch (e) {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
            
            const errorLine = document.createElement('div');
            errorLine.style.color = '#ff5555';
            errorLine.textContent = `ERROR: ${message}`;
            debugContent.appendChild(errorLine);
            debugContent.scrollTop = debugContent.scrollHeight;
        }
    };
    
    // Add button to clear logs
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = `
        background: #333;
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 3px;
        cursor: pointer;
        margin-top: 10px;
    `;
    clearBtn.addEventListener('click', () => {
        debugContent.innerHTML = '';
    });
    
    debugPanel.appendChild(clearBtn);
    
    // Log page load
    console.log(`Page loaded: ${window.location.pathname}`);
    
    // Check for TensorFlow.js
    setTimeout(() => {
        if (window.tf) {
            console.log('TensorFlow.js loaded ✓');
        } else {
            console.error('TensorFlow.js not loaded ✗');
        }
        
        if (window.Chart) {
            console.log('Chart.js loaded ✓');
        } else {
            console.error('Chart.js not loaded ✗');
        }
    }, 1000);
})();
