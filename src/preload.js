const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    send: (channel, data) => {
        const validChannels = [
            'login', 
            'fetch-jobs', 
            'fetch-job-details', 
            'capture-and-store-screenshot', 
            'open-settings-window', 
            'close-settings-window',
            'start-tracking', 
            'stop-tracking',
            'log-activity',
            'logout'  
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    receive: (channel, func) => {
        const validChannels = [
            'login-success', 
            'login-error', 
            'jobs-success', 
            'jobs-error', 
            'job-details-success', 
            'job-details-error',
            'tracking-started',  
            'tracking-stopped',  
            'tracking-error'  ,
            'screenshot-captured',
            'update_available', // Add this
            'update_downloaded', // Add this
            'update_error' // Add this
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },
    invoke: (channel, data) => {
        const validChannels = ['capture-and-store-screenshot'];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    },
    fetchJobs: (token) => ipcRenderer.send('fetch-jobs', token),
    onJobsSuccess: (func) => ipcRenderer.on('jobs-success', (event, ...args) => func(...args)),
    onJobsError: (func) => ipcRenderer.on('jobs-error', (event, ...args) => func(...args)),
    fetchJobDetails: (jobId, token) => ipcRenderer.send('fetch-job-details', jobId, token),
    onJobDetailsSuccess: (func) => ipcRenderer.on('job-details-success', (event, ...args) => func(...args)),
    onJobDetailsError: (callback) => ipcRenderer.on('job-details-error', callback),
    startTracking: (token, jobId) => ipcRenderer.invoke('start-tracking',  token, jobId ),
    stopTracking: (token, jobId, elapsedTime,memoInput) => ipcRenderer.invoke('stop-tracking', token, jobId, elapsedTime,memoInput),

    onTrackingError: (func) => ipcRenderer.on('tracking-error', (event, ...args) => func(...args)), // Added to handle tracking errors
    captureAndStoreScreenshot: (token, intervalId) => {
        return ipcRenderer.invoke('capture-and-store-screenshot',  token, intervalId );
    },
    logActivity: (token,keyboardActivity, mouseActivity) => ipcRenderer.invoke('log-activity', token,keyboardActivity, mouseActivity),
    setStartTime: (time) => ipcRenderer.invoke('set-start-time', time),
    getStartTime: () => ipcRenderer.invoke('get-start-time'),
    isOnline: () => navigator.onLine,
    openTimesheetUrl: (url) => ipcRenderer.send('open-timesheet-url', url),
    openChatUrl: (url) => ipcRenderer.send('open-chat-url', url),
    // Auto-update methods
    checkForUpdates: () => ipcRenderer.send('check-for-updates'),
    restartApp: () => ipcRenderer.send('restart-app'),
    onUpdateAvailable: (func) => ipcRenderer.on('update_available', (event, ...args) => func(...args)),
    onUpdateDownloaded: (func) => ipcRenderer.on('update_downloaded', (event, ...args) => func(...args)),
    onUpdateError: (func) => ipcRenderer.on('update_error', (event, ...args) => func(...args)),
});
