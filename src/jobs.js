document.addEventListener('DOMContentLoaded', () => {
    // Listen for update events
    window.api.onUpdateAvailable(() => {
        document.getElementById('update-status').innerText = 'Update available. Downloading...';
    });

    window.api.onUpdateDownloaded(() => {
        document.getElementById('update-status').innerText = 'Update downloaded. Restart to apply.';
        const restartButton = document.createElement('button');
        restartButton.innerText = 'Restart';
        restartButton.onclick = () => window.api.restartApp();
        document.getElementById('update-status').appendChild(restartButton);
    });

    window.api.onUpdateError((error) => {
        document.getElementById('update-status').innerText = `Update error: ${error}`;
    });

    // Check for updates when the app starts
    window.api.checkForUpdates();
    const token = localStorage.getItem('authToken'); // Get token from local storage
    console.log('Auth Token:', token);
    if (token) {
        // Fetch jobs through IPC
        window.api.fetchJobs(token);

        // Listen for successful job fetch
        window.api.onJobsSuccess((data) => {
            const jobsList = document.getElementById('jobs-list'); // Get the jobs list element
            jobsList.innerHTML = ''; // Clear any existing jobs

            if (data.user_name) {
                document.getElementById('user-name').textContent = data.user_name; // Set the user name from API response
            }
            if (data.code === 200) {
                const chatLink = data.link;
                localStorage.setItem('chatLink', chatLink);
                document.getElementById('chat-icon').addEventListener('click', () => {
                    window.api.openChatUrl(chatLink); // Assuming you handle this in preload.js
                });
                const jobs = Array.isArray(data.data) ? data.data : []; // Fallback to an empty array if undefined

                console.log('Jobs length:', jobs.length);
                
                // Check if there are any jobs in the response
                if (jobs.length === 0) {
                    // Display the message if no jobs are found
                    jobsList.innerHTML = `
                    <li class="border-bottom border-top px-4 pt-3"> 
                        <p class="fs-12 text-secondary mb-2">No Hourly Active Contract found</p> 
                    </li>`;
                } else {
                    // Iterate over the job data and create list items
                    jobs.forEach(job => {
                        const jobItem = document.createElement('li'); // Create new list item
                        jobItem.classList.add('border-bottom', 'border-top', 'px-4', 'pt-3'); // Add classes for styling
                        jobItem.innerHTML = `
                            <div class="float-end fs-12 pb-3">
                                <span>${job.hoursWorked}hrs ${job.minutesWorked}m</span> <!-- Display hours worked -->
                                <div class="progress p-0" style="height:12px">
                                    <div class="progress-bar fs-10" role="progressbar" style="width: ${job.progress}%; height:12px;" aria-valuenow="${job.progress}" aria-valuemin="0" aria-valuemax="100">${job.progress}%</div>
                                </div>
                                <span>of ${job.totalHours}hrs</span> <!-- Display total hours -->
                            </div>
                            <a href="#" class="links-c">${job.title}</a> <!-- Job title link -->
                            <p class="fs-12 text-secondary mb-2">${job.description}</p> <!-- Job description -->
                        `;
                        jobItem.onclick = () => {
                            localStorage.setItem('selectedJob', JSON.stringify(job)); // Store selected job in local storage
                            window.location.href = 'job_detail.html'; // Redirect to job detail page
                        };
                        jobsList.appendChild(jobItem); // Append the new job item to the jobs list
                    });
                }
            } else {
                // Handle other non-success codes here if necessary
                alert('Failed to fetch jobs: ' + data.message); // Alert with specific message from API
            }
        });

        // Listen for job fetch error
        window.api.onJobsError((message) => {
            console.error('Error fetching jobs:', message); // Log any errors
            alert('Error fetching jobs: ' + message); // Alert user
        });
    } else {
        alert('No authentication token found. Please log in.');
        window.location.href = 'login.html'; // Redirect to login if no token
    }
});
