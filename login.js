// login.js
const { ipcRenderer } = require('electron');

document.getElementById('loginForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    ipcRenderer.send('login', { username, password });
});

ipcRenderer.on('login-error', (event, message) => {
    document.getElementById('error').textContent = message.error;
});
