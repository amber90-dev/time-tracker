const { app, BrowserWindow, ipcMain, Tray, Notification, Menu, desktopCapturer, shell , powerMonitor, dialog } = require('electron');
// const { autoUpdater } = require('electron-updater');
const { GlobalKeyboardListener } = require('node-global-key-listener');
const path = require('path');
const fs = require('fs');
// const dotenv = require('dotenv');
const dns = require('dns');
const sharp = require('sharp');
let fetch; // Declare fetch here
let tray = null;  // Declare tray icon
let mainWindow = null;
let settingsWindow = null;
let isTracking = false; // Tracking state
let isLoggedIn = false;
let logIntervalId = null;
let sendLogsIntervalId = null;
let userStartMinute = null;
let keyboardActivity = 0;
let mouseActivity = 0;
let startTime = null;
let userStartTime = null;
let jobWorkDeliveryHourlyBidId = null;
const IDLE_THRESHOLD = 600; 

// Use app.getPath('userData') to get a suitable directory
const userDataPath = app.getPath('userData');
const logBuildFilePath = path.join(userDataPath, 'startup.log');
// const envFilePath = path.join(isPackaged ? process.resourcesPath : __dirname, '../.env.local');
console.log(process.env.NODE_ENV);
// Backend API base URL. Set WORKTRACK_API_URL to point the app at your server.
let API_URL = process.env.WORKTRACK_API_URL || "https://api.example.com/api"
if (process.env.NODE_ENV === 'development')
    API_URL = process.env.WORKTRACK_API_URL || "http://localhost:8000/api"

console.log('API URL:', API_URL);
// 1) Single-instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // If another instance is already running, quit this one
    app.quit();
} else {
    // We are the primary instance
    app.on('second-instance', (event, argv) => {
        // This is fired when a second instance is launched with protocol args
        if (process.platform === 'win32' && argv.length > 1) {
            const protocolUrl = argv.find(arg => arg.startsWith('alphatimetracker://'));
            if (protocolUrl) {
                handleCustomProtocol(protocolUrl);
            }
        }
        // Focus existing window
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        showNotification('Application Already Running', 'The application is already open.');
    });

    app.whenReady().then(async () => {
        // Register the protocol client
        app.setAsDefaultProtocolClient('worktrack');
        await initFetch();
        createWindow();
        initializeKeyboardListener();
        // Initialize auto-updater
        // autoUpdater.checkForUpdatesAndNotify();

        // If the app is freshly launched by the protocol (not second-instance)
        if (process.platform === 'win32') {
            const protocolUrl = process.argv.find(arg => arg.startsWith('worktrack://'));
            if (protocolUrl) {
                handleCustomProtocol(protocolUrl);
            }
        }
        
    });
}

function uninstallApplication() {
    const installPath = path.join(app.getPath('appData'), 'worktrack'); // Replace with your app's installation path

    try {
        // Delete the installation directory
        fs.rmdirSync(installPath, { recursive: true });
        console.log('Application uninstalled successfully.');
    } catch (err) {
        console.error('Error uninstalling the application:', err.message);
    }
}

function isApplicationInstalled() {
    const installPath = path.join(app.getPath('appData'), 'worktrack'); // Replace with your app's installation path
    const configFile = path.join(installPath, 'config.json'); // Example: Check for a specific file

    console.log('Checking installation path:', installPath); // Debugging
    console.log('Folder exists:', fs.existsSync(installPath)); // Debugging
    console.log('Config file exists:', fs.existsSync(configFile)); // Debugging

    return fs.existsSync(installPath) && fs.existsSync(configFile); // Check if both the folder and file exist
}

function promptUserToUninstall() {
    const response = dialog.showMessageBoxSync({
        type: 'question',
        buttons: ['Yes', 'No'],
        message: 'You have already installed the application.',
        detail: 'Do you want to uninstall it?',
    });

    return response === 0; // 0 = Yes, 1 = No
}   

// Auto-updater events
// autoUpdater.on('update-available', () => {
//     log.info('Update available. Downloading...');
//     mainWindow.webContents.send('update_available');
// });

// autoUpdater.on('update-downloaded', () => {
//     log.info('Update downloaded. Restart to apply.');
//     mainWindow.webContents.send('update_downloaded');
// });

// autoUpdater.on('error', (error) => {
//     log.error('Error during auto-update:', error);
//     mainWindow.webContents.send('update_error', error.message);
// });

// // IPC handler to restart the app and apply the update
// ipcMain.on('restart_app', () => {
//     autoUpdater.quitAndInstall();
// });

function handleCustomProtocol(url) {
    console.log('Custom protocol invoked with URL:', url);
    if (mainWindow) {
        mainWindow.focus();
        mainWindow.webContents.send('protocol-invoked', url);
    }
}

app.on('browser-window-blur', () => {
    setTimeout(() => {
        BrowserWindow.getFocusedWindow()?.focus();
    }, 500);
});

const logFilePath = path.join(app.getPath('userData'), 'loggedMinutes.json');
let loggedMinutes = new Set();
const activityLog = [];
let notificationsEnabled = true;

async function initFetch() {
    fetch = (await import('node-fetch')).default;
}

function readLoggedMinutes() {
    try {
        const data = fs.readFileSync(logFilePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return []; // Return empty array if file does not exist or is unreadable
    }
}

function writeLoggedMinutes(loggedMinutes) {
    try {
        fs.writeFileSync(logFilePath, JSON.stringify(loggedMinutes, null, 2));
        console.log('Logged to file:', JSON.stringify(loggedMinutes, null, 2));
    } catch (err) {
        console.error('Error writing to log file:', err.message);
    }
}

// Notifications
function showNotification(title, body) {
    if (notificationsEnabled) {
        new Notification({ title, body }).show();
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 575,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
            nodeIntegration: false,
        },
        autoHideMenuBar: false,
        menuBarVisible: true,
    });

    mainWindow.loadFile('src/views/login.html');

    ipcMain.on('get-activity', (event, arg) => {
        event.reply('activity-data', { activityLevel: arg });
    });

    mainWindow.on('close', (event) => {
        if (isLoggedIn) {
            event.preventDefault();  // Prevent the window from closing
            mainWindow.hide();  // Hide the window instead of closing
            createTray();  // Minimize to tray
        } else {
            app.quit();  // Exit app if not logged in or not tracking
        }
    });
    // Start idle detection after mainWindow is created
    startIdleDetection();
}

function createTray() {
    if (tray) return;  // Tray already exists, no need to create a new one
    tray = new Tray(
        path.join(
            getAssetPath(),
            process.platform === 'darwin' ? 'trayIconTemplate.png' : 'trayIcon.png'
        )
    );
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show',
            click: () => mainWindow.show(),
            
        },
        {
            label: 'Quit',
            click: () => {
                isTracking = false;
                isLoggedIn = false;
                app.quit();  // Quit the app when clicking 'Quit'
            },
        },
    ]);

    tray.setToolTip('Time Tracker');
    tray.setContextMenu(contextMenu);
}

// Idle detection logic using Electron's powerMonitor
function startIdleDetection() {
    if (!mainWindow) {
        console.error('mainWindow is not defined');
        return;
    }
    let lastActivityTime = Date.now();

    // Track keyboard and mouse activity
    const activityListener = () => {
        lastActivityTime = Date.now();
    };

    mainWindow.on('focus', activityListener);
    mainWindow.on('mousemove', activityListener);
    mainWindow.on('keydown', activityListener);
}

// Handle system-level idle states (screen lock, sleep, hibernation)
powerMonitor.on('suspend', () => {
    console.log('System is going to sleep. Pausing tracker...');
    pauseTracking();
});

powerMonitor.on('resume', () => {
    console.log('System has resumed. Resuming tracker...');
    resumeTracking();
});

powerMonitor.on('lock-screen', () => {
    console.log('Screen is locked. Pausing tracker...');
    pauseTracking();
});

powerMonitor.on('unlock-screen', () => {
    console.log('Screen is unlocked. Resuming tracker...');
    resumeTracking();
});

function pauseTracking() {
    if (isTracking) {
        isTracking = false;
        clearInterval(logIntervalId);
        clearInterval(sendLogsIntervalId);
        showNotification('Tracker Paused', 'The tracker has been paused due to inactivity.');
    }
}

function resumeTracking() {
    if (!isTracking) {
        isTracking = true;
        startActivityLogging(token, jobWorkDeliveryHourlyBidId);
        showNotification('Tracker Resumed', 'The tracker has resumed.');
    }
}

// Start idle detection when the app is ready
app.whenReady().then(() => {
    startIdleDetection();
});


ipcMain.handle('set-start-time', (event, time) => {
    startTime = new Date(time); // Set the startTime
    console.log(`Start time set to: ${startTime}`);
    return { success: true };
});

ipcMain.handle('get-start-time', () => {
    if (!startTime) {
        return { success: false, message: 'Start time is not set' };
    }
    return { success: true, startTime };
});


ipcMain.on('open-timesheet-url', (event, timesheetUrl) => {
    if (timesheetUrl) {
        console.log(timesheetUrl);
        shell.openExternal(timesheetUrl);  // This opens the URL in the default browser
    } else {
        console.error('No timesheet URL available');
    }
})
ipcMain.on('open-chat-url', (event, url) => {
    shell.openExternal(url);  // Opens the chat link in the system's default browser
});
// app.whenReady().then(async () => {
//     const isDefault = app.setAsDefaultProtocolClient('alphatimetracker');
//     console.log('Custom protocol registration status:', isDefault);

//     await initFetch();
//     createWindow();
//     initializeKeyboardListener();
// });


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        globalKeyboardListener.stopListening();
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

function createSettingsWindow() {
    if (!settingsWindow) {
        settingsWindow = new BrowserWindow({
            width: 300,
            height: 300,
            frame: false,
            resizable: false,
            parent: mainWindow,
            modal: true,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                enableRemoteModule: false,
            },
        });

        settingsWindow.loadFile('src/views/settings-window.html');
        ipcMain.on('close-settings-window', () => {
            settingsWindow.close(); // This closes the settings window
        });
        settingsWindow.on('closed', () => {
            settingsWindow = null;
        });
    }
}
ipcMain.on('open-settings-window', createSettingsWindow);
ipcMain.on('toggle-notifications', (event, value) => { notificationsEnabled = value; });
ipcMain.on('logout', () => {
    console.log('Logout requested from settings window');

    if (isTracking) {
        clearInterval(logIntervalId);
        clearInterval(sendLogsIntervalId);
        isTracking = false;  // Reset the tracking state
        activityLog = [];  // Clear the activity log
    }
    isLoggedIn = false;
    isTracking = false;

    if (settingsWindow) {
        settingsWindow.close();
    }

    mainWindow.webContents.executeJavaScript('localStorage.clear()');

    mainWindow.loadFile('src/views/login.html');
    app.quit();
});

// Keyboard and mouse activity tracking logic
function initializeKeyboardListener() {
    const globalKeyboardListener = new GlobalKeyboardListener();

    globalKeyboardListener.addListener((e) => {
        if (!isTracking) {
            return;  // Skip logging if tracking is not enabled
        }
        if (e.rawKey && e.rawKey._nameRaw) {
            const keyName = e.rawKey._nameRaw;

            // Check if the event corresponds to a mouse button (VK_BUTTON or VL_Button)
            if (keyName === "VK_LBUTTON" || keyName === "VL_RBUTTON") {
                mouseActivity++;
            } else {
                if (e.state === "DOWN") {
                    keyboardActivity++;
                }
            }
        }
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (isTracking && (input.type === 'mouseDown' || input.type === 'mouseMove')) {
            mouseActivity++;
        }
    });
}

// Handle login API
ipcMain.on('login', async (event, credentials) => {
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials),
        });

        if (!response.ok) throw new Error(await response.text() || 'Invalid login credentials');

        const data = await response.json();
        const token = data.data.access_token;
        isLoggedIn = true;
        event.sender.send('login-success', token);
        mainWindow.loadFile('src/views/jobs.html');
    } catch (error) {
        console.error('Login error:', error.message);
        event.sender.send('login-error', error.message);
    }
});

ipcMain.on('fetch-jobs', async (event, token) => {
    try {
        const response = await fetch(`${API_URL}/user/jobs`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) throw new Error(await response.text() || 'Error fetching jobs');

        const data = await response.json();
        event.sender.send('jobs-success', data);
    } catch (error) {
        event.sender.send('jobs-error', error.message);
    }
});

ipcMain.on('fetch-job-details', async (event, jobId, token) => {
    try {
        const response = await fetch(`${API_URL}/user/jobs/${jobId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) throw new Error(await response.text() || 'Error fetching job details');

        const data = await response.json();
        event.sender.send('job-details-success', data);
    } catch (error) {
        event.sender.send('job-details-error', error.message);
    }
});

ipcMain.handle('start-tracking', async (event, token, jobId) => {
    try {
        if (!token) throw new Error('Missing token');
        isTracking = true;

        console.log('Starting tracking for job:', jobId);

        const response = await fetch(`${API_URL}/user/start-tracking`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                job_id: jobId,
                timezone: 'local', // Only timezone is sent
            }),
        });

        // if (!response.ok) {
        //     const errorText = await response.text();
        //     if (response.status === 409) {
        //         throw new Error(
        //             errorText.message
        //         );
        //     }

        //     throw new Error(errorText.message || 'Failed to start tracking');
        // }
        if (!response.ok) {
            const errorData = await response.json();  // Parse JSON response

            if (response.status === 409) {
                console.error('Conflict error during tracking start:', errorData);

                // Show alert message to user
                //alert(errorData.message);
                isTracking = false;
                return { success: false, error: errorData.message };
            }

            throw new Error(errorData.message || 'Failed to start tracking');
        }

        const data = await response.json();
        jobWorkDeliveryHourlyBidId = data.data.job_work_delivery_hourly_bid_id;
        console.log('Started Tracking with Job Work Delivery Hourly Bid ID:', jobWorkDeliveryHourlyBidId);

        startActivityLogging(token, jobWorkDeliveryHourlyBidId);

        return { success: true, job_work_delivery_hourly_bid_id: jobWorkDeliveryHourlyBidId };
    } catch (error) {
        console.error('Error starting tracking:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-tracking', async (event, token, jobId, elapsedTime, memoInput) => {
    isTracking = false;
    console.log("stop tracking", jobId);
    clearInterval(logIntervalId);
    try {
        const requestBody = {
            job_work_delivery_hourly_bid_id: jobId,
            elapsed_time: elapsedTime,
            activity: activityLog,
            memoInput: memoInput
        };
        console.log(requestBody);


        // Sending request to stop tracking
        const response = await fetch(`${API_URL}/user/stop-tracking`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) throw new Error(await response.text() || 'Failed to stop tracking');

        activityLog.splice(0); // Clear activity log
        loggedMinutes = new Set();
        writeLoggedMinutes([]); // Clear file logs

        return { success: true, data: await response.json() };

    } catch (error) {
        console.error('Error stopping tracking:', error);
        return { success: false, error: error.message };
    }
});

function startActivityLogging(token, jobWorkDeliveryHourlyBidId) {
    if (logIntervalId) clearInterval(logIntervalId);
    if (sendLogsIntervalId) clearInterval(sendLogsIntervalId);

    console.log('Starting activity logging for job:', jobWorkDeliveryHourlyBidId);
    const now = new Date();
    userStartTime = now;
    userStartMinute = now.getMinutes();

    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();

    // Instead of your current delayToNext10MinuteMark, do:
    const remainder = minutes % 10;
    const minutesToNextBoundary = remainder === 0 ? 10 : (10 - remainder);

    // Construct a new Date with the same seconds & milliseconds
    const boundaryDate = new Date(now);
    boundaryDate.setMinutes(minutes + minutesToNextBoundary);
    boundaryDate.setSeconds(seconds);
    boundaryDate.setMilliseconds(milliseconds);

    const delayToNext10MinuteMark = boundaryDate.getTime() - now.getTime();
    console.log('Delay to next 10-minute mark:', delayToNext10MinuteMark,
        '| boundaryDate:', boundaryDate.toLocaleTimeString());

    // 4) Log activity every minute (unchanged)
    logIntervalId = setInterval(() => {
        if (!isTracking) return;
        logMinuteActivityToFile(jobWorkDeliveryHourlyBidId);
    }, 60 * 1000); // Every minute

    setTimeout(() => {
        if (!isTracking) return;

        // Wait an extra 1 or 2 seconds so the "every minute" logger
        // can fire at xx:20:57 before boundary sends logs.
        setTimeout(() => {
            handleBoundaryLog(token, jobWorkDeliveryHourlyBidId);

            // Then setInterval every 10 minutes...
            sendLogsIntervalId = setInterval(() => {
                if (!isTracking) return;
                handleBoundaryLog(token, jobWorkDeliveryHourlyBidId);
            }, 10 * 60 * 1000);

        }, 2000); // 2-second buffer

    }, delayToNext10MinuteMark);
}

function handleBoundaryLog(token, jobWorkDeliveryHourlyBidId) {
    const now = new Date();
    const currentMinute = now.getMinutes();

    // Ensure logs include up to and including the boundary time
    logMinuteActivityToFile(jobWorkDeliveryHourlyBidId); // Log the current minute's activity
    console.log("Now:", now.toString(), "| currentMinute:", currentMinute);

    // Keep your existing timeToNextBoundary
    const remainder = currentMinute % 10;
    console.log("Reminder",remainder);
    const timeToNextBoundary = remainder === 0 ? 0 : (10 - remainder);
    console.log("timeToNextBoundary", timeToNextBoundary);

    if (timeToNextBoundary === 0) {
        // xx:10, xx:20, xx:30
        captureScreenshotAndLogs(token, jobWorkDeliveryHourlyBidId, true);
    }else if(timeToNextBoundary <= 1) {
        // like work started before 1 minute e,g user starts work at 12:09
        captureScreenshotAndLogs(token, jobWorkDeliveryHourlyBidId, false);
    }
}

async function logMinuteActivityToFile(jobWorkDeliveryHourlyBidId) {
    if (!isTracking) {
        console.log('Skipping log as tracking is inactive.');
        return; // Do nothing if tracking is inactive
    }
    try {
        const now = new Date();
        const currentMinute = now.getMinutes();

        // Call getStartTime using the ipcMain.handle
        const response = await mainWindow.webContents.executeJavaScript("window.api.getStartTime()");
        if (!response.success) {
            console.error(response.message);
            return;
        }

        const startTime = new Date(response.startTime);
        // Ensure logging starts from the next minute after the job start
        if (!startTime || now <= startTime) {
            console.log(`Skipping log for the job's start minute: ${currentMinute}`);
            return;
        }

        if (loggedMinutes.has(currentMinute)) {
            console.log(`Skipping log for already logged minute: ${currentMinute}`);
            return;
        }

        loggedMinutes.add(currentMinute);

        // Read existing logs, push new log, and write back
        const existingLogs = readLoggedMinutes();
        existingLogs.push({
            job_work_delivery_hourly_bid_id: jobWorkDeliveryHourlyBidId,
            time: now.toISOString(),
            keyboardActivity: keyboardActivity || 0,
            mouseActivity: mouseActivity || 0,
        });

        keyboardActivity = 0;
        mouseActivity = 0;

        writeLoggedMinutes(existingLogs);

        //console.log('Logged activity:', logEntry); // Log the activity explicitly.
    } catch (error) {
        console.error('Error logging activity:', error.message);
    }
}

async function captureScreenshotAndLogs(token, jobWorkDeliveryHourlyBidId, shouldCaptureScreenshot) {
    if (!isTracking) {
        console.warn('Tracking is not active. Skipping logs and screenshot.');
        return;
    }
    try {
        const logsFromFile = readLoggedMinutes();
       
        if (shouldCaptureScreenshot) {
            console.log('Capturing screenshot for this interval.');

            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 1920, height: 1080 },
            });

            if (sources.length === 0) throw new Error('No screen sources available');

            const screenshotBuffer = Buffer.from(sources[0].thumbnail.toPNG());

            // Compress and Convert to Base64
            const compressedImage = await sharp(screenshotBuffer)
                .resize(920, 470) // Resize
                .jpeg({ quality: 70 })  // Reduce quality
                .toBuffer();
            const screenshotBase64 = compressedImage.toString('base64');
            const screenshotDataURL = `data:image/jpeg;base64,${screenshotBase64}`;
            if (logsFromFile.length > 0) {
                const lastLogIndex = logsFromFile.length - 1;
                const lastLogTime = new Date(logsFromFile[lastLogIndex].time);
                const firstLogTime = new Date(logsFromFile[0].time);

                // Calculate elapsed time in seconds from first log to last one
                const elapsedTime = Math.floor((lastLogTime - firstLogTime) / 1000);

               // Update the last log entry with screenshot and elapsed_time
                logsFromFile[lastLogIndex] = {
                    ...logsFromFile[lastLogIndex], // Preserve existing properties
                    screenshot: screenshotDataURL,
                    elapsed_time: elapsedTime
                };

                console.log('Updated last log entry:', logsFromFile[lastLogIndex]);

                // Write updated logs to file
                writeLoggedMinutes(logsFromFile);
            }
            //formData.append('screenshot', new Blob([screenshot], { type: 'image/png' }));
           
            // Send the captured screenshot to the renderer process
            mainWindow.webContents.send('screenshot-captured', {
                image: screenshotDataURL,
                timestamp: new Date().toISOString(),
            });
        } else {
            console.log('Sending logs without screenshot.');
        }
        // Check internet connectivity before proceeding
        const isOnline = await checkInternetConnectivity();
        if (!isOnline) {
            showNotification('Internet Disconnected', 'Please reconnect to the internet to sync your work.');
            console.error('Internet is not available. Storing data locally.');
            return;
        }
        console.log('Logs will be send:', logsFromFile);
         // Prepare form data
         const formData = new FormData();
         formData.append('job_work_delivery_hourly_bid_id', jobWorkDeliveryHourlyBidId);
         formData.append('logs', JSON.stringify(logsFromFile));
 
        // Send request to the server
        const response = await fetch(`${API_URL}/user/store-screenshot`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });

        if (!response.ok) throw new Error(`Failed to store data. Status: ${response.status}`);

        const data = await response.json();
        console.log('Data successfully sent:', data);
        // Check if API response contains an updated job_work_delivery_hourly_bid_id
        if (data.job_work_delivery_hourly_bid_id) {
            const existingJobWorkId = jobWorkDeliveryHourlyBidId;
            console.log("existingJobWorkId",existingJobWorkId);
            if (data.job_work_delivery_hourly_bid_id !== existingJobWorkId) {
                jobWorkDeliveryHourlyBidId = data.job_work_delivery_hourly_bid_id
                console.log("new one jobWorkDeliveryHourlyBidId",jobWorkDeliveryHourlyBidId);
            }
        }
        // Clear logs after successful upload
        loggedMinutes.clear();
        writeLoggedMinutes([]);
       
    } catch (error) {
        console.error('Error capturing and storing logs:', error.message);
    }
}
// Function to check internet connectivity using Node.js DNS module
async function checkInternetConnectivity() {
    return new Promise((resolve) => {
        dns.lookup('google.com', (err) => {
            if (err && err.code === 'ENOTFOUND') {
                resolve(false); // No internet connection
            } else {
                resolve(true); // Internet is available
            }
        });
    });
}