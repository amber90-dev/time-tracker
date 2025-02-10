let interval = null;
let token;
let job;
let startTime = null;
let elapsedTime = 0;
let trackingSession = false;
let screenshotIntervalId = null;
let screenshots = [];
let lastScreenshotTime = null;
let jobWorkDeliveryHourlyBidId = null; // Add this to store the ID
let maxHoursAllowed = 0;
let totalHoursWorked = 0;
let checkHoursInterval = null;

// Function to periodically check if max hours are reached
function checkMaxHoursReached() {
    if (totalHoursWorked >= maxHoursAllowed) {
        alert('You have reached the maximum allowed hours for this job. The tracker will stop automatically.');
        stopTrackingSession();
    }
}

// Request notification permission from the user
function requestNotificationPermission() {
    if (Notification.permission !== "granted") {
        Notification.requestPermission().then((permission) => {
            if (permission !== "granted") {
                console.log("Notification permission denied.");
            }
        });
    }
}

// Show a notification if permission is granted
function showNotification(message) {
    if (Notification.permission === "granted") {
        new Notification('Time Tracker', { body: message });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    token = localStorage.getItem('authToken');
    job = JSON.parse(localStorage.getItem('selectedJob'));

    if (!job) {
        alert('No job selected');
        window.location.href = 'jobs.html';
        return;
    }

    // Fetch job details
    window.api.fetchJobDetails(job.job_id, token);

    // Listen for job detail fetch success
    window.api.onJobDetailsSuccess((data) => {
        if (data.code === 200) {
            document.getElementById('job-title-display').textContent = data.data.title;
            //document.getElementById('job-memo').textContent = data.data.memo;
            document.getElementById('hours-worked-today').textContent = data.data.hoursWorkedToday;
            document.getElementById('hours-worked-week').textContent = data.data.hoursWorkedThisWeek;
            document.getElementById('total-weekly-hours').textContent = data.data.totalWeeklyHours;
            document.getElementById('current-day').textContent = data.data.currentDay;

            const timesheetUrl = data.data.timesheetUrl;
            const timesheetDiv = document.getElementById('timesheet-container');

            // Dynamically set the innerHTML for the timesheet link
            if (timesheetUrl) {
                const timesheetLink = document.createElement('a');
                timesheetLink.textContent = "Access your work log";
                timesheetLink.href = "#";
                timesheetLink.classList.add('btn', 'btn-success', 'bg-green', 'border-0', 'mt-4', 'timesheetURL');  // Add CSS classes

                timesheetLink.addEventListener('click', (e) => {
                    e.preventDefault();  // Prevent the default action
                    window.api.openTimesheetUrl(timesheetUrl);  // Use IPC to call the main process
                });
                timesheetDiv.appendChild(timesheetLink);
            }

            const screenshotPath = data.data.recentScreenshotPath;
            const timeSinceScreenshot = data.data.timeSinceScreenshot;
            const screenshotDiv = document.getElementById('screenshots');
            const timeSinceScreenshotElem = document.getElementById('time-since-screenshot');
            if (screenshotPath) {
                const imgElement = document.createElement('img');
                imgElement.src = screenshotPath;
                imgElement.alt = 'Most Recent Screenshot';
                imgElement.className = 'text-center m-3 mt-0'; // Add any desired class

                imgElement.style.width = '250px';
                imgElement.style.height = 'auto';

                screenshotDiv.appendChild(imgElement);
                timeSinceScreenshotElem.textContent = timeSinceScreenshot; // Show time since screenshot
            } else {
                // If no screenshot is available, display a message
                screenshotDiv.innerHTML = '<p>There is no screenshot yet</p>';
                timeSinceScreenshotElem.textContent = 'No time available';
            }
        } else {
            alert('Failed to fetch job details: ' + data.message);
        }
    });

    // Set initial timer display to 00:00
    document.getElementById('timer').textContent = '00h 00m';

    document.getElementById('mySwitch').addEventListener('change', (event) => {
        const switchElement = event.target;
    
        if (switchElement.checked) {
            if (!trackingSession) {
                startTrackingSession();
            }
        } else {
            if (trackingSession) {
                const confirmed = stopTrackingSession();
                if (!confirmed) {
                    switchElement.checked = true;
                }
            }
        }
    });

    //requestNotificationPermission();  // Request notification permission on page load
});

// Start tracking session
function startTrackingSession() {
    if (!trackingSession) {
        trackingSession = true;

        startTime = new Date(); // Set start time
        window.api.setStartTime(startTime.toISOString())
        .then((response) => {
            if (!response.success) {
                console.error('Failed to set start time:', response.message);
            }
        });

        interval = setInterval(updateTimer, 1000); // Start updating the timer every second

        // Fetch max allowed hours from job details
        const job = JSON.parse(localStorage.getItem('selectedJob'));
        maxHoursAllowed = job.totalHours || 0; // Ensure total hours exist in the job data
        totalHoursWorked = job.hoursWorked + job.minutesWorked / 60; // Convert to hours

        console.log(`Max allowed hours: ${maxHoursAllowed}, Hours worked: ${totalHoursWorked}`);

        checkHoursInterval = setInterval(checkMaxHoursReached, 60000);  // Check every 60 seconds
        // Notify the backend to start tracking
        window.api.startTracking(token, job.job_id)
            .then((response) => {
                if (response.success) {
                    showNotification("Tracking session started!");
                    console.log("Tracking started successfully");
                    jobWorkDeliveryHourlyBidId = response.job_work_delivery_hourly_bid_id;
                    console.log("Stored job_work_delivery_hourly_bid_id:", jobWorkDeliveryHourlyBidId);
                } else {
                    handleTrackingError(response.error);
                }
            })
            .catch((error) => {
                handleTrackingError(error.message);
            });
    }
}

function handleTrackingError(errorMessage) {
    console.error('Error starting tracking:', errorMessage);

    // Show error message on the screen
    const timesheetContainer = document.getElementById('error-div');
    timesheetContainer.innerHTML = `
        <div class="alert alert-danger text-center mt-3">
            ${errorMessage}
        </div>
    `;

    // Disable the tracking toggle switch
    const toggleSwitch = document.getElementById('mySwitch');
    toggleSwitch.checked = false;
    toggleSwitch.disabled = true;
    trackingSession = false;
    // Show notification
    showNotification(errorMessage);
}

function stopTrackingSession() {
    if (trackingSession) {
        // Capture elapsed time
        elapsedTime = Math.floor((new Date() - startTime) / 1000);

        // Enable memo input for user
        const memoInput = document.getElementById('job-memo');
        const memoError = document.getElementById('memo-error');
        // Check memo length
        const memoText = memoInput.value.trim();
        const wordCount = memoText.split(/\s+/).filter(word => word.length > 0).length;

        // Validate memo length
        if (wordCount >= 10 && wordCount <= 30) {
            // If valid memo, stop tracking officially
            trackingSession = false;
            clearInterval(interval);
            clearInterval(checkHoursInterval); // Stop the max hours checker

            // Reset the timer display
            document.getElementById('timer').textContent = '00h 00m';

            // Submit the memo once it's valid
            window.api.stopTracking(token, jobWorkDeliveryHourlyBidId, elapsedTime, memoText)
                .then((response) => {
                    if (response.success) {
                        console.log("Tracking stopped successfully.");
                        memoError.style.display = 'none';  // Lock memo input after submission
                        memoInput.style.border = '';
                        memoInput.value = "";
                    } else {
                        console.error("Error stopping tracking:", response.error);
                    }
                })
                .catch((error) => {
                    console.error("Error stopping tracking:", error);
                });
        } else {
           // If memo is invalid, show error message and focus on memo input
           memoError.style.display = 'block';
           memoInput.style.border = '2px solid red'; // Highlight with red border
           return false; 
        }
        return true;  // Tracking stopped
    }

    return false; // No active tracking session to stop
}

// Update the timer display
function updateTimer() {
    const now = new Date();
    elapsedTime = Math.floor((now - startTime) / 1000);  // Calculate elapsed time in seconds

    const hours = Math.floor(elapsedTime / 3600);
    const minutes = Math.floor((elapsedTime % 3600) / 60);
    document.getElementById('timer').textContent = `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
}
// Round down to the nearest 10-minute block
function roundDownToNearest10Minutes(date) {
    const rounded = new Date(date);
    rounded.setMinutes(Math.floor(rounded.getMinutes() / 10) * 10, 0, 0);  // Round down to nearest 10 minutes
    return rounded;
}

// Round up to the nearest 10-minute block
function roundUpToNearest10Minutes(date) {
    const roundedDate = new Date(date);
    const minutes = roundedDate.getMinutes();
    roundedDate.setMinutes(Math.ceil(minutes / 10) * 10);
    roundedDate.setSeconds(0);
    roundedDate.setMilliseconds(0);
    return roundedDate;
}


window.api.receive('screenshot-captured', (screenshotData) => {
    console.log("Receiving screenshot data");
    showNotification("Screenshot Captured!");
    const { image, timestamp } = screenshotData;

    // Update the screenshot and timestamp
    screenshots = [{ image, timestamp: new Date(timestamp) }];
    lastScreenshotTime = new Date(timestamp);

    // Update the UI  
    displayScreenshots();
    
});

function displayScreenshots() {
    const screenshotsContainer = document.getElementById('screenshots');
    const timeSinceScreenshotContainer = document.getElementById('time-since-screenshot');

   if (screenshots.length) {
        // Update the screenshots display
        screenshotsContainer.innerHTML = '';

        screenshots.forEach(s => {
            const imgElement = document.createElement('img');
            imgElement.src = s.image;
            imgElement.alt = 'Screenshot';
            imgElement.style.width = '250px';
            imgElement.style.height = 'auto';
            screenshotsContainer.appendChild(imgElement);
        });

        // Update the lastScreenshotTime
        lastScreenshotTime = new Date(screenshots[screenshots.length - 1].timestamp);   

        // Calculate and update the time since the last screenshot
        displayTimeSinceScreenshot();
       
    } else {
        // Default message when no screenshots exist
        screenshotsContainer.innerHTML = '<p>There is no screenshot yet</p>';
        timeSinceScreenshotContainer.innerHTML = 'No screenshots taken yet.';
    }
}

function displayTimeSinceScreenshot() {

    const timeDisplay = document.getElementById('time-since-screenshot');
    if (!timeDisplay || !lastScreenshotTime) return; 

    const now = new Date();
    const diffMs = now - lastScreenshotTime; // difference in ms

    if (diffMs < 0) {
      // In case the 'lastScreenshotTime' is in the future (edge case)
      timeDisplay.textContent = 'Invalid time.';
      return;
    }
    // Convert difference to total minutes
    const diffMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;

    // Display only hours and minutes
    timeDisplay.textContent = `${hours}h ${minutes}m ago`;
}


function startPeriodicTimeUpdate() {
    setInterval(displayTimeSinceScreenshot, 1000); // Update every second
}

// Call the periodic update function when the page loads
startPeriodicTimeUpdate();

function updateWordCount() {
    const memoInput = document.getElementById('job-memo');
    const wordCountElement = document.getElementById('word-count');
    const maxWords = 30;
    const minWords = 10;

    // Trim input and split words based on spaces, filtering empty values
    const words = memoInput.value.trim().split(/\s+/).filter(word => word.length > 0);
    const currentWordCount = words.length;

    // Display the word count
    wordCountElement.textContent = `${currentWordCount} / ${minWords}-${maxWords} words`;

    // Check if word count is within the required range
    if (currentWordCount < minWords || currentWordCount > maxWords) {
        wordCountElement.style.color = 'red';  // Show error in red
    } else {
        wordCountElement.style.color = 'green';  // Show success in green
    }
}

document.getElementById('back-button').addEventListener('click', function(event) {
    if (trackingSession) {
        alert('You cannot go back while the tracker is running. Please stop the session first.');
        event.preventDefault();  // Prevent the navigation action
    } else {
        window.location.href = 'jobs.html';  // Navigate back if tracking is not active
    }
});